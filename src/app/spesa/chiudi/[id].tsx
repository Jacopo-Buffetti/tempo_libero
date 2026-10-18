import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  errorMessage,
  formatEuro,
  localIsoDate,
  parseEuro,
  useCloseList,
  useList,
  useListItems,
  type PaymentSource,
} from '@/lib/spesa';
import { Chip } from '@/components/Chip';
import { formatQty } from '@/lib/items';
import { colors, type } from '@/theme/tokens';
import { styles } from '@/styles/screens/spesa/chiudi';

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localIsoDate(d);
};

export default function ChiudiLista() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const list = useList(id);
  const items = useListItems(id);
  const close = useCloseList(id);

  const [shop, setShop] = useState('');
  const [day, setDay] = useState<'oggi' | 'ieri'>('oggi');
  const [paidBy, setPaidBy] = useState<PaymentSource>('cassa');
  const [carryOver, setCarryOver] = useState(true);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const lines = useMemo(() => (items.data ?? []).filter((i) => i.checked), [items.data]);
  const notTaken = (items.data ?? []).filter((i) => !i.checked);

  const parsed = lines.map((l) => parseEuro(prices[l.id] ?? ''));
  const total = parsed.reduce<number>((s, c) => s + (c ?? 0), 0);
  const missing = parsed.filter((c) => c == null).length;
  const invalid = lines.some(
    (l) => (prices[l.id] ?? '').trim() !== '' && parseEuro(prices[l.id]) == null,
  );

  function save() {
    setError(null);
    close.mutate(
      {
        shop,
        closedOn: day === 'oggi' ? localIsoDate() : yesterday(),
        paidBy,
        prices: lines.map((l, i) => ({ id: l.id, price_cents: parsed[i] })),
        carryOver,
      },
      {
        onSuccess: () => router.back(),
        onError: (e) => setError(errorMessage(e, 'Chiusura non riuscita. Riprova.')),
      },
    );
  }

  if (items.isLoading || list.isLoading) {
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
        <Text style={type.heading}>Chiudi la lista</Text>
        <View style={styles.back} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={type.caption}>
            {list.data?.name}. I prodotti spuntati sono già entrati in inventario: qui registri
            solo dove hai comprato e quanto hai speso.
          </Text>

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
            <Text style={type.label}>Prezzi · {lines.length} comprati</Text>
            <View style={styles.card}>
              {lines.map((l, i) => {
                const text = prices[l.id] ?? '';
                const bad = text.trim() !== '' && parsed[i] == null;
                return (
                  <View key={l.id} style={[styles.line, i < lines.length - 1 && styles.divider]}>
                    <View style={styles.flex}>
                      <Text style={type.body} numberOfLines={1}>{l.name}</Text>
                      <Text style={type.caption}>
                        {formatQty(l.qty)} {l.unit}
                        {l.note ? ` · ${l.note}` : ''}
                      </Text>
                    </View>
                    <View style={[styles.priceBox, bad && styles.priceBad]}>
                      <Text style={styles.euro}>€</Text>
                      <TextInput
                        value={text}
                        onChangeText={(t) => setPrices((p) => ({ ...p, [l.id]: t }))}
                        placeholder="0,00"
                        placeholderTextColor={colors.placeholder}
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

          {notTaken.length > 0 && (
            <View style={styles.carry}>
              <View style={styles.flex}>
                <Text style={type.body}>
                  {notTaken.length === 1 ? '1 voce non presa' : `${notTaken.length} voci non prese`}
                </Text>
                <Text style={type.caption}>
                  {carryOver
                    ? 'Andranno in una nuova lista, da finire'
                    : 'Verranno tolte, la lista si chiude così'}
                </Text>
              </View>
              <Switch
                value={carryOver}
                onValueChange={setCarryOver}
                trackColor={{ true: colors.accent, false: colors.segment }}
                thumbColor={colors.onAccent}
              />
            </View>
          )}

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
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.saveText}>Chiudi la lista</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
