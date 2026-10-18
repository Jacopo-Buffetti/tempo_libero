import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import {
  pickPoster,
  posterUrl,
  useDeleteEvent,
  useEvent,
  useSetPoster,
  useUpdateEvent,
  type PriceMode,
} from '@/lib/menu';
import { centsToInput, errorMessage, parseEuro } from '@/lib/spesa';
import { DateTimeField } from '@/components/DateTimeField';
import { PriceModeField } from '@/components/PriceModeField';
import { colors, type } from '@/theme/tokens';
import { styles } from '@/styles/screens/menu/modifica';

export default function ModificaMenu() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = useEvent(id);
  const e = event.data;

  const update = useUpdateEvent(id);
  const setPoster = useSetPoster(e?.org_id, id);
  const remove = useDeleteEvent(e?.org_id, id);

  const [name, setName] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [priceMode, setPriceMode] = useState<PriceMode>('per_piatto');
  const [fixedPrice, setFixedPrice] = useState('');
  const [fixedNote, setFixedNote] = useState('');
  const [place, setPlace] = useState('');
  const [notes, setNotes] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready || !e) return;
    setName(e.name);
    setDate(e.starts_on);
    setTime(e.start_time);
    setPriceMode(e.price_mode);
    setFixedPrice(centsToInput(e.fixed_price_cents));
    setFixedNote(e.fixed_price_note ?? '');
    setPlace(e.place ?? '');
    setNotes(e.notes ?? '');
    setReady(true);
  }, [ready, e]);

  if (!ready || !e) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const ev = e;
  const url = posterUrl(ev.poster_path);
  const cleanName = name.trim();
  const fixedCents = parseEuro(fixedPrice);
  const priceInvalid = priceMode === 'fisso' && fixedPrice.trim() !== '' && fixedCents == null;
  const canSave = cleanName.length > 0 && !!date && !priceInvalid && !update.isPending;

  function save() {
    setError(null);
    update.mutate(
      {
        name: cleanName,
        starts_on: date!,
        start_time: time,
        place: place.trim() || null,
        notes: notes.trim() || null,
        price_mode: priceMode,
        fixed_price_cents: priceMode === 'fisso' ? fixedCents : null,
        fixed_price_note: priceMode === 'fisso' ? fixedNote.trim() || null : null,
      },
      {
        onSuccess: () => router.back(),
        onError: (err) => setError(errorMessage(err, 'Modifica non salvata. Riprova.')),
      },
    );
  }

  async function changePoster() {
    const asset = await pickPoster();
    if (!asset) return;
    setError(null);
    setPoster.mutate(
      { asset: { uri: asset.uri, width: asset.width }, oldPath: ev.poster_path },
      { onError: (err) => setError(errorMessage(err, 'Caricamento non riuscito. Riprova.')) },
    );
  }

  function removePoster() {
    Alert.alert('Togliere la locandina?', 'Il file verrà eliminato.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Togli',
        style: 'destructive',
        onPress: () => setPoster.mutate({ asset: null, oldPath: ev.poster_path }),
      },
    ]);
  }

  function confirmDelete() {
    Alert.alert(
      'Eliminare l’evento?',
      `“${ev.name}”, il suo menù (${ev.dishes.length} piatti) e la locandina verranno eliminati.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () =>
            remove.mutate(undefined, {
              onSuccess: () => router.dismissAll(),
              onError: (err) =>
                setError(err instanceof Error && err.message ? err.message : 'Eliminazione non riuscita.'),
            }),
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Annulla</Text>
        </Pressable>
        <Text style={type.heading}>Modifica evento</Text>
        <View style={styles.back} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={type.label}>Locandina</Text>
            <View style={styles.posterRow}>
              {setPoster.isPending ? (
                <View style={[styles.poster, styles.posterEmpty]}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : url ? (
                <Image source={{ uri: url }} style={styles.poster} contentFit="cover" />
              ) : (
                <View style={[styles.poster, styles.posterEmpty]}>
                  <Ionicons name="image-outline" size={26} color={colors.muted} />
                </View>
              )}
              <View style={styles.posterActions}>
                <Pressable onPress={changePoster} disabled={setPoster.isPending} style={styles.linkButton}>
                  <Text style={styles.link}>{url ? 'Cambia locandina' : 'Carica locandina'}</Text>
                </Pressable>
                {url && (
                  <Pressable onPress={removePoster} disabled={setPoster.isPending} style={styles.linkButton}>
                    <Text style={[styles.link, { color: colors.warn }]}>Togli</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Evento</Text>
            <TextInput value={name} onChangeText={setName} style={styles.input} />
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Quando</Text>
            <DateTimeField date={date} time={time} onChangeDate={setDate} onChangeTime={setTime} />
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Dove</Text>
            <TextInput
              value={place}
              onChangeText={setPlace}
              placeholder="Es. Piazza della chiesa"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Prezzi</Text>
            <PriceModeField
              mode={priceMode}
              onChangeMode={setPriceMode}
              price={fixedPrice}
              onChangePrice={setFixedPrice}
              note={fixedNote}
              onChangeNote={setFixedNote}
              priceInvalid={priceInvalid}
            />
            {priceMode === 'fisso' && ev.price_mode !== 'fisso' && (
              <Text style={type.caption}>
                I prezzi dei singoli piatti restano salvati: se torni a “Prezzo per piatto” li ritrovi.
              </Text>
            )}
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Note</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Es. prenotazione consigliata, musica dal vivo…"
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.input, styles.multiline]}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.danger}>
            <Pressable
              onPress={confirmDelete}
              disabled={remove.isPending}
              style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.85 }]}
            >
              {remove.isPending ? (
                <ActivityIndicator color={colors.warn} />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={18} color={colors.warn} />
                  <Text style={styles.deleteText}>Elimina l’evento</Text>
                </>
              )}
            </Pressable>
            <Text style={[type.caption, styles.center]}>
              Può eliminarlo chi l’ha creato o un amministratore.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={save}
            disabled={!canSave}
            style={({ pressed }) => [
              styles.saveButton,
              !canSave && styles.saveDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            {update.isPending ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.saveText}>Salva le modifiche</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
