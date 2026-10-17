import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
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
  LOCATIONS,
  UNITS,
  isLocation,
  itemsKeys,
  locationLabel,
  type Kind,
  type Location,
} from '@/lib/items';
import { useMembership } from '@/providers/AuthProvider';
import { Chip } from '@/components/Chip';
import { Stepper } from '@/components/Stepper';
import { colors, font, radius, space, touch, type } from '@/theme/tokens';

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

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
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
                      color={active ? '#FFFFFF' : colors.text}
                    />
                    <Text style={[styles.tileText, active && styles.tileTextActive]}>
                      {l.label}
                    </Text>
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
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {k.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Unità</Text>
            <View style={styles.chips}>
              {UNITS.map((u) => (
                <Chip
                  key={u}
                  label={u}
                  variant="accent"
                  active={unit === u}
                  onPress={() => setUnit(u)}
                />
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <View style={[styles.cardRow, styles.cardDivider]}>
              <Text style={[type.body, styles.flex]}>Quantità</Text>
              <Stepper label="Quantità" value={qty} onChange={changeQty} />
            </View>

            {kind === 'consumabile' ? (
              <View style={styles.cardRow}>
                <View style={styles.flex}>
                  <Text style={type.body}>Scorta minima</Text>
                  <Text style={type.caption}>Sotto questa va in lista spesa</Text>
                </View>
                <Stepper label="Scorta minima" value={minQty} onChange={setMinQty} />
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
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveText}>Salva in {label}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space(2),
    paddingVertical: space(1),
  },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: touch, width: 96 },
  backText: { fontFamily: font.bold, fontSize: 15, color: colors.accent },

  content: { padding: space(5), gap: space(5) },
  field: { gap: space(2) },
  input: {
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space(3.5),
    fontFamily: font.bold,
    fontSize: 16,
    color: colors.text,
  },

  tiles: { flexDirection: 'row', gap: space(2) },
  tile: {
    flex: 1,
    height: 88,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(1.5),
  },
  tileActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tileText: { fontFamily: font.bold, fontSize: 14, color: colors.text },
  tileTextActive: { color: '#FFFFFF' },

  segment: {
    flexDirection: 'row',
    gap: space(1.5),
    backgroundColor: colors.segment,
    borderRadius: radius.md,
    padding: space(1),
  },
  segmentItem: {
    flex: 1,
    minHeight: touch,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemActive: {
    backgroundColor: colors.surface,
    shadowColor: colors.text,
    shadowOpacity: 0.12,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: { fontFamily: font.medium, fontSize: 14, color: colors.muted },
  segmentTextActive: { fontFamily: font.bold, color: colors.text },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },

  card: { backgroundColor: colors.surface, borderRadius: radius.lg },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingVertical: space(3),
    paddingLeft: space(4),
    paddingRight: space(3),
  },
  cardDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },

  error: { fontFamily: font.bold, fontSize: 14, color: colors.warn },

  footer: { paddingHorizontal: space(5), paddingTop: space(3), paddingBottom: space(3) },
  saveButton: {
    height: 54,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveDisabled: { opacity: 0.45 },
  saveText: { fontFamily: font.black, fontSize: 16, color: '#FFFFFF' },
});
