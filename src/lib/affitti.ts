import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { escapeLike } from '@/lib/items';
import { formatEuro } from '@/lib/spesa';
import { dateOf, isoOf } from '@/lib/calendario';

export type Space = 'stanza' | 'cramaccioli';

export const SPACES: { value: Space; label: string; short: string }[] = [
  { value: 'stanza', label: 'Stanza sotto il circolo', short: 'Stanza' },
  { value: 'cramaccioli', label: 'Cramaccioli', short: 'Cramaccioli' },
];

export const spaceLabel = (s: Space) => SPACES.find((x) => x.value === s)?.label ?? s;
export const spaceShort = (s: Space) => SPACES.find((x) => x.value === s)?.short ?? s;

export type Client = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  birth_place?: string | null;
  birth_date?: string | null;
  tax_code?: string | null;
  email?: string | null;
};

export type Rental = {
  id: string;
  space: Space;
  client_id: string;
  rent_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  price_cents: number | null;
  deposit_cents: number | null;
  deposit_paid: boolean;
  balance_paid: boolean;
  notes: string | null;
  clients: Pick<Client, 'id' | 'first_name' | 'last_name' | 'phone'> | null;
};

const RENTAL_COLUMNS =
  'id, space, client_id, rent_date, end_date, start_time, end_time, price_cents, deposit_cents, deposit_paid, balance_paid, notes, clients(id, first_name, last_name, phone)';

export const affittiKeys = {
  all: ['affitti'] as const,
  range: (orgId?: string, from?: string, to?: string) => ['affitti', 'range', orgId, from, to] as const,
  rental: (id?: string) => ['affitti', 'rental', id] as const,
  clients: (orgId?: string, term?: string) => ['affitti', 'clients', orgId, term] as const,
  client: (id?: string) => ['affitti', 'client', id] as const,
};

export const clientName = (c?: Pick<Client, 'first_name' | 'last_name'> | null) =>
  c ? [c.first_name, c.last_name].filter(Boolean).join(' ') : '—';

export const shortTime = (t?: string | null) => (t ? t.slice(0, 5) : '');

export const timeRange = (r: Pick<Rental, 'start_time' | 'end_time'>) =>
  r.start_time
    ? `${shortTime(r.start_time)}${r.end_time ? `–${shortTime(r.end_time)}` : ''}`
    : 'Tutto il giorno';

export function paymentState(
  r: Pick<Rental, 'price_cents' | 'deposit_cents' | 'deposit_paid' | 'balance_paid'>,
) {
  const price = r.price_cents ?? 0;
  const deposit = r.deposit_cents ?? 0;
  const paid = r.balance_paid ? price : r.deposit_paid ? deposit : 0;
  const due = Math.max(0, price - paid);
  if (!r.price_cents) return { due: 0, paid, label: 'Prezzo da definire', warn: true };
  if (r.balance_paid) return { due: 0, paid, label: 'Saldato', warn: false };
  if (r.deposit_paid && deposit > 0)
    return { due, paid, label: `Caparra versata · saldo ${formatEuro(due)}`, warn: true };
  return { due, paid, label: `Da pagare ${formatEuro(due)}`, warn: true };
}

type Period = Pick<Rental, 'rent_date' | 'end_date' | 'start_time' | 'end_time'>;

const moment = (date: string, time: string | null, fallback: string) =>
  `${date}T${(time ?? fallback).slice(0, 5)}`;

export function overlaps(a: Period, b: Period) {
  const aStart = moment(a.rent_date, a.start_time, '00:00');
  const aEnd = moment(a.end_date, a.end_time, '24:00');
  const bStart = moment(b.rent_date, b.start_time, '00:00');
  const bEnd = moment(b.end_date, b.end_time, '24:00');
  return aStart < bEnd && bStart < aEnd;
}

export const daysOf = (r: Pick<Rental, 'rent_date' | 'end_date'>) => {
  const days: string[] = [];
  for (let d = dateOf(r.rent_date); isoOf(d) <= r.end_date; d = new Date(d.getTime() + 86_400_000))
    days.push(isoOf(d));
  return days;
};

