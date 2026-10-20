import { useEffect, useId } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import {
  LOCATIONS,
  escapeLike,
  isLow,
  ITEM_COLUMNS,
  itemsKeys,
  movementsKeys,
  type Kind,
  type Location,
} from '@/lib/items';

export type PaymentSource = Database['public']['Enums']['payment_source'];

export type PayerKind = 'cassa' | 'consigliere' | 'membro' | 'persona' | 'nuova';

export type PayerChoice = { kind: PayerKind; ref?: string | null; name?: string };

export type PayerOption = {
  kind: Exclude<PayerKind, 'cassa' | 'nuova'>;
  id: string;
  name: string;
  user_id: string | null;
};

export type PaymentInput = {
  payer: PayerChoice;
  itemIds: string[];
  amountCents: number | null;
  shop: string;
  paidOn: string;
};

const payerArgs = (p: PayerChoice) => ({
  p_payer_kind: p.kind,
  p_payer_ref: p.kind === 'cassa' || p.kind === 'nuova' ? null : (p.ref ?? null),
  p_payer_name: p.kind === 'nuova' ? (p.name?.trim() ?? null) : null,
});

export type ListSummary = Database['public']['Views']['shopping_list_summary']['Row'];

export const LIST_ITEM_COLUMNS =
  'id, list_id, item_id, run_id, name, qty, unit, note, checked, checked_at, price_cents, created_at, items(location), dish_ingredients(qty, menu_dishes(name))';

export type ListItem = Pick<
  Database['public']['Tables']['shopping_list_items']['Row'],
  | 'id'
  | 'list_id'
  | 'item_id'
  | 'run_id'
  | 'name'
  | 'qty'
  | 'unit'
  | 'note'
  | 'checked'
  | 'checked_at'
  | 'price_cents'
  | 'created_at'
> & {
  items: { location: Location } | null;
  dish_ingredients: { qty: number; menu_dishes: { name: string } | null }[];
};

export const dishNames = (i: ListItem) =>
  (i.dish_ingredients ?? [])
    .map((d) => d.menu_dishes?.name)
    .filter(Boolean)
    .join(', ');

export const spesaKeys = {
  all: ['spesa'] as const,
  summary: (orgId?: string) => ['spesa', 'summary', orgId] as const,
  list: (id?: string) => ['spesa', 'list', id] as const,
  items: (id?: string) => ['spesa', 'items', id] as const,
  low: (orgId?: string, locations?: Location[]) => ['spesa', 'low', orgId, locations?.join(',')] as const,
};

export function formatEuro(cents: number | null | undefined) {
  if (cents == null) return '—';
  const euros = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `€ ${euros},${String(cents % 100).padStart(2, '0')}`;
}

export function parseEuro(text: string): number | null {
  const clean = text.trim().replace(/\s|€/g, '').replace(',', '.');
  if (clean === '' || !/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  return Math.round(parseFloat(clean) * 100);
}

export const centsToInput = (cents: number | null | undefined) =>
  cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',');

export function localIsoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const dateFromIso = (iso: string) => new Date(`${iso}T12:00:00`);

