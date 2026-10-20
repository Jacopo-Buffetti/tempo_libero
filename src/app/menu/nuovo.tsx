import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { nextWeekday, pickPoster, useCreateEvent, useEvents, type PriceMode } from '@/lib/menu';
import { centsToInput, errorMessage, parseEuro } from '@/lib/spesa';
import { useMembership } from '@/providers/AuthProvider';
import { Chip } from '@/components/Chip';
import { DateTimeField } from '@/components/DateTimeField';
import { PriceModeField } from '@/components/PriceModeField';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/screens/menu/nuovo';

export default function NuovoMenu() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const membership = useMembership();
  const orgId = membership.data?.org_id;
  const events = useEvents(orgId);
  const create = useCreateEvent(orgId);

  const [name, setName] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [priceMode, setPriceMode] = useState<PriceMode>('per_piatto');
  const [fixedPrice, setFixedPrice] = useState('');
  const [fixedNote, setFixedNote] = useState('');
  const [place, setPlace] = useState('');
  const [copyFrom, setCopyFrom] = useState<string | null>(from ?? null);
  const [poster, setPoster] = useState<{ uri: string; width: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const source = events.data?.find((e) => e.id === copyFrom);

  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (prefilled || !from || !source) return;
    setName(source.name);
    setTime(source.start_time);
    setPlace(source.place ?? '');
    setPriceMode(source.price_mode);
    setFixedPrice(centsToInput(source.fixed_price_cents));
    setPrefilled(true);
  }, [prefilled, from, source]);

  const cleanName = name.trim();
  const fixedCents = parseEuro(fixedPrice);
  const priceInvalid = priceMode === 'fisso' && fixedPrice.trim() !== '' && fixedCents == null;
  const canSave = cleanName.length > 0 && !!date && !priceInvalid && !create.isPending;

  async function choosePoster() {
    const asset = await pickPoster();
    if (asset) setPoster({ uri: asset.uri, width: asset.width });
  }

  function save() {
    setError(null);
    create.mutate(
      {
        name: cleanName,
        startsOn: date!,
        startTime: time,
        place,
        copyFrom,
        poster,
        priceMode,
        fixedPriceCents: fixedCents,
        fixedPriceNote: fixedNote,
      },
      {
        onSuccess: (id) => router.replace({ pathname: '/menu/[id]', params: { id } }),
        onError: (e) => setError(errorMessage(e, 'Creazione non riuscita. Riprova.')),
      },
    );
  }

  const recent = (events.data ?? []).slice(0, 6);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Annulla</Text>
        </Pressable>
        <Text style={type.heading}>Nuovo menù</Text>
        <View style={styles.back} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {recent.length > 0 && (
            <View style={styles.field}>
              <Text style={type.label}>Parti da un menù passato</Text>
              <View style={styles.chips}>
                <Chip label="Da zero" active={!copyFrom} onPress={() => setCopyFrom(null)} />
                {recent.map((e) => (
                  <Chip
                    key={e.id}
                    label={`${e.name} · ${new Date(`${e.starts_on}T12:00:00`).getFullYear()}`}
                    active={copyFrom === e.id}
                    onPress={() => setCopyFrom(e.id)}
                  />
                ))}
              </View>
              {source && (
                <Text style={type.caption}>
                  Copieremo i {source.dishes} piatti di “{source.name}”: poi li puoi modificare.
                </Text>
              )}
            </View>
          )}

          <View style={styles.field}>
            <Text style={type.label}>Evento</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Es. Castagnata"
              placeholderTextColor={colors.muted}
              autoCapitalize="sentences"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Quando</Text>
            <View style={styles.chips}>
              <Chip
                label="Sabato prossimo"
                variant="accent"
                active={date === nextWeekday(6)}
                onPress={() => setDate(nextWeekday(6))}
              />
              <Chip
                label="Domenica prossima"
                variant="accent"
                active={date === nextWeekday(0)}
                onPress={() => setDate(nextWeekday(0))}
              />
            </View>
            <DateTimeField date={date} time={time} onChangeDate={setDate} onChangeTime={setTime} />
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Dove</Text>
            <TextInput
              value={place}
              onChangeText={setPlace}
              placeholder="Es. Piazza della chiesa"
              placeholderTextColor={colors.muted}
              autoCapitalize="sentences"
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
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Locandina</Text>
            {poster ? (
              <View style={styles.posterRow}>
                <Image source={{ uri: poster.uri }} style={styles.poster} contentFit="cover" />
                <View style={styles.posterActions}>
                  <Pressable onPress={choosePoster} style={styles.linkButton}>
                    <Text style={styles.link}>Cambia</Text>
                  </Pressable>
                  <Pressable onPress={() => setPoster(null)} style={styles.linkButton}>
                    <Text style={[styles.link, { color: colors.warn }]}>Togli</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={choosePoster}
                style={({ pressed }) => [styles.upload, pressed && { backgroundColor: colors.bg }]}
              >
                <Ionicons name="image-outline" size={26} color={colors.muted} />
                <View>
                  <Text style={type.body}>Carica la locandina</Text>
                  <Text style={type.caption}>Dalla galleria; puoi aggiungerla anche dopo</Text>
                </View>
              </Pressable>
            )}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
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
            {create.isPending ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.saveText}>Crea il menù</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
