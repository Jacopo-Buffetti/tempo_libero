import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { compressPhoto, type PhotoAsset } from '@/lib/comprimiFoto';

const BUCKET = 'firmati';
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const PAGE_TARGET_BYTES = 180_000;
const PAGE_STEPS = [
  { edge: 2000, quality: 0.5 },
  { edge: 1800, quality: 0.42 },
  { edge: 1600, quality: 0.36 },
  { edge: 1400, quality: 0.3 },
  { edge: 1250, quality: 0.26 },
];

export type SignedKind = 'contratto' | 'verbale';
export type SignedMime = 'image/jpeg' | 'application/pdf';

export type SignedFile = {
  id: string;
  kind: SignedKind;
  path: string;
  mime: SignedMime;
  size_bytes: number | null;
  created_at: string;
  url: string | null;
};

export const signedKey = (rentalId?: string) => ['affitti', 'firmati', rentalId] as const;

export const isPdf = (f: Pick<SignedFile, 'mime'>) => f.mime === 'application/pdf';

export function useSignedFiles(rentalId?: string) {
  return useQuery({
    queryKey: signedKey(rentalId),
    enabled: !!rentalId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rental_signed_files')
        .select('id, kind, path, mime, size_bytes, created_at')
        .eq('rental_id', rentalId!)
        .order('created_at');
      if (error) throw error;
      const rows = data as Omit<SignedFile, 'url'>[];
      if (rows.length === 0) return [] as SignedFile[];
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(
        rows.map((r) => r.path),
        10 * 60,
      );
      return rows.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? null }));
    },
  });
}

export async function pickPagePhotos(source: 'camera' | 'library') {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Serve il permesso di usare la fotocamera.');
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: true,
      exif: false,
    });
    return result.canceled ? [] : result.assets;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: true,
    selectionLimit: 10,
    orderedSelection: true,
    exif: false,
  });
  return result.canceled ? [] : result.assets;
}

export async function pickPdf() {
  const picked = await File.pickFileAsync({ mimeTypes: 'application/pdf' });
  if (picked.canceled || !picked.result) return null;
  const file = picked.result as File;
  if (file.size > MAX_PDF_BYTES) {
    throw new Error('Il PDF supera i 10 MB: scansionalo con una qualità più bassa o fotografa le pagine.');
  }
  const bytes = await file.bytes();
  if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') {
    throw new Error('Il file scelto non è un PDF.');
  }
  return bytes;
}

export async function signedFilePaths(rentalId: string) {
  const { data, error } = await supabase.from('rental_signed_files').select('path').eq('rental_id', rentalId);
  if (error) throw error;
  return (data ?? []).map((d) => d.path);
}

export async function removeSignedFiles(paths: string[]) {
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
}

async function store(
  orgId: string,
  rentalId: string,
  kind: SignedKind,
  body: ArrayBuffer | Uint8Array,
  mime: SignedMime,
  size: number,
) {
  const extension = mime === 'application/pdf' ? 'pdf' : 'jpg';
  const path = `${orgId}/${rentalId}/${kind}-${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: mime });
  if (uploadError) throw uploadError;
  const { error } = await supabase
    .from('rental_signed_files')
    .insert({ org_id: orgId, rental_id: rentalId, kind, path, mime, size_bytes: size });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
}

export function useAddSignedFiles(orgId?: string, rentalId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input:
        | { kind: SignedKind; photos: PhotoAsset[] }
        | { kind: SignedKind; pdf: Uint8Array },
    ) => {
      if ('pdf' in input) {
        await store(orgId!, rentalId!, input.kind, input.pdf, 'application/pdf', input.pdf.length);
        return 1;
      }
      for (const photo of input.photos) {
        const { base64, bytes } = await compressPhoto(photo, PAGE_STEPS, PAGE_TARGET_BYTES);
        await store(orgId!, rentalId!, input.kind, decode(base64), 'image/jpeg', bytes);
      }
      return input.photos.length;
    },
    onSuccess: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    onSettled: () => queryClient.invalidateQueries({ queryKey: signedKey(rentalId) }),
  });
}

export function useDeleteSignedFile(rentalId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: SignedFile) => {
      const { error } = await supabase.from('rental_signed_files').delete().eq('id', file.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([file.path]);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: signedKey(rentalId) }),
  });
}

export async function openSignedPdf(file: SignedFile, name: string) {
  if (!file.url) throw new Error('Il file non è raggiungibile. Riprova tra poco.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Apertura dei PDF non disponibile su questo dispositivo.');
  const local = new File(Paths.cache, `${name}.pdf`);
  if (local.exists) local.delete();
  await File.downloadFileAsync(file.url, local);
  await Sharing.shareAsync(local.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: name });
}