const shortDay = (iso: string, withMonth = true) =>
  dateOf(iso).toLocaleDateString(
    'it-IT',
    withMonth ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric' },
  );

export function periodLabel(r: Period) {
  if (r.rent_date === r.end_date) {
    return `${shortDay(r.rent_date)} · ${timeRange(r)}`;
  }
  const sameMonth = r.rent_date.slice(0, 7) === r.end_date.slice(0, 7);
  const from = `${shortDay(r.rent_date, !sameMonth)}${r.start_time ? ` ${shortTime(r.start_time)}` : ''}`;
  const to = `${shortDay(r.end_date)}${r.end_time ? ` ${shortTime(r.end_time)}` : ''}`;
  return `${from} → ${to} · ${daysOf(r).length} giorni`;
}

export function useRentals(orgId?: string, from?: string, to?: string) {
  return useQuery({
    queryKey: affittiKeys.range(orgId, from, to),
    enabled: !!orgId && !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rentals')
        .select(RENTAL_COLUMNS)
        .eq('org_id', orgId!)
        .lte('rent_date', to!)
        .gte('end_date', from!)
        .order('rent_date')
        .order('start_time', { nullsFirst: true });
      if (error) throw error;
      return data as unknown as Rental[];
    },
  });
}

export function useRental(id?: string) {
  return useQuery({
    queryKey: affittiKeys.rental(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rentals')
        .select(RENTAL_COLUMNS)
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Rental | null;
    },
  });
}

export function useClients(orgId?: string, term = '') {
  return useQuery({
    queryKey: affittiKeys.clients(orgId, term),
    enabled: !!orgId,
    queryFn: async () => {
      let query = supabase
        .from('clients')
        .select('id, first_name, last_name, phone, address, notes')
        .eq('org_id', orgId!)
        .order('last_name', { nullsFirst: false })
        .order('first_name')
        .limit(200);
      const t = term.trim();
      if (t) {
        const like = `%${escapeLike(t)}%`;
        query = query.or(`first_name.ilike.${like},last_name.ilike.${like},phone.ilike.${like}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as Client[];
    },
  });
}

export function useClient(id?: string) {
  return useQuery({
    queryKey: affittiKeys.client(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select(
          'id, first_name, last_name, phone, address, notes, birth_place, birth_date, tax_code, email, rentals(id, space, rent_date, end_date, start_time, end_time, price_cents, deposit_cents, deposit_paid, balance_paid, notes, client_id)',
        )
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const rentals = ((data.rentals ?? []) as unknown as Rental[]).sort((a, b) =>
        b.rent_date.localeCompare(a.rent_date),
      );
      return { ...(data as unknown as Client), rentals };
    },
  });
}

function useInvalidateAffitti() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: affittiKeys.all });
}

export type ClientInput = Omit<Client, 'id'>;

export function useSaveClient(orgId?: string) {
  const invalidate = useInvalidateAffitti();
  return useMutation({
    mutationFn: async ({ id, ...v }: ClientInput & { id?: string }) => {
      const row = {
        first_name: v.first_name.trim(),
        last_name: v.last_name?.trim() || null,
        phone: v.phone?.trim() || null,
        address: v.address?.trim() || null,
        notes: v.notes?.trim() || null,
      };
      if (id) {
        const { error } = await supabase.from('clients').update(row).eq('id', id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from('clients')
        .insert({ ...row, org_id: orgId! })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteClient() {
  const invalidate = useInvalidateAffitti();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) {
        if ((error as { code?: string }).code === '23503') {
          throw new Error('Questo cliente ha degli affitti: elimina prima quelli.');
        }
        throw error;
      }
    },
    onSuccess: invalidate,
  });
}

export type RentalInput = Omit<Rental, 'id' | 'clients'>;

export function useSaveRental(orgId?: string) {
  const invalidate = useInvalidateAffitti();
  return useMutation({
    mutationFn: async ({ id, ...v }: RentalInput & { id?: string }) => {
      if (id) {
        const { error } = await supabase.from('rentals').update(v).eq('id', id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from('rentals')
        .insert({ ...v, org_id: orgId! })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
    },
  });
}

export function useDeleteRental() {
  const invalidate = useInvalidateAffitti();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rentals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
