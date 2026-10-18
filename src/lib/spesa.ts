import { useEffect, useId } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import { escapeLike, isLow, ITEM_COLUMNS, itemsKeys, movementsKeys, type Location } from '@/lib/items';

export type PaymentSource = Database['public']['Enums']['payment_source'];
export type ListSummary = Database['public']['Views']['shopping_list_summary']['Row'];

export const LIST_ITEM_COLUMNS =
  'id, list_id, item_id, name, qty, unit, note, checked, checked_at, price_cents, created_at, items(location), dish_ingredients(qty, menu_dishes(name))';

export type ListItem = Pick<
  Database['public']['Tables']['shopping_list_items']['Row'],
  | 'id'
  | 'list_id'
  | 'item_id'
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
  low: (orgId?: string, location?: Location) => ['spesa', 'low', orgId, location] as const,
};

export function formatEuro(cents: number | null | undefined) {
  if (cents == null) return '—';
  const euros = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
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

export function useLowStock(orgId?: string, location?: Location) {
  return useQuery({
    queryKey: spesaKeys.low(orgId, location),
    enabled: !!orgId && !!location,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('items')
        .select(ITEM_COLUMNS)
        .eq('org_id', orgId!)
        .eq('location', location!)
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
    mutationFn: async (v: { name: string; location: Location; addLow: boolean }) => {
      const { data, error } = await supabase.rpc('create_shopping_list', {
        p_org_id: orgId!,
        p_name: v.name,
        p_location: v.location,
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
              kind: 'consumabile',
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
    mutationFn: async (v: {
      shop: string;
      closedOn: string;
      paidBy: PaymentSource;
      prices: { id: string; price_cents: number | null }[];
      carryOver: boolean;
    }) => {
      const { data, error } = await supabase.rpc('close_shopping_list', {
        p_list_id: listId!,
        p_shop: v.shop,
        p_closed_on: v.closedOn,
        p_paid_by: v.paidBy,
        p_prices: v.prices,
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
      const { error } = await supabase
        .from('shopping_lists')
        .update({ reimbursed: value })
        .eq('id', listId!);
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
  const err = e as { code?: string; message?: string };
  if (err.code === '23505') return 'Esiste già: è in questa lista o in inventario con lo stesso nome.';
  if (err.code === 'P0001' && err.message) return err.message;
  return fallback;
}
