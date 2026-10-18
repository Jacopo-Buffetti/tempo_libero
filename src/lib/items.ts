import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

export type Location = Database['public']['Enums']['item_location'];
export type Kind = Database['public']['Enums']['item_kind'];

export const ITEM_COLUMNS = 'id, name, location, kind, unit, qty, min_qty, broken_qty';

export type Item = Pick<
  Database['public']['Tables']['items']['Row'],
  'id' | 'name' | 'location' | 'kind' | 'unit' | 'qty' | 'min_qty' | 'broken_qty'
>;

export const LOCATIONS: { value: Location; label: string }[] = [
  { value: 'magazzino', label: 'Magazzino' },
  { value: 'cucina', label: 'Cucina' },
  { value: 'bar', label: 'Bar' },
];

export const locationLabel = (l: Location) => LOCATIONS.find((x) => x.value === l)?.label ?? l;

export const kindLabel = (k: Kind) => (k === 'consumabile' ? 'Consumabile' : 'Attrezzatura');

export const isLocation = (v: unknown): v is Location =>
  typeof v === 'string' && LOCATIONS.some((l) => l.value === v);

export const UNIT_INFO: Record<string, { step: number; decimals: number; label: string }> = {
  pezzi: { step: 1, decimals: 0, label: 'pezzi' },
  confezioni: { step: 1, decimals: 0, label: 'confezioni' },
  bottiglie: { step: 1, decimals: 0, label: 'bottiglie' },
  rotoli: { step: 1, decimals: 0, label: 'rotoli' },
  casse: { step: 1, decimals: 0, label: 'casse' },
  kg: { step: 0.5, decimals: 3, label: 'kg' },
  g: { step: 100, decimals: 0, label: 'grammi' },
  litri: { step: 0.5, decimals: 3, label: 'litri' },
  ml: { step: 250, decimals: 0, label: 'ml' },
};

export const UNITS = Object.keys(UNIT_INFO);

export const COUNT_UNITS = ['pezzi', 'confezioni', 'bottiglie', 'rotoli', 'casse'];
export const MEASURE_UNITS = ['kg', 'g', 'litri', 'ml'];

export const unitInfo = (unit: string) => UNIT_INFO[unit] ?? { step: 1, decimals: 0, label: unit };

export const stepFor = (unit: string) => unitInfo(unit).step;

export const roundQty = (n: number) => Math.round(n * 1000) / 1000;

export const formatQty = (n: number | null | undefined) =>
  n == null ? '—' : String(roundQty(Number(n))).replace('.', ',');

export function parseQty(text: string, unit = 'pezzi'): number | null {
  const clean = text.trim().replace(/\s/g, '').replace(',', '.');
  if (clean === '' || !/^\d+(\.\d*)?$/.test(clean)) return null;
  const n = parseFloat(clean);
  if (Number.isNaN(n)) return null;
  const d = unitInfo(unit).decimals;
  return d === 0 ? Math.round(n) : roundQty(n);
}

export const qtyWithUnit = (n: number | null | undefined, unit: string) =>
  `${formatQty(n)} ${unit}`;

export const available = (i: Item) => i.qty - i.broken_qty;

export const isLow = (i: Item) => i.kind === 'consumabile' && i.min_qty != null && i.qty < i.min_qty;

export const needsRepair = (i: Item) => i.kind === 'attrezzatura' && i.broken_qty > 0;

export function itemNote(i: Item): { text: string; alert: boolean } {
  if (isLow(i)) return { text: `Sotto scorta · min. ${formatQty(i.min_qty)}`, alert: true };
  if (needsRepair(i)) {
    return { text: `${available(i)} disponibili · ${i.broken_qty} da riparare`, alert: true };
  }
  return { text: i.kind === 'consumabile' ? 'Ok' : 'Tutti disponibili', alert: false };
}

export const itemsKeys = {
  all: ['items'] as const,
  list: (orgId?: string, location?: Location) => ['items', 'list', orgId, location] as const,
  search: (orgId?: string, term?: string, location?: Location | 'tutti') =>
    ['items', 'search', orgId, term, location] as const,
  detail: (id?: string) => ['items', 'detail', id] as const,
};

export const movementsKeys = {
  all: ['movements'] as const,
  item: (id?: string) => ['movements', id] as const,
};

function useItemRpc(
  run: (id: string, delta: number) => Promise<unknown>,
  patch: (item: Item, delta: number) => Item,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) => run(id, delta),
    onMutate: async ({ id, delta }) => {
      await queryClient.cancelQueries({ queryKey: itemsKeys.all });
      const snapshot = queryClient.getQueriesData<unknown>({ queryKey: itemsKeys.all });
      queryClient.setQueriesData<unknown>({ queryKey: itemsKeys.all }, (old) => {
        if (Array.isArray(old)) {
          return (old as Item[]).map((i) => (i.id === id ? patch(i, delta) : i));
        }
        if (old && typeof old === 'object' && (old as Item).id === id) {
          return patch(old as Item, delta);
        }
        return old;
      });
      return { snapshot };
    },
    onError: (_error, _vars, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: itemsKeys.all });
      queryClient.invalidateQueries({ queryKey: movementsKeys.all });
    },
  });
}

export function useAdjustQuantity() {
  return useItemRpc(
    async (id, delta) => {
      const { data, error } = await supabase.rpc('adjust_quantity', {
        p_item_id: id,
        p_delta: delta,
      });
      if (error) throw error;
      return data;
    },
    (i, d) => ({ ...i, qty: Math.max(i.broken_qty, roundQty(i.qty + d)) }),
  );
}

export function useAdjustBroken() {
  return useItemRpc(
    async (id, delta) => {
      const { data, error } = await supabase.rpc('adjust_broken', {
        p_item_id: id,
        p_delta: delta,
      });
      if (error) throw error;
      return data;
    },
    (i, d) => ({ ...i, broken_qty: Math.min(i.qty, Math.max(0, i.broken_qty + d)) }),
  );
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, count } = await supabase.from('items').delete({ count: 'exact' }).eq('id', id);
      if (error) throw error;
      if (count === 0) throw new Error('Solo un amministratore può eliminare gli oggetti.');
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: itemsKeys.all });
      queryClient.invalidateQueries({ queryKey: movementsKeys.all });
      queryClient.invalidateQueries({ queryKey: ['spesa'] });
    },
  });
}

export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
