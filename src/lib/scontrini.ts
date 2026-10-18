import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { spesaKeys } from '@/lib/spesa';

const BUCKET = 'scontrini';
const MAX_EDGE = 1600;

export type ReceiptStatus = 'da_leggere' | 'letto' | 'manuale' | 'illeggibile';

export type Receipt = {
  id: string;
  path: string;
  total_cents: number | null;
  shop: string | null;
  receipt_date: string | null;
  status: ReceiptStatus;
  error: string | null;
  run_id: string | null;
  created_at: string;
  url: string | null;
};

const READING_TIMEOUT_MS = 60_000;

export const isReading = (r: Receipt) =>
  r.status === 'da_leggere' && Date.now() - new Date(r.created_at).getTime() < READING_TIMEOUT_MS;

export const receiptsKey = (listId?: string) => ['spesa', 'receipts', listId] as const;

export function useReceipts(listId?: string, runId?: string | null) {
  return useQuery({
    queryKey: [...receiptsKey(listId), runId === undefined ? 'tutti' : (runId ?? 'in-corso')],
    enabled: !!listId,
    queryFn: async () => {
      let query = supabase
        .from('shopping_receipts')
        .select('id, path, total_cents, shop, receipt_date, status, error, run_id, created_at')
        .eq('list_id', listId!)
        .order('created_at');
      if (runId === null) query = query.is('run_id', null);
      else if (runId) query = query.eq('run_id', runId);
      const { data, error } = await query;
      if (error) throw error;
      const rows = data as Omit<Receipt, 'url'>[];
      if (rows.length === 0) return [] as Receipt[];
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(
        rows.map((r) => r.path),
        60 * 60,
      );
      return rows.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? null }));
    },
  });
}

export async function takeReceiptPhoto(source: 'camera' | 'library') {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Serve il permesso di usare la fotocamera.');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    return result.canceled ? [] : result.assets;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: true,
    selectionLimit: 6,
  });
  return result.canceled ? [] : result.assets;
}

async function compress(asset: { uri: string; width: number; height: number }) {
  const context = ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width, asset.height);
  if (longest > MAX_EDGE) {
    context.resize(asset.height >= asset.width ? { height: MAX_EDGE } : { width: MAX_EDGE });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  return saved.base64!;
}

async function describeError(error: unknown) {
  const e = error as { name?: string; message?: string; context?: Response };
  if (e.context && typeof e.context.status === 'number') {
    let detail = '';
    try {
      const body = await e.context.clone().json();
      detail = body?.error ?? body?.message ?? body?.msg ?? '';
    } catch {
      detail = await e.context.text().catch(() => '');
    }
    const hints: Record<number, string> = {
      401: 'accesso negato alla funzione (ripubblicala con --no-verify-jwt)',
      404: 'funzione leggi-scontrino non trovata (va pubblicata)',
      500: 'errore nella funzione',
    };
    return `Funzione ${e.context.status}: ${detail || hints[e.context.status] || 'errore'}`;
  }
  if (e.name === 'FunctionsFetchError') return 'Funzione non raggiungibile: è stata pubblicata?';
  return e.message || 'Errore sconosciuto';
}

async function readReceipt(receiptId: string) {
  const { error } = await supabase.functions.invoke('leggi-scontrino', { body: { receipt_id: receiptId } });
  if (error) {
    const message = await describeError(error);
    await supabase
      .from('shopping_receipts')
      .update({ status: 'illeggibile', error: message })
      .eq('id', receiptId)
      .neq('status', 'letto');
    throw new Error(message);
  }
}

export function useAddReceipts(orgId?: string, listId?: string, runId?: string | null) {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: receiptsKey(listId) });
    queryClient.invalidateQueries({ queryKey: spesaKeys.all });
  };

  return useMutation({
    mutationFn: async (assets: { uri: string; width: number; height: number }[]) => {
      const created: string[] = [];
      for (const asset of assets) {
        const base64 = await compress(asset);
        const path = `${orgId}/${listId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, decode(base64), { contentType: 'image/jpeg' });
        if (uploadError) throw uploadError;
        const { data, error } = await supabase
          .from('shopping_receipts')
          .insert({ org_id: orgId!, list_id: listId!, path, run_id: runId ?? null })
          .select('id')
          .single();
        if (error) throw error;
        created.push(data.id);
      }
      refresh();
      await Promise.all(created.map((id) => readReceipt(id).catch(() => undefined)));
      return created.length;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
    },
    onError: refresh,
  });
}

export function useRetryReceipt(listId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: readReceipt,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: receiptsKey(listId) });
      queryClient.invalidateQueries({ queryKey: spesaKeys.all });
    },
  });
}

export function useSetReceiptTotal(listId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, cents }: { id: string; cents: number | null }) => {
      const { error } = await supabase
        .from('shopping_receipts')
        .update({ total_cents: cents, status: cents == null ? 'illeggibile' : 'manuale', error: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: receiptsKey(listId) });
      queryClient.invalidateQueries({ queryKey: spesaKeys.all });
    },
  });
}

export function useDeleteReceipt(listId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (receipt: Receipt) => {
      const { error } = await supabase.from('shopping_receipts').delete().eq('id', receipt.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([receipt.path]);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: receiptsKey(listId) });
      queryClient.invalidateQueries({ queryKey: spesaKeys.all });
    },
  });
}

export const receiptsTotal = (receipts: Receipt[]) =>
  receipts.reduce((sum, r) => sum + (r.total_cents ?? 0), 0);