function useRealtime(table: string, filter: string | undefined, enabled: boolean) {
  const queryClient = useQueryClient();
  const instance = useId();

  useEffect(() => {
    if (!enabled || !filter) return;
    const refresh = () => queryClient.invalidateQueries({ queryKey: spesaKeys.all });
    const channel = supabase
      .channel(`${table}:${filter}:${instance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter }, refresh)

      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, enabled, instance, queryClient]);
}

export function useListsSummary(orgId?: string) {
  useRealtime('shopping_lists', orgId && `org_id=eq.${orgId}`, !!orgId);
  useRealtime('shopping_list_items', orgId && `org_id=eq.${orgId}`, !!orgId);

  return useQuery({
    queryKey: spesaKeys.summary(orgId),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_list_summary')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });
}

export function useList(id?: string) {
  return useQuery({
    queryKey: spesaKeys.list(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_list_summary')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useListItems(listId?: string) {
  useRealtime('shopping_list_items', listId && `list_id=eq.${listId}`, !!listId);

  return useQuery({
    queryKey: spesaKeys.items(listId),
    enabled: !!listId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_list_items')
        .select(LIST_ITEM_COLUMNS)
        .eq('list_id', listId!)
        .order('created_at');
      if (error) throw error;
      return data as ListItem[];
    },
  });
}

export function useLowStock(orgId?: string, locations?: Location[]) {
  return useQuery({
    queryKey: spesaKeys.low(orgId, locations),
    enabled: !!orgId && !!locations?.length,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('items')
        .select(ITEM_COLUMNS)
        .eq('org_id', orgId!)
        .in('location', locations!)
        .eq('kind', 'consumabile')
        .not('min_qty', 'is', null)
        .order('name');
      if (error) throw error;
      return data.filter(isLow);
    },
  });
}

function useInvalidateSpesa() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: spesaKeys.all });
    queryClient.invalidateQueries({ queryKey: itemsKeys.all });
    queryClient.invalidateQueries({ queryKey: movementsKeys.all });
    queryClient.invalidateQueries({ queryKey: ['menu'] });
  };
}

export function useCreateList(orgId?: string) {
  const invalidate = useInvalidateSpesa();
  return useMutation({
    mutationFn: async (v: { name: string; locations: Location[]; addLow: boolean }) => {
      const { data, error } = await supabase.rpc('create_shopping_list', {
        p_org_id: orgId!,
        p_name: v.name,
        p_locations: v.locations,
        p_add_low: v.addLow,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
    },
  });
}

function useListItemMutation<V>(
  listId: string | undefined,
  run: (vars: V) => Promise<void>,
  patch: (items: ListItem[], vars: V) => ListItem[],
) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateSpesa();
  const key = spesaKeys.items(listId);

  return useMutation({
    mutationFn: run,
    onMutate: async (vars: V) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ListItem[]>(key);
      queryClient.setQueryData<ListItem[]>(key, (old) => (old ? patch(old, vars) : old));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    onSettled: invalidate,
  });
}

export function useToggleListItem(listId?: string) {
  return useListItemMutation<{ id: string; checked: boolean }>(
    listId,
    async ({ id, checked }) => {
      const { error } = await supabase.rpc('set_list_item_checked', {
        p_id: id,
        p_checked: checked,
      });
      if (error) throw error;
    },
    (items, { id, checked }) => items.map((i) => (i.id === id ? { ...i, checked } : i)),
  );
}

export function useSetListItemQty(listId?: string) {
  return useListItemMutation<{ id: string; qty: number }>(
    listId,
    async ({ id, qty }) => {
      const { error } = await supabase.from('shopping_list_items').update({ qty }).eq('id', id);
      if (error) throw error;
    },
    (items, { id, qty }) => items.map((i) => (i.id === id ? { ...i, qty } : i)),
  );
}

export function useRemoveListItem(listId?: string) {
  return useListItemMutation<{ id: string }>(
    listId,
    async ({ id }) => {
      const { error } = await supabase.from('shopping_list_items').delete().eq('id', id);
      if (error) throw error;
    },
    (items, { id }) => items.filter((i) => i.id !== id),
  );
}

export function useSetListItemPrice(listId?: string) {
  return useListItemMutation<{ id: string; cents: number | null }>(
    listId,
    async ({ id, cents }) => {
      const { error } = await supabase
        .from('shopping_list_items')
        .update({ price_cents: cents })
        .eq('id', id);
      if (error) throw error;
    },
    (items, { id, cents }) => items.map((i) => (i.id === id ? { ...i, price_cents: cents } : i)),
  );
}

export type NewListEntry = {
  name: string;
  qty: number;
  unit: string;
  note?: string | null;
  itemId?: string | null;
  createIn?: Location;
  kind?: Kind;
  dishId?: string | null;
};

export function useAddListItems(listId?: string, orgId?: string) {
  const invalidate = useInvalidateSpesa();
  return useMutation({
    mutationFn: async (entries: NewListEntry[]) => {
      for (const e of entries) {
        let itemId = e.itemId ?? null;
        if (!itemId && e.createIn) {
          const { data, error } = await supabase
            .from('items')
            .insert({
              org_id: orgId!,
              name: e.name,
              location: e.createIn,
              kind: e.kind ?? 'consumabile',
              unit: e.unit,
              qty: 0,
            })
            .select('id')
            .single();
          if (error) throw error;
          itemId = data.id;
        }

        const { error } = await supabase.rpc('add_list_item', {
          p_list_id: listId!,
          p_name: e.name,
          p_qty: e.qty,
          p_unit: e.unit,
          p_note: e.note?.trim() || undefined,
          p_item_id: itemId ?? undefined,
          p_dish_id: e.dishId ?? undefined,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      Haptics.selectionAsync();
      invalidate();
    },
  });
}

export function useUpdateListItem(listId?: string) {
  return useListItemMutation<{
    id: string;
    name: string;
    qty: number;
    unit: string;
    note: string | null;
  }>(
    listId,
    async ({ id, name, qty, unit, note }) => {
      const { error } = await supabase
        .from('shopping_list_items')
        .update({ name, qty, unit, note: note?.trim() || null })
        .eq('id', id);
      if (error) throw error;
    },
    (items, v) => items.map((i) => (i.id === v.id ? { ...i, ...v } : i)),
  );
}

export function useCloseList(listId?: string) {
  const invalidate = useInvalidateSpesa();
  return useMutation({
    mutationFn: async (v: { carryOver: boolean }) => {
      const { data, error } = await supabase.rpc('close_shopping_list', {
        p_list_id: listId!,
        p_carry_over: v.carryOver,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
    },
  });
}

export function useSetReimbursed(listId?: string) {
  const invalidate = useInvalidateSpesa();
  return useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase.from('shopping_lists').update({ reimbursed: value }).eq('id', listId!);
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
    },
  });
}

export function useUpdateList(listId?: string) {
  const invalidate = useInvalidateSpesa();
  return useMutation({
    mutationFn: async (v: {
      name?: string;
      location?: Location;
      locations?: Location[];
      shop?: string | null;
      closed_on?: string;
      paid_by?: PaymentSource;
    }) => {
      const { error } = await supabase.from('shopping_lists').update(v).eq('id', listId!);
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
    },
  });
}

export function useDeleteList(listId?: string) {
  const invalidate = useInvalidateSpesa();
  return useMutation({
    mutationFn: async (revert: boolean) => {
      const { error } = await supabase.rpc('delete_shopping_list', {
        p_list_id: listId!,
        p_revert: revert,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
    },
  });
}

export function useListsContaining(orgId?: string, term?: string) {
  return useQuery({
    queryKey: ['spesa', 'containing', orgId, term],
    enabled: !!orgId && !!term && term.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_list_items')
        .select('list_id, name')
        .eq('org_id', orgId!)
        .ilike('name', `%${escapeLike(term!)}%`)
        .limit(500);
      if (error) throw error;
      const found = new Map<string, string>();
      data.forEach((r) => {
        if (!found.has(r.list_id)) found.set(r.list_id, r.name);
      });
      return found;
    },
  });
}

export function errorMessage(e: unknown, fallback: string) {
  const err = e as { code?: string; message?: string; details?: string };
  const message = err.message ?? '';
  if (err.code === '23505') return 'Esiste già: è in questa lista o in inventario con lo stesso nome.';
  if (err.code === 'P0001' && message) return message;
  if (err.code === 'PGRST204' || err.code === '42703') {
    const column = message.match(/'([^']+)' column|column "?([a-z_]+)"?/i);
    const name = column?.[1] ?? column?.[2];
    return `${fallback} Nel database manca ${name ? `la colonna “${name}”` : 'una colonna'}: c’è una migrazione da eseguire.`;
  }
  if (err.code === '42P01' || err.code === 'PGRST205') {
    return `${fallback} Nel database manca una tabella: c’è una migrazione da eseguire.`;
  }
  if (err.code === '42883' || err.code === 'PGRST202') {
    return `${fallback} Nel database manca una funzione: c’è una migrazione da eseguire.`;
  }
  if (err.code === '42501') return `${fallback} Non hai i permessi per questa operazione.`;
  if (err.code === '23514')
    return `${fallback} Un valore non è accettato (per esempio una data di fine prima dell’inizio).`;
  if (err.code === '23503')
    return `${fallback} Il dato è collegato ad altro che non esiste o non si può togliere.`;
  if (/network request failed|failed to fetch/i.test(message)) {
    return `${fallback} Sembra che manchi la connessione a internet.`;
  }
  return message ? `${fallback} (${message})` : fallback;
}

export const listTotal = (l: ListSummary) => {
  if ((l.runs_count ?? 0) > 0) return l.spent_cents ?? 0;
  return (l.receipts_count ?? 0) > 0 ? (l.receipts_cents ?? 0) : (l.total_cents ?? 0);
};

export type Run = {
  id: string;
  shop: string | null;
  run_date: string;
  paid_by: PaymentSource;
  paid_by_user: string | null;
  paid_by_person: string | null;
  paid_by_name: string | null;
  payer_id: string | null;
  amount_cents: number | null;
  reimbursed: boolean;
  reimbursed_on: string | null;
  created_at: string;
  total_cents: number;
  amount_missing: boolean;
  receipts_count: number;
  receipts_missing: number;
  items_count: number;
  prices_missing: number;
};

type RawRun = Omit<
  Run,
  'total_cents' | 'amount_missing' | 'receipts_count' | 'receipts_missing' | 'items_count' | 'prices_missing'
> & {
  shopping_receipts: { total_cents: number | null }[];
  shopping_list_items: { price_cents: number | null; checked: boolean }[];
};

export const runsKey = (listId?: string) => ['spesa', 'runs', listId] as const;

export function useRuns(listId?: string) {
  return useQuery({
    queryKey: runsKey(listId),
    enabled: !!listId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_runs')
        .select(
          'id, shop, run_date, paid_by, paid_by_user, paid_by_person, paid_by_name, payer_id, amount_cents, reimbursed, reimbursed_on, created_at, shopping_receipts(total_cents), shopping_list_items(price_cents, checked)',
        )
        .eq('list_id', listId!)
        .order('run_date')
        .order('created_at');
      if (error) throw error;
      return (data as unknown as RawRun[]).map(({ shopping_receipts, shopping_list_items, ...r }) => {
        const items = shopping_list_items.filter((i) => i.checked);
        return {
          ...r,
          total_cents: r.amount_cents ?? 0,
          amount_missing: r.amount_cents == null,
          receipts_count: shopping_receipts.length,
          receipts_missing: shopping_receipts.filter((x) => x.total_cents == null).length,
          items_count: items.length,
          prices_missing: items.filter((x) => x.price_cents == null).length,
        } as Run;
      });
    },
  });
}

function usePaymentMutation<V>(run: (v: V) => Promise<unknown>) {
  const invalidate = useInvalidateSpesa();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
    },
  });
}

export function useCreatePayment(listId?: string) {
  return usePaymentMutation(async (v: PaymentInput) => {
    const { data, error } = await supabase.rpc('create_payment', {
      p_list_id: listId!,
      p_item_ids: v.itemIds,
      ...payerArgs(v.payer),
      p_amount_cents: v.amountCents,
      p_shop: v.shop.trim() || null,
      p_paid_on: v.paidOn,
    });
    if (error) throw error;
    return data;
  });
}

export function useUpdatePayment() {
  return usePaymentMutation(async (v: Omit<PaymentInput, 'itemIds'> & { id: string; itemIds: string[] | null }) => {
    const { error } = await supabase.rpc('update_payment', {
      p_id: v.id,
      p_item_ids: v.itemIds,
      ...payerArgs(v.payer),
      p_amount_cents: v.amountCents,
      p_shop: v.shop.trim() || null,
      p_paid_on: v.paidOn,
    });
    if (error) throw error;
  });
}

export function useDeletePayment() {
  return usePaymentMutation(async (id: string) => {
    const { error } = await supabase.rpc('delete_payment', { p_id: id });
    if (error) throw error;
  });
}

export function useSetPaymentsReimbursed() {
  return usePaymentMutation(async ({ ids, value }: { ids: string[]; value: boolean }) => {
    const { error } = await supabase.rpc('set_payments_reimbursed', { p_ids: ids, p_value: value });
    if (error) throw error;
  });
}

export function usePayerOptions(orgId?: string) {
  return useQuery({
    queryKey: ['spesa', 'payers', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('payer_options', { p_org: orgId! });
      if (error) throw error;
      return (data ?? []) as PayerOption[];
    },
  });
}

export const payerChoiceOf = (run: Run): PayerChoice => {
  if (run.paid_by === 'cassa') return { kind: 'cassa' };
  if (run.paid_by_person) return { kind: 'consigliere', ref: run.paid_by_person };
  if (run.payer_id) return { kind: 'persona', ref: run.payer_id };
  if (run.paid_by_user) return { kind: 'membro', ref: run.paid_by_user };
  return { kind: 'nuova', name: run.paid_by_name ?? '' };
};

export type Refund = {
  id: string;
  list_id: string;
  run_date: string;
  shop: string | null;
  amount_cents: number | null;
  paid_by_user: string | null;
  paid_by_person: string | null;
  payer_id: string | null;
  paid_by_name: string | null;
  shopping_lists: { name: string } | null;
};

export const refundPersonKey = (r: Pick<Refund, 'paid_by_person' | 'paid_by_user' | 'payer_id' | 'paid_by_name'>) =>
  r.paid_by_person
    ? `c:${r.paid_by_person}`
    : r.paid_by_user
      ? `u:${r.paid_by_user}`
      : r.payer_id
        ? `p:${r.payer_id}`
        : `n:${(r.paid_by_name ?? '').trim().toLowerCase()}`;

export function useRefunds(orgId?: string) {
  return useQuery({
    queryKey: ['spesa', 'refunds', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_runs')
        .select(
          'id, list_id, run_date, shop, amount_cents, paid_by_user, paid_by_person, payer_id, paid_by_name, shopping_lists(name)',
        )
        .eq('org_id', orgId!)
        .eq('paid_by', 'volontario')
        .eq('reimbursed', false)
        .order('run_date');
      if (error) throw error;
      return data as unknown as Refund[];
    },
  });
}

export const runDateLabel = (iso: string) =>
  dateFromIso(iso).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });

export function usePayerLabel(orgId?: string, currentUserId?: string) {
  const members = useQuery({
    queryKey: ['members', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('members')
        .select('user_id, display_name')
        .eq('org_id', orgId!);
      if (error) throw error;
      return data;
    },
  });
  return (run: Pick<Run, 'paid_by' | 'paid_by_user' | 'paid_by_name'>) => {
    if (run.paid_by === 'cassa') return 'Cassa Pro Loco';
    if (run.paid_by_user && run.paid_by_user === currentUserId) return 'Pagato da te';
    const name = run.paid_by_name ?? members.data?.find((m) => m.user_id === run.paid_by_user)?.display_name;
    return `Pagato da ${name ?? 'un volontario'}`;
  };
}

export const listLocations = (l: { location?: Location | null; locations?: Location[] | null }) =>
  l.locations?.length ? l.locations : l.location ? [l.location] : [];

export function locationsLabel(locations: Location[]) {
  const labels = LOCATIONS.filter((l) => locations.includes(l.value)).map((l) => l.label);
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}

export const primaryLocation = (l: { location?: Location | null; locations?: Location[] | null }) =>
  listLocations(l)[0] ?? 'cucina';
