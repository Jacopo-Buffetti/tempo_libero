import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { centsToInput, formatEuro, parseEuro } from '@/lib/spesa';
import {
  isReading,
  receiptsTotal,
  takeReceiptPhoto,
  useAddReceipts,
  useDeleteReceipt,
  useReceipts,
  useRetryReceipt,
  useSetReceiptTotal,
  type Receipt,
} from '@/lib/scontrini';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/components/scontrini';

type Props = {
  orgId?: string;
  listId: string;
  runId?: string | null;
  title?: string;
};

export function Scontrini({ orgId, listId, runId = null, title = 'Scontrini' }: Props) {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const receipts = useReceipts(listId, runId);
  const add = useAddReceipts(orgId, listId, runId);
  const [zoom, setZoom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = receipts.data ?? [];
  const total = receiptsTotal(list);
  const missing = list.filter((r) => r.total_cents == null && !isReading(r)).length;
  const anyReading = list.some(isReading);

  useEffect(() => {
    if (!anyReading) return;
    const timer = setInterval(() => receipts.refetch(), 4000);
    return () => clearInterval(timer);
  }, [anyReading, receipts]);

  async function addFrom(source: 'camera' | 'library') {
    setError(null);
    try {
      const assets = await takeReceiptPhoto(source);
      if (assets.length === 0) return;
      add.mutate(assets, {
        onError: (e) =>
          setError(e instanceof Error && e.message ? e.message : 'Caricamento non riuscito. Riprova.'),
      });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Non riesco ad aprire la fotocamera.');
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={type.label}>
          {title}
          {list.length ? ` · ${list.length}` : ''}
        </Text>
        {list.length > 0 && <Text style={styles.total}>{formatEuro(total)}</Text>}
      </View>

      {list.length > 0 && (
        <View style={styles.grid}>
          {list.map((r) => (
            <ReceiptCard key={r.id} receipt={r} listId={listId} onZoom={() => r.url && setZoom(r.url)} />
          ))}
        </View>
      )}

      {missing > 0 && (
        <Text style={styles.warn}>
          {missing === 1
            ? 'Uno scontrino non si legge: scrivi tu l’importo.'
            : `${missing} scontrini non si leggono: scrivi tu gli importi.`}
        </Text>
      )}

      {add.isPending ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={type.caption}>Carico e leggo gli scontrini…</Text>
        </View>
      ) : (
        <View style={styles.buttons}>
          <Pressable
            onPress={() => addFrom('camera')}
            style={({ pressed }) => [styles.button, styles.buttonMain, pressed && styles.buttonMainPressed]}
          >
            <Ionicons name="camera-outline" size={20} color={colors.onAccent} />
            <Text style={styles.buttonMainText}>Fotografa</Text>
          </Pressable>
          <Pressable
            onPress={() => addFrom('library')}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Ionicons name="images-outline" size={20} color={colors.accent} />
            <Text style={styles.buttonText}>Dalla galleria</Text>
          </Pressable>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
        <Pressable style={styles.zoom} onPress={() => setZoom(null)} accessibilityLabel="Chiudi">
          {zoom && <Image source={{ uri: zoom }} style={styles.zoomImage} contentFit="contain" />}
        </Pressable>
      </Modal>
    </View>
  );
}

function ReceiptCard({ receipt, listId, onZoom }: { receipt: Receipt; listId: string; onZoom: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const setTotal = useSetReceiptTotal(listId);
  const retry = useRetryReceipt(listId);
  const remove = useDeleteReceipt(listId);
  const [text, setText] = useState(centsToInput(receipt.total_cents));

  useEffect(() => {
    setText(centsToInput(receipt.total_cents));
  }, [receipt.total_cents]);

  const reading = isReading(receipt) || retry.isPending;
  const bad = text.trim() !== '' && parseEuro(text) == null;

  function commit() {
    const cents = parseEuro(text);
    if (text.trim() !== '' && cents == null) return;
    if (cents !== receipt.total_cents) setTotal.mutate({ id: receipt.id, cents });
  }

  function confirmRemove() {
    Alert.alert('Togliere lo scontrino?', 'La foto verrà eliminata e il suo importo tolto dal totale.', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Togli', style: 'destructive', onPress: () => remove.mutate(receipt) },
    ]);
  }

  return (
    <View style={styles.card}>
      <Pressable onPress={onZoom} accessibilityLabel="Ingrandisci lo scontrino">
        {receipt.url ? (
          <Image source={{ uri: receipt.url }} style={styles.photo} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.photo, styles.photoEmpty]}>
            <Ionicons name="receipt-outline" size={24} color={colors.muted} />
          </View>
        )}
      </Pressable>
      <Pressable
        onPress={confirmRemove}
        hitSlop={8}
        style={styles.remove}
        accessibilityLabel="Togli lo scontrino"
      >
        <Ionicons name="close" size={14} color={colors.onAccent} />
      </Pressable>

      {reading ? (
        <View style={styles.reading}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.readingText}>Leggo…</Text>
        </View>
      ) : (
        <>
          <View style={[styles.amount, (bad || receipt.total_cents == null) && styles.amountWarn]}>
            <Text style={styles.euro}>€</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              onEndEditing={commit}
              placeholder="0,00"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              accessibilityLabel="Totale dello scontrino"
              style={styles.amountInput}
            />
          </View>
          {receipt.status === 'illeggibile' || (receipt.status === 'da_leggere' && !reading) ? (
            <>
              <Pressable onPress={() => retry.mutate(receipt.id)} hitSlop={6}>
                <Text style={styles.retry}>Riprova a leggere</Text>
              </Pressable>
              {!!receipt.error && (
                <Pressable onPress={() => Alert.alert('Perché non si legge', receipt.error!)} hitSlop={6}>
                  <Text style={styles.errorHint} numberOfLines={3}>
                    {receipt.error}
                  </Text>
                </Pressable>
              )}
            </>
          ) : (
            <Text style={styles.status} numberOfLines={1}>
              {receipt.status === 'letto' ? (receipt.shop ?? 'Letto') : 'Inserito a mano'}
            </Text>
          )}
        </>
      )}
    </View>
  );
}
