import { useEffect, useMemo, useState } from 'react';
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
  useRegisterRun,
  useRuns,
  type PaymentSource,
} from '@/lib/spesa';
import { qtyWithUnit } from '@/lib/items';
import { receiptsTotal, useReceipts } from '@/lib/scontrini';
import { useMembership } from '@/providers/AuthProvider';
import { Chip } from '@/components/Chip';
import { Scontrini } from '@/components/spesa/Scontrini';
import { colors, type } from '@/theme/tokens';
import { styles } from '@/styles/screens/spesa/chiudi';

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localIsoDate(d);
};

export default function RegistraOChiudi() {
  const { id, mode: modeParam } = useLocalSearchParams<{ id: string; mode?: string }>();
  const mode: 'registra' | 'chiudi' = modeParam === 'registra' ? 'registra' : 'chiudi';
  const membership = useMembership();
  const list = useList(id);
  const items = useListItems(id);
  const runs = useRuns(id);
  const receipts = useReceipts(id, null);
  const register = useRegisterRun(id);
  const close = useCloseList(id);

  const [shop, setShop] = useState('');
  const [day, setDay] = useState<'oggi' | 'ieri'>('oggi');
  const [paidBy, setPaidBy] = useState<PaymentSource>('cassa');
  const [carryOver, setCarryOver] = useState(true);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const pending = useMemo(() => (items.data ?? []).filter((i) => i.checked && !i.run_id), [items.data]);
  const notTaken = (items.data ?? []).filter((i) => !i.checked);
  const pendingReceipts = receipts.data ?? [];
  const hasPending = pending.length > 0 || pendingReceipts.length > 0;
  const hasReceipts = pendingReceipts.length > 0;
  const runList = runs.data ?? [];
  const alreadySpent = runList.reduce((sum, r) => sum + r.total_cents, 0);

  const parsed = pending.map((l) => parseEuro(prices[l.id] ?? ''));
  const itemsTotal = parsed.reduce<number>((s, c) => s + (c ?? 0), 0);
  const missing = parsed.filter((c) => c == null).length;
  const receiptsCents = receiptsTotal(pendingReceipts);
  const receiptsMissing = pendingReceipts.filter((r) => r.total_cents == null).length;
  const thisRun = hasReceipts ? receiptsCents : itemsTotal;
  const invalid = pending.some((l) => (prices[l.id] ?? '').trim() !== '' && parseEuro(prices[l.id]) == null);

  useEffect(() => {
    const found = pendingReceipts.find((r) => r.shop)?.shop;
    if (found && shop === '') setShop(found);
  }, [pendingReceipts, shop]);

  const busy = register.isPending || close.isPending;
  const canSubmit =
    !busy && !invalid && (mode === 'registra' ? hasPending : hasPending || runList.length > 0);

  function submit() {
    setError(null);
    const payload = {
      shop,
      paidBy,
      prices: pending.map((l, i) => ({ id: l.id, price_cents: parsed[i] })),
    };
    const date = day === 'oggi' ? localIsoDate() : yesterday();
    const done = {
      onSuccess: () => router.back(),
      onError: (e: unknown) => setError(errorMessage(e, 'Operazione non riuscita. Riprova.')),
    };
    if (mode === 'registra') {
      register.mutate({ ...payload, runDate: date }, done);
    } else {
      close.mutate({ ...payload, closedOn: date, carryOver }, done);
    }
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
        <Text style={type.heading}>{mode === 'registra' ? 'Registra la spesa' : 'Chiudi la lista'}</Text>
        <View style={styles.back} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={type.caption}>
            {mode === 'registra'
              ? `${list.data?.name}. Salvi quello che hai comprato adesso: la lista resta aperta e puoi continuare ad aggiungere voci e fare altre spese.`
              : `${list.data?.name}. La lista viene chiusa e finisce nello storico.${runList.length ? ` Ci sono già ${runList.length} ${runList.length === 1 ? 'spesa registrata' : 'spese registrate'} per ${formatEuro(alreadySpent)}.` : ''}`}
          </Text>

          {hasPending && (
            <>
              <View style={styles.field}>
                <Scontrini
                  orgId={membership.data?.org_id}
                  listId={id}
                  runId={null}
                  title="Scontrini di questa spesa"
                />
              </View>

              <View style={styles.field}>
                <Text style={type.label}>Negozio</Text>
                <TextInput
                  value={shop}
                  onChangeText={setShop}
                  placeholder="Es. Supermercato, Ingrosso"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="sentences"
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={type.label}>Quando</Text>
                <View style={styles.chips}>
                  <Chip
                    label="Oggi"
                    variant="accent"
                    active={day === 'oggi'}
                    onPress={() => setDay('oggi')}
                  />
                  <Chip
                    label="Ieri"
                    variant="accent"
                    active={day === 'ieri'}
                    onPress={() => setDay('ieri')}
                  />
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

              {pending.length > 0 && (
                <View style={styles.field}>
                  <Text style={type.label}>
                    {hasReceipts ? 'Prezzi per articolo, facoltativi' : 'Prezzi'} · {pending.length}{' '}
                    {pending.length === 1 ? 'comprato' : 'comprati'}
                  </Text>
                  <View style={styles.card}>
                    {pending.map((l, i) => {
                      const text = prices[l.id] ?? '';
                      const bad = text.trim() !== '' && parsed[i] == null;
                      return (
                        <View key={l.id} style={[styles.line, i < pending.length - 1 && styles.divider]}>
                          <View style={styles.flex}>
                            <Text style={type.body} numberOfLines={1}>
                              {l.name}
                            </Text>
                            <Text style={type.caption}>
                              {qtyWithUnit(l.qty, l.unit)}
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
                    {hasReceipts
                      ? 'Con gli scontrini il totale è già a posto: i prezzi servono solo se vuoi il dettaglio.'
                      : 'Puoi lasciare dei prezzi vuoti e completarli dopo, oppure fotografare gli scontrini qui sopra.'}
                  </Text>
                </View>
              )}
            </>
          )}

          {!hasPending && mode === 'registra' && (
            <Text style={[type.body, styles.empty]}>
              Non c’è niente da registrare: spunta nella lista quello che hai comprato.
            </Text>
          )}

          {mode === 'chiudi' && notTaken.length > 0 && (
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
            <View style={styles.flex}>
              <Text style={type.body}>
                {hasPending
                  ? hasReceipts
                    ? `Questa spesa · ${pendingReceipts.length} ${pendingReceipts.length === 1 ? 'scontrino' : 'scontrini'}`
                    : 'Questa spesa'
                  : 'Totale della lista'}
              </Text>
              {hasPending && (receiptsMissing > 0 || (!hasReceipts && missing > 0)) ? (
                <Text style={[type.caption, { color: colors.warn }]}>
                  {hasReceipts
                    ? `${receiptsMissing} ${receiptsMissing === 1 ? 'importo' : 'importi'} da inserire`
                    : `${missing} ${missing === 1 ? 'prezzo' : 'prezzi'} da inserire`}
                </Text>
              ) : mode === 'chiudi' && hasPending && runList.length > 0 ? (
                <Text style={type.caption}>Totale lista: {formatEuro(alreadySpent + thisRun)}</Text>
              ) : null}
            </View>
            <Text style={styles.total}>{formatEuro(hasPending ? thisRun : alreadySpent)}</Text>
          </View>
          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.saveButton,
              !canSubmit && styles.saveDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.saveText}>
                {mode === 'registra' ? 'Salva questa spesa' : 'Chiudi la lista'}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
