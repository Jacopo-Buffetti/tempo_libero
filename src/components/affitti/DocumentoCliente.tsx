import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  DOCUMENT_SIDES,
  formatSize,
  pickDocumentPhoto,
  useAddRentalDocument,
  useDeleteRentalDocument,
  useRentalDocuments,
  type DocumentSide,
  type RentalDocument,
} from '@/lib/documentiAffitto';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/components/documentoCliente';

type Props = {
  orgId?: string;
  rentalId: string;
};

export function DocumentoCliente({ orgId, rentalId }: Props) {
  const styles = useStyles();
  const { type } = useTheme();
  const documents = useRentalDocuments(rentalId);
  const add = useAddRentalDocument(orgId, rentalId);
  const [busySide, setBusySide] = useState<DocumentSide | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bySide = new Map((documents.data ?? []).map((d) => [d.side, d]));

  async function addFrom(side: DocumentSide, source: 'camera' | 'library') {
    setError(null);
    try {
      const asset = await pickDocumentPhoto(source);
      if (!asset) return;
      setBusySide(side);
      await add.mutateAsync({ side, asset });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Caricamento non riuscito. Riprova.');
    } finally {
      setBusySide(null);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={type.label}>Documento d’identità</Text>
      <View style={styles.row}>
        {DOCUMENT_SIDES.map((s) => (
          <Slot
            key={s.value}
            label={s.label}
            document={bySide.get(s.value)}
            loading={documents.isLoading}
            busy={busySide === s.value}
            onCamera={() => addFrom(s.value, 'camera')}
            onLibrary={() => addFrom(s.value, 'library')}
            onZoom={(url) => setZoom(url)}
            rentalId={rentalId}
          />
        ))}
      </View>
      <Text style={type.caption}>
        Inquadra solo il documento, poi ritaglialo: la foto viene ridotta e compressa al massimo restando leggibile.
        La vedono solo consiglieri e amministratori.
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}

      <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
        <Pressable style={styles.zoom} onPress={() => setZoom(null)} accessibilityLabel="Chiudi">
          {zoom && <Image source={{ uri: zoom }} style={styles.zoomImage} contentFit="contain" />}
        </Pressable>
      </Modal>
    </View>
  );
}

function Slot({
  label,
  document,
  loading,
  busy,
  onCamera,
  onLibrary,
  onZoom,
  rentalId,
}: {
  label: string;
  document?: RentalDocument;
  loading: boolean;
  busy: boolean;
  onCamera: () => void;
  onLibrary: () => void;
  onZoom: (url: string) => void;
  rentalId: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const remove = useDeleteRentalDocument(rentalId);

  function confirmRemove(doc: RentalDocument) {
    Alert.alert(`Togliere il ${label.toLowerCase()}?`, 'La foto del documento verrà eliminata.', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Togli', style: 'destructive', onPress: () => remove.mutate(doc) },
    ]);
  }

  if (loading || busy || remove.isPending) {
    return (
      <View style={styles.slot}>
        <Text style={styles.slotLabel}>{label}</Text>
        <View style={[styles.photo, styles.center]}>
          <ActivityIndicator color={colors.accent} />
          {busy && <Text style={styles.hint}>Comprimo…</Text>}
        </View>
      </View>
    );
  }

  if (document) {
    return (
      <View style={styles.slot}>
        <Text style={styles.slotLabel}>{label}</Text>
        <Pressable
          onPress={() => document.url && onZoom(document.url)}
          accessibilityLabel={`Ingrandisci il ${label.toLowerCase()} del documento`}
        >
          {document.url ? (
            <Image
              source={{ uri: document.url, cacheKey: document.path }}
              style={styles.photo}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View style={[styles.photo, styles.center]}>
              <Ionicons name="id-card-outline" size={26} color={colors.muted} />
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={() => confirmRemove(document)}
          hitSlop={8}
          style={styles.remove}
          accessibilityLabel={`Togli il ${label.toLowerCase()} del documento`}
        >
          <Ionicons name="close" size={14} color={colors.onAccent} />
        </Pressable>
        <Text style={styles.hint}>{formatSize(document.size_bytes)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.slot}>
      <Text style={styles.slotLabel}>{label}</Text>
      <View style={[styles.photo, styles.empty]}>
        <Pressable
          onPress={onCamera}
          style={({ pressed }) => [styles.action, styles.actionMain, pressed && styles.actionMainPressed]}
          accessibilityLabel={`Fotografa il ${label.toLowerCase()} del documento`}
        >
          <Ionicons name="camera-outline" size={18} color={colors.onAccent} />
          <Text style={styles.actionMainText}>Fotografa</Text>
        </Pressable>
        <Pressable
          onPress={onLibrary}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          accessibilityLabel={`Scegli il ${label.toLowerCase()} dalla galleria`}
        >
          <Ionicons name="images-outline" size={18} color={colors.accent} />
          <Text style={styles.actionText}>Galleria</Text>
        </Pressable>
      </View>
    </View>
  );
}
