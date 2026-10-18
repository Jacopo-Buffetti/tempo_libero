import { useState } from 'react';
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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  COUNT_UNITS,
  LOCATIONS,
  MEASURE_UNITS,
  isLocation,
  unitInfo,
  itemsKeys,
  locationLabel,
  type Kind,
  type Location,
} from '@/lib/items';
import { useMembership } from '@/providers/AuthProvider';
import { Chip } from '@/components/Chip';
import { Stepper } from '@/components/Stepper';
import { colors, type } from '@/theme/tokens';
import { styles } from '@/styles/screens/nuovoOggetto';

const LOCATION_ICONS: Record<Location, keyof typeof Ionicons.glyphMap> = {
  magazzino: 'cube-outline',
  cucina: 'flame-outline',
  bar: 'wine-outline',
};

export default function NuovoOggetto() {
  const params = useLocalSearchParams<{ location?: string }>();
  const membership = useMembership();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [location, setLocation] = useState<Location>(
    isLocation(params.location) ? params.location : 'magazzino',
  );
  const [kind, setKind] = useState<Kind>('consumabile');
  const [unit, setUnit] = useState('pezzi');
  const [qty, setQty] = useState(0);
  const [minQty, setMinQty] = useState(0);
  const [brokenQty, setBrokenQty] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const cleanName = name.trim();
  const label = locationLabel(location);

  const save = useMutation({
    mutationFn: async () => {
      const orgId = membership.data?.org_id;
      if (!orgId) throw new Error('Nessuna Pro Loco collegata');

      const { error } = await supabase.from('items').insert({
        org_id: orgId,
        name: cleanName,
        location,
        kind,
        unit,
        qty,
        min_qty: kind === 'consumabile' ? minQty : null,
        broken_qty: kind === 'attrezzatura' ? Math.min(brokenQty, qty) : 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: itemsKeys.all });
      router.back();
    },
    onError: (e) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const code = (e as { code?: string }).code;
      setError(
        code === '23505'
          ? `Esiste già “${cleanName}” in ${label}. Cambia nome o modifica quello esistente.`
          : 'Salvataggio non riuscito. Controlla la connessione e riprova.',
      );
    },
  });

  function changeUnit(u: string) {
    setUnit(u);
    if (unitInfo(u).decimals === 0) {
      setQty((q) => Math.round(q));
      setMinQty((q) => Math.round(q));
    }
  }

  function changeQty(n: number) {
    setQty(n);
    if (brokenQty > n) setBrokenQty(n);
  }

  const canSave = cleanName.length > 0 && !save.isPending;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Annulla</Text>
        </Pressable>
        <Text style={type.heading}>Nuovo oggetto</Text>
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
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Si conta in</Text>
            <View style={styles.chips}>
              {COUNT_UNITS.map((u) => (
                <Chip key={u} label={u} variant="accent" active={unit === u} onPress={() => changeUnit(u)} />
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
          </View>

          <View style={styles.card}>
            <View style={[styles.cardRow, styles.cardDivider]}>
              <View style={styles.flex}>
                <Text style={type.body}>Quantità</Text>
                <Text style={type.caption}>In {unit}</Text>
              </View>
              <Stepper label="Quantità" value={qty} onChange={changeQty} unit={unit} />
            </View>

            {kind === 'consumabile' ? (
              <View style={styles.cardRow}>
                <View style={styles.flex}>
                  <Text style={type.body}>Scorta minima</Text>
                  <Text style={type.caption}>In {unit}: sotto questa va in lista spesa</Text>
                </View>
                <Stepper label="Scorta minima" value={minQty} onChange={setMinQty} unit={unit} />
              </View>
            ) : (
              <View style={styles.cardRow}>
                <View style={styles.flex}>
                  <Text style={type.body}>Da riparare</Text>
                  <Text style={type.caption}>Non contano come disponibili</Text>
                </View>
                <Stepper label="Da riparare" value={brokenQty} onChange={setBrokenQty} max={qty} />
              </View>
            )}
          </View>

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
              <Text style={styles.saveText}>Salva in {label}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
