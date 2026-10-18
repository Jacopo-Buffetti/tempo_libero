import { useMemo, useState } from 'react';
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
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  formatEuro,
  localIsoDate,
  parseEuro,
  useCloseShoppingTrip,
  useShoppingList,
  type PaymentSource,
} from '@/lib/spesa';
import { useMembership } from '@/providers/AuthProvider';
import { Chip } from '@/components/Chip';
import { colors, font, radius, space, touch, type } from '@/theme/tokens';

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localIsoDate(d);
};

export default function ChiudiSpesa() {
  const membership = useMembership();
  const orgId = membership.data?.org_id;
  const list = useShoppingList(orgId);
  const close = useCloseShoppingTrip(orgId);

  const [shop, setShop] = useState('');
  const [day, setDay] = useState<'oggi' | 'ieri'>('oggi');
  const [paidBy, setPaidBy] = useState<PaymentSource>('cassa');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const lines = useMemo(() => (list.data ?? []).filter((s) => s.checked), [list.data]);

  const parsed = lines.map((l) => parseEuro(prices[l.id] ?? ''));
  const total = parsed.reduce<number>((sum, c) => sum + (c ?? 0), 0);
  const missing = parsed.filter((c) => c == null).length;
  const invalid = lines.some((l) => (prices[l.id] ?? '').trim() !== '' && parseEuro(prices[l.id]) == null);

  function save() {
    setError(null);
    close.mutate(
      {
        shop,
        tripDate: day === 'oggi' ? localIsoDate() : yesterday(),
        paidBy,
        lines: lines.map((l, i) => ({ shopping_item_id: l.id, price_cents: parsed[i] })),
      },
      {
        onSuccess: () => router.back(),
        onError: () => setError('Salvataggio non riuscito. Controlla la connessione e riprova.'),
      },
    );
  }

  if (list.isLoading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Lista</Text>
        </Pressable>
        <Text style={type.heading}>Chiudi la spesa</Text>
        <View style={styles.back} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={type.label}>Negozio</Text>
            <TextInput
              value={shop}
              onChangeText={setShop}
              placeholder="Es. Supermercato, Ingrosso"
              placeholderTextColor={colors.muted}
              autoCapitalize="sentences"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Quando</Text>
            <View style={styles.chips}>
              <Chip label="Oggi" variant="accent" active={day === 'oggi'} onPress={() => setDay('oggi')} />
              <Chip label="Ieri" variant="accent" active={day === 'ieri'} onPress={() => setDay('ieri')} />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Pagato con</Text>
            <View style={styles.segment}>
              {(
                [
                  { value: 'cassa', label: 'Cassa Pro Loco' },
                  { value: 'volontario', label: 'Anticipato da me' },
                ] as const
              ).map((p) => {
                const active = p.value === paidBy;
                return (
                  <Pressable
                    key={p.value}
                    onPress={() => setPaidBy(p.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={[styles.segmentItem, active && styles.segmentItemActive]}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Prezzi · {lines.length} articoli</Text>
            <View style={styles.card}>
              {lines.map((l, i) => {
                const text = prices[l.id] ?? '';
                const bad = text.trim() !== '' && parsed[i] == null;
                return (
                  <View
                    key={l.id}
                    style={[styles.line, i < lines.length - 1 && styles.divider]}
                  >
                    <View style={styles.flex}>
                      <Text style={type.body} numberOfLines={1}>{l.name}</Text>
                      <Text style={type.caption}>
                        {l.qty} {l.unit}
                      </Text>
                    </View>
                    <View style={[styles.priceBox, bad && styles.priceBad]}>
                      <Text style={styles.euro}>€</Text>
                      <TextInput
                        value={text}
                        onChangeText={(t) => setPrices((p) => ({ ...p, [l.id]: t }))}
                        placeholder="0,00"
                        placeholderTextColor="#9AA1B2"
                        keyboardType="decimal-pad"
                        accessibilityLabel={`Prezzo di ${l.name}`}
                        style={styles.priceInput}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
            <Text style={type.caption}>
              Puoi lasciare dei prezzi vuoti e completarli dopo dallo storico.
            </Text>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.totalRow}>
            <View>
              <Text style={type.body}>Totale</Text>
              {missing > 0 && (
                <Text style={[type.caption, { color: colors.warn }]}>
                  {missing === 1 ? '1 prezzo da inserire' : `${missing} prezzi da inserire`}
                </Text>
              )}
            </View>
            <Text style={styles.total}>{formatEuro(total)}</Text>
          </View>
          <Pressable
            onPress={save}
            disabled={lines.length === 0 || invalid || close.isPending}
            style={({ pressed }) => [
              styles.saveButton,
              (lines.length === 0 || invalid) && styles.saveDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            {close.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveText}>Salva e aggiorna l’inventario</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space(2),
    paddingVertical: space(1),
  },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: touch, width: 80 },
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
  chips: { flexDirection: 'row', gap: space(2) },

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

  card: { backgroundColor: colors.surface, borderRadius: radius.lg },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingVertical: space(2.5),
    paddingLeft: space(4),
    paddingRight: space(3),
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  priceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: touch,
    paddingHorizontal: space(3),
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: colors.bg,
  },
  priceBad: { borderColor: colors.warn, backgroundColor: colors.warnSoft },
  euro: { fontFamily: font.bold, fontSize: 15, color: colors.muted },
  priceInput: {
    width: 72,
    textAlign: 'right',
    fontFamily: font.black,
    fontSize: 16,
    color: colors.text,
    padding: 0,
  },

  error: { fontFamily: font.bold, fontSize: 14, color: colors.warn },

  footer: {
    paddingHorizontal: space(5),
    paddingTop: space(3),
    paddingBottom: space(3),
    gap: space(3),
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.segment,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  total: { fontFamily: font.black, fontSize: 28, letterSpacing: -0.5, color: colors.text },
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
