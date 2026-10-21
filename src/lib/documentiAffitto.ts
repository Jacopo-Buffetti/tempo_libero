import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { compressPhoto, type PhotoAsset } from '@/lib/comprimiFoto';

export { formatSize } from '@/lib/comprimiFoto';

const BUCKET = 'documenti';
const TARGET_BYTES = 80_000;
const STEPS = [
  { edge: 1280, quality: 0.45 },
  { edge: 1120, quality: 0.38 },
  { edge: 1000, quality: 0.32 },
  { edge: 900, quality: 0.26 },
  { edge: 800, quality: 0.22 },
];

export type DocumentSide = 'fronte' | 'retro';

export const DOCUMENT_SIDES: { value: DocumentSide; label: string }[] = [
  { value: 'fronte', label: 'Fronte' },
  { value: 'retro', label: 'Retro' },
];

export type RentalDocument = {
  id: string;
  side: DocumentSide;
  path: string;
  size_bytes: number | null;
  created_at: string;
  url: string | null;
};

export const documentsKey = (rentalId?: string) => ['affitti', 'documenti', rentalId] as const;

export function useRentalDocuments(rentalId?: string) {
  return useQuery({
    queryKey: documentsKey(rentalId),
    enabled: !!rentalId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rental_documents')
        .select('id, side, path, size_bytes, created_at')
        .eq('rental_id', rentalId!)
        .order('side');
      if (error) throw error;
      const rows = data as Omit<RentalDocument, 'url'>[];
      if (rows.length === 0) return [] as RentalDocument[];
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(
        rows.map((r) => r.path),
        10 * 60,
      );
      return rows.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? null }));
    },
  });
}

export async function pickDocumentPhoto(source: 'camera' | 'library') {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Serve il permesso di usare la fotocamera.');
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: true,
      exif: false,
    });
    return result.canceled ? null : result.assets[0];
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsEditing: true,
    exif: false,
  });
  return result.canceled ? null : result.assets[0];
}

export const compressDocument = (asset: PhotoAsset) => compressPhoto(asset, STEPS, TARGET_BYTES);

export async function rentalDocumentPaths(rentalId: string) {
  const { data, error } = await supabase.from('rental_documents').select('path').eq('rental_id', rentalId);
  if (error) throw error;
  return (data ?? []).map((d) => d.path);
}

export async function removeDocumentFiles(paths: string[]) {
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
}

export function useAddRentalDocument(orgId?: string, rentalId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ side, asset }: { side: DocumentSide; asset: PhotoAsset }) => {
      const { base64, bytes } = await compressDocument(asset);
      const path = `${orgId}/${rentalId}/${side}-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, decode(base64), { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;
      const { error } = await supabase
        .from('rental_documents')
        .insert({ org_id: orgId!, rental_id: rentalId!, side, path, size_bytes: bytes });
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        if ((error as { code?: string }).code === '23505') {
          throw new Error('C’è già una foto per questo lato: toglila prima di farne un’altra.');
        }
        throw error;
      }
      return bytes;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: documentsKey(rentalId) });
    },
  });
}

export function useDeleteRentalDocument(rentalId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (doc: RentalDocument) => {
      const { error } = await supabase.from('rental_documents').delete().eq('id', doc.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([doc.path]);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: documentsKey(rentalId) }),
  });
}
