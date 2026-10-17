import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

export type Location = Database['public']['Enums']['item_location'];
export type Kind = Database['public']['Enums']['item_kind'];

/** Le colonne che servono a liste, ricerca e dettaglio */
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

export const UNITS = ['pezzi', 'rotoli', 'bottiglie', 'confezioni', 'kg', 'litri'];

/** Pezzi utilizzabili: il totale meno quelli da riparare */
export const available = (i: Item) => i.qty - i.broken_qty;

export const isLow = (i: Item) => i.kind === 'consumabile' && i.min_qty != null && i.qty < i.min_qty;

/** "Da riparare" esiste solo per l'attrezzatura */
export const needsRepair = (i: Item) => i.kind === 'attrezzatura' && i.broken_qty > 0;

/** Testo sotto il nome e se va evidenziato */
export function itemNote(i: Item): { text: string; alert: boolean } {
  if (isLow(i)) return { text: `Sotto scorta · min. ${i.min_qty}`, alert: true };
  if (needsRepair(i)) {
    return { text: `${available(i)} disponibili · ${i.broken_qty} da riparare`, alert: true };
  }
  return { text: i.kind === 'consumabile' ? 'Ok' : 'Tutti disponibili', alert: false };
}

/** Chiavi di cache: tutto ciò che riguarda gli oggetti parte da ['items'] */
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

/**
 * Mutazione su un oggetto con aggiornamento ottimistico:
 * aggiorna subito liste (array) e dettaglio (oggetto singolo) in cache,
 * torna indietro se il server rifiuta, poi riallinea tutto.
 */
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

/** +/− sul totale */
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
    (i, d) => ({ ...i, qty: Math.max(i.broken_qty, i.qty + d) }),
  );
}

/** Sposta pezzi tra disponibili e da riparare (positivo = si rompono, negativo = riparati) */
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

/** Per usare il testo dell'utente dentro un ILIKE senza che % e _ diventino jolly */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
