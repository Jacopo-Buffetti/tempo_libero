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
import * as Haptics from 'expo-haptics';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  COUNT_UNITS,
  ITEM_COLUMNS,
  LOCATIONS,
  MEASURE_UNITS,
  formatQty,
  itemsKeys,
  locationLabel,
  unitInfo,
  type Item,
  type Kind,
  type Location,
} from '@/lib/items';
import { useRole } from '@/lib/ruoli';
import { Chip } from '@/components/Chip';
import { Stepper } from '@/components/Stepper';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/screens/modificaOggetto';

const LOCATION_ICONS: Record<Location, keyof typeof Ionicons.glyphMap> = {
  magazzino: 'cube-outline',
  cucina: 'flame-outline',
  bar: 'wine-outline',
};

export default function ModificaOggetto() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { isConsigliere } = useRole();

  const item = useQuery({
    queryKey: itemsKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('items').select(ITEM_COLUMNS).eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as Item | null;
    },
  });

  const openLines = useQuery({
    queryKey: ['items', 'open-lines', id],
    enabled: !!id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('shopping_list_items')
        .select('id', { count: 'exact', head: true })
        .eq('item_id', id!)
        .eq('checked', false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState<Location>('magazzino');
  const [kind, setKind] = useState<Kind>('consumabile');
  const [unit, setUnit] = useState('pezzi');
  const [minQty, setMinQty] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready || !item.data) return;
    setName(item.data.name);
    setLocation(item.data.location);
    setKind(item.data.kind);
    setUnit(item.data.unit);
    setMinQty(Number(item.data.min_qty ?? 0));
    setReady(true);
  }, [item.data, ready]);

  const cleanName = name.trim();
  const original = item.data;
  const unitLocked = (openLines.data ?? 0) > 0;
  const loseBroken =
    !!original && original.kind === 'attrezzatura' && kind === 'consumabile' && original.broken_qty > 0;

  const save = useMutation({
    mutationFn: async () => {
      if (!original) throw new Error('Oggetto non trovato');
      const { error, count } = await supabase
        .from('items')
        .update(
          {
            name: cleanName,
            location,
            kind,
            unit: unitLocked ? original.unit : unit,
            min_qty: kind === 'consumabile' ? minQty : null,
            broken_qty: kind === 'attrezzatura' ? original.broken_qty : 0,
            updated_at: new Date().toISOString(),
          },
          { count: 'exact' },
        )
        .eq('id', original.id);
      if (error) throw error;
      if (count === 0) throw new Error('forbidden');
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: itemsKeys.all });
      queryClient.invalidateQueries({ queryKey: ['spesa'] });
      router.back();
    },
    onError: (e) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const code = (e as { code?: string }).code;
      setError(
        code === '23505'
          ? `Esiste già “${cleanName}” in ${locationLabel(location)}. Cambia nome o luogo.`
          : e instanceof Error && e.message === 'forbidden'
            ? 'Solo i consiglieri possono modificare l’inventario.'
            : 'Salvataggio non riuscito. Controlla la connessione e riprova.',
      );
    },
  });

  function changeUnit(u: string) {
    setUnit(u);
    if (unitInfo(u).decimals === 0) setMinQty((q) => Math.round(q));
  }

  if (item.isLoading || (item.data && !ready)) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (!original || !isConsigliere) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <Text style={type.heading}>{original ? 'Non puoi modificarlo' : 'Oggetto non trovato'}</Text>
        <Text style={[type.caption, styles.centerText]}>
          {original
            ? 'L’inventario lo modificano i consiglieri.'
            : 'Potrebbe essere stato eliminato da un altro volontario.'}
        </Text>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>Torna indietro</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const canSave = cleanName.length > 0 && !save.isPending;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Annulla</Text>
        </Pressable>
        <Text style={type.heading}>Modifica</Text>
        <View style={styles.back} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={type.label}>Nome</Text>
            <TextInput
              value={name}
              onChangeText={(t) => {
                setName(t);
                setError(null);
              }}
              placeholder="Es. Bicchieri da vino"
              placeholderTextColor={colors.muted}
              autoCapitalize="sentences"
              returnKeyType="done"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Dove va</Text>
            <View style={styles.tiles}>
              {LOCATIONS.map((l) => {
                const active = l.value === location;
                return (
                  <Pressable
                    key={l.value}
                    onPress={() => {
                      setLocation(l.value);
                      setError(null);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={[styles.tile, active && styles.tileActive]}
                  >
                    <Ionicons
                      name={LOCATION_ICONS[l.value]}
                      size={26}
                      color={active ? colors.onAccent : colors.text}
                    />
                    <Text style={[styles.tileText, active && styles.tileTextActive]}>{l.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Tipo</Text>
            <View style={styles.segment}>
              {(
                [
                  { value: 'consumabile', label: 'Si consuma' },
                  { value: 'attrezzatura', label: 'Resta (attrezzatura)' },
                ] as const
              ).map((k) => {
                const active = k.value === kind;
                return (
                  <Pressable
                    key={k.value}
                    onPress={() => setKind(k.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={[styles.segmentItem, active && styles.segmentItemActive]}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{k.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {loseBroken && (
              <Text style={type.caption}>
                I {original.broken_qty} pezzi segnati da riparare torneranno a contare come normali.
              </Text>
            )}
          </View>

          <View style={styles.field}>
            {unitLocked ? (
              <>
                <Text style={type.label}>Unità</Text>
                <Text style={type.body}>{unitInfo(original.unit).label}</Text>
                <Text style={type.caption}>
                  È in una lista della spesa ancora aperta: l’unità si potrà cambiare dopo aver chiuso la
                  lista.
                </Text>
              </>
            ) : (
              <>
                <Text style={type.label}>Si conta in</Text>
                <View style={styles.chips}>
                  {COUNT_UNITS.map((u) => (
                    <Chip
                      key={u}
                      label={u}
                      variant="accent"
                      active={unit === u}
                      onPress={() => changeUnit(u)}
                    />
                  ))}
                </View>
                <Text style={type.label}>Si pesa o si misura in</Text>
                <View style={styles.chips}>
                  {MEASURE_UNITS.map((u) => (
                    <Chip
                      key={u}
                      label={unitInfo(u).label}
                      variant="accent"
                      active={unit === u}
                      onPress={() => changeUnit(u)}
                    />
                  ))}
                </View>
                {unit !== original.unit && (
                  <Text style={type.caption}>
                    La quantità resta {formatQty(original.qty)}: cambia solo l’unità, non viene convertita.
                  </Text>
                )}
              </>
            )}
          </View>

          {kind === 'consumabile' && (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <View style={styles.flex}>
                  <Text style={type.body}>Scorta minima</Text>
                  <Text style={type.caption}>
                    In {unitLocked ? original.unit : unit}: sotto questa va in lista spesa
                  </Text>
                </View>
                <Stepper
                  label="Scorta minima"
                  value={minQty}
                  onChange={setMinQty}
                  unit={unitLocked ? original.unit : unit}
                />
              </View>
            </View>
          )}

          <Text style={type.caption}>
            La quantità si cambia dalla scheda dell’oggetto con i tasti + e −, così resta nello storico.
          </Text>

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={() => save.mutate()}
            disabled={!canSave}
            style={({ pressed }) => [
              styles.saveButton,
              !canSave && styles.saveDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            {save.isPending ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.saveText}>Salva modifiche</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
