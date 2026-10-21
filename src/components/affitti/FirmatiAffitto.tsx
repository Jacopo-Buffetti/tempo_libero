import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { formatSize } from '@/lib/comprimiFoto';
import {
  isPdf,
  openSignedPdf,
  pickPagePhotos,
  pickPdf,
  useAddSignedFiles,
  useDeleteSignedFile,
  useSignedFiles,
  type SignedFile,
  type SignedKind,
} from '@/lib/firmatiAffitto';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/components/firmatiAffitto';

type Props = {
  orgId?: string;
  rentalId: string;
  kinds: { kind: SignedKind; label: string }[];
};

export function FirmatiAffitto({ orgId, rentalId, kinds }: Props) {
  const styles = useStyles();
  const files = useSignedFiles(rentalId);
  const [zoom, setZoom] = useState<string | null>(null);

  return (
    <View style={styles.wrap}>
      {kinds.map((k) => (
        <SignedBlock
          key={k.kind}
          orgId={orgId}
          rentalId={rentalId}
          kind={k.kind}
          label={k.label}
          files={(files.data ?? []).filter((f) => f.kind === k.kind)}
          loading={files.isLoading}
          onZoom={setZoom}
        />
      ))}

      <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
        <Pressable style={styles.zoom} onPress={() => setZoom(null)} accessibilityLabel="Chiudi">
          {zoom && <Image source={{ uri: zoom }} style={styles.zoomImage} contentFit="contain" />}
        </Pressable>
      </Modal>
    </View>
  );
}

function SignedBlock({
  orgId,
  rentalId,
  kind,
  label,
  files,
  loading,
  onZoom,
}: {
  orgId?: string;
  rentalId: string;
  kind: SignedKind;
  label: string;
  files: SignedFile[];
  loading: boolean;
  onZoom: (url: string) => void;
}) {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const add = useAddSignedFiles(orgId, rentalId);
  const remove = useDeleteSignedFile(rentalId);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const pages = files.filter((f) => !isPdf(f)).length;
  const pdfs = files.length - pages;
  const summary = [
    pages > 0 ? (pages === 1 ? '1 pagina' : `${pages} pagine`) : null,
    pdfs > 0 ? (pdfs === 1 ? '1 PDF' : `${pdfs} PDF`) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  async function addPhotos(source: 'camera' | 'library') {
    setError(null);
    try {
      const photos = await pickPagePhotos(source);
      if (photos.length === 0) return;
      await add.mutateAsync({ kind, photos });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Caricamento non riuscito. Riprova.');
    }
  }

  async function addPdf() {
    setError(null);
    try {
      const pdf = await pickPdf();
      if (!pdf) return;
      await add.mutateAsync({ kind, pdf });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Caricamento non riuscito. Riprova.');
    }
  }

  async function open(file: SignedFile, index: number) {
    if (!isPdf(file)) {
      if (file.url) onZoom(file.url);
      return;
    }
    setError(null);
    setOpening(file.id);
    try {
      await openSignedPdf(file, `${kind}-firmato-${index + 1}`);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Non riesco ad aprire il PDF.');
    } finally {
      setOpening(null);
    }
  }

  function confirmRemove(file: SignedFile) {
    Alert.alert(
      isPdf(file) ? 'Togliere il PDF?' : 'Togliere la pagina?',
      'Il file firmato verrà eliminato.',
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Togli', style: 'destructive', onPress: () => remove.mutate(file) },
      ],
    );
  }

  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <Ionicons
          name={files.length > 0 ? 'checkmark-circle' : 'create-outline'}
          size={20}
          color={files.length > 0 ? colors.accent : colors.muted}
        />
        <View style={styles.flex}>
          <Text style={type.body}>{label}</Text>
          <Text style={type.caption}>{files.length > 0 ? summary : 'Non ancora caricato'}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        files.length > 0 && (
          <View style={styles.grid}>
            {files.map((f, i) => (
              <View key={f.id} style={styles.tile}>
                <Pressable
                  onPress={() => open(f, i)}
                  accessibilityLabel={isPdf(f) ? 'Apri il PDF' : 'Ingrandisci la pagina'}
                >
                  {isPdf(f) ? (
                    <View style={[styles.thumb, styles.pdf]}>
                      {opening === f.id ? (
                        <ActivityIndicator color={colors.accent} />
                      ) : (
                        <>
                          <Ionicons name="document-text" size={28} color={colors.accent} />
                          <Text style={styles.pdfText}>PDF</Text>
                        </>
                      )}
                    </View>
                  ) : f.url ? (
                    <Image
                      source={{ uri: f.url, cacheKey: f.path }}
                      style={styles.thumb}
                      contentFit="cover"
                      transition={150}
                    />
                  ) : (
                    <View style={[styles.thumb, styles.pdf]}>
                      <Ionicons name="image-outline" size={24} color={colors.muted} />
                    </View>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => confirmRemove(f)}
                  hitSlop={8}
                  style={styles.remove}
                  accessibilityLabel="Togli il file"
                >
                  <Ionicons name="close" size={14} color={colors.onAccent} />
                </Pressable>
                <Text style={styles.size}>{formatSize(f.size_bytes)}</Text>
              </View>
            ))}
          </View>
        )
      )}

      {add.isPending ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={type.caption}>Comprimo e carico…</Text>
        </View>
      ) : (
        <View style={styles.buttons}>
          <Pressable
            onPress={() => addPhotos('camera')}
            style={({ pressed }) => [styles.button, styles.buttonMain, pressed && styles.buttonMainPressed]}
            accessibilityLabel={`Fotografa ${label.toLowerCase()}`}
          >
            <Ionicons name="camera-outline" size={18} color={colors.onAccent} />
            <Text style={styles.buttonMainText}>Fotografa</Text>
          </Pressable>
          <Pressable
            onPress={() => addPhotos('library')}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            accessibilityLabel={`Scegli le pagine di ${label.toLowerCase()} dalla galleria`}
          >
            <Ionicons name="images-outline" size={18} color={colors.accent} />
            <Text style={styles.buttonText}>Galleria</Text>
          </Pressable>
          <Pressable
            onPress={addPdf}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            accessibilityLabel={`Carica ${label.toLowerCase()} in PDF`}
          >
            <Ionicons name="document-attach-outline" size={18} color={colors.accent} />
            <Text style={styles.buttonText}>PDF</Text>
          </Pressable>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}
