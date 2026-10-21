import { useEffect, useMemo, useState } from 'react';
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
import {
  centsToInput,
  errorMessage,
  formatEuro,
  localIsoDate,
  parseEuro,
  payerChoiceOf,
  useCreatePayment,
  useDeletePayment,
  useList,
  useListItems,
  usePayerOptions,
  useRuns,
  useUpdatePayment,
  type PayerChoice,
  type PayerOption,
} from '@/lib/spesa';
import { qtyWithUnit } from '@/lib/items';
import { receiptsTotal, useReceipts } from '@/lib/scontrini';
import { useAuth, useMembership } from '@/providers/AuthProvider';
import { Chip } from '@/components/Chip';
import { SelectField } from '@/components/SelectField';
import { DateTimeField } from '@/components/DateTimeField';
import { Scontrini } from '@/components/spesa/Scontrini';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/screens/spesa/pagamento';

const sameChoice = (a: PayerChoice | null, kind: PayerChoice['kind'], ref?: string) =>
  !!a && a.kind === kind && (ref === undefined || a.ref === ref);

export default function Pagamento() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const { listId, id } = useLocalSearchParams<{ listId: string; id?: string }>();
  const editing = !!id;
  const { session } = useAuth();
  const membership = useMembership();
  const orgId = membership.data?.org_id;

  const list = useList(listId);
  const items = useListItems(listId);
  const runs = useRuns(listId);
  const options = usePayerOptions(orgId);
  const receipts = useReceipts(listId, editing ? id : null);
  const create = useCreatePayment(listId);
  const update = useUpdatePayment();
  const remove = useDeletePayment();

  const run = runs.data?.find((r) => r.id === id);
  const listOpen = list.data?.status === 'aperta';
  const canMoveItems = !editing || listOpen;

  const [payer, setPayer] = useState<PayerChoice | null>(null);
  const [newName, setNewName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amountText, setAmountText] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [shop, setShop] = useState('');
  const [paidOn, setPaidOn] = useState(localIsoDate());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(
    () =>
      (items.data ?? []).filter((i) =>
        canMoveItems ? i.checked && (!i.run_id || (editing && i.run_id === id)) : i.run_id === id,
      ),
    [items.data, canMoveItems, editing, id],
  );

  useEffect(() => {
    if (ready || !items.data) return;
    if (editing) {
      if (!run) return;
      const choice = payerChoiceOf(run);
      setPayer(choice);
      if (choice.kind === 'nuova') setNewName(choice.name ?? '');
      setSelected(new Set(items.data.filter((i) => i.run_id === id).map((i) => i.id)));
      if (run.amount_cents != null) {
        setAmountText(centsToInput(run.amount_cents));
        setAmountTouched(true);
      }
      setShop(run.shop ?? '');
      setPaidOn(run.run_date);
    } else {
      setSelected(new Set(items.data.filter((i) => i.checked && !i.run_id).map((i) => i.id)));
    }
    setReady(true);
  }, [ready, items.data, editing, run, id]);

  const all = options.data ?? [];
  const consiglieri = all.filter((o) => o.kind === 'consigliere');
  const others = all.filter((o) => o.kind !== 'consigliere');
  const hiddenChoice =
    payer && payer.kind !== 'cassa' && payer.kind !== 'nuova' && !all.some((o) => sameChoice(payer, o.kind, o.id));

  const pendingReceipts = receipts.data ?? [];
  const chosen = candidates.filter((i) => selected.has(i.id));
  const receiptsKnown = pendingReceipts.length > 0 && pendingReceipts.every((r) => r.total_cents != null);
  const pricesKnown = chosen.length > 0 && chosen.every((i) => i.price_cents != null);
  const suggestion = receiptsKnown
    ? receiptsTotal(pendingReceipts)
    : pricesKnown
      ? chosen.reduce((sum, i) => sum + (i.price_cents ?? 0), 0)
      : null;
  const amountValue = amountTouched ? amountText : suggestion != null ? centsToInput(suggestion) : '';
  const amountCents = amountValue.trim() === '' ? null : parseEuro(amountValue);
  const amountBad = amountValue.trim() !== '' && amountCents == null;

  const payerValid = !!payer && (payer.kind !== 'nuova' || newName.trim().length > 0);
  const busy = create.isPending || update.isPending || remove.isPending;
  const canSave = ready && payerValid && !amountBad && (!canMoveItems || selected.size > 0) && !busy;

  function choose(choice: PayerChoice) {
    setError(null);
    setPayer(choice);
  }

  function toggleItem(itemId: string) {
    if (!canMoveItems) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleAll() {
    if (!canMoveItems) return;
    setSelected(selected.size === candidates.length ? new Set() : new Set(candidates.map((i) => i.id)));
  }

  function optionLabel(o: PayerOption) {
    return o.user_id && o.user_id === session?.user.id ? `${o.name} (tu)` : o.name;
  }

  function save() {
    if (!payer) return;
    setError(null);
    const choice: PayerChoice = payer.kind === 'nuova' ? { kind: 'nuova', name: newName } : payer;
    const done = {
      onSuccess: () => router.back(),
      onError: (e: unknown) => setError(errorMessage(e, 'Pagamento non salvato. Riprova.')),
    };
    const base = { payer: choice, amountCents, shop, paidOn };
    if (editing) {
      update.mutate({ ...base, id: id!, itemIds: canMoveItems ? [...selected] : null }, done);
    } else {
      create.mutate({ ...base, itemIds: [...selected] }, done);
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Eliminare il pagamento?',
      'Gli articoli tornano tra quelli da attribuire e gli scontrini restano nella lista.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () =>
            remove.mutate(id!, {
              onSuccess: () => router.back(),
              onError: (e) => setError(errorMessage(e, 'Pagamento non eliminato. Riprova.')),
            }),
        },
      ],
    );
  }

  if (items.isLoading || list.isLoading || (editing && runs.isLoading)) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (editing && !run) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <Text style={[type.body, styles.empty]}>Questo pagamento non esiste più.</Text>
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
        <Text style={type.heading}>{editing ? 'Pagamento' : 'Nuovo pagamento'}</Text>
        <View style={styles.back} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={type.label}>Chi ha pagato</Text>
            <View style={styles.chips}>
              <Chip
                label="Cassa Pro Loco"
                variant="accent"
                active={sameChoice(payer, 'cassa')}
                onPress={() => choose({ kind: 'cassa' })}
              />
            </View>
            {consiglieri.length > 0 && (
              <View style={styles.group}>
                <Text style={styles.groupLabel}>Consiglieri</Text>
                <SelectField
                  title="Quale consigliere?"
                  placeholder="Scegli un consigliere"
                  options={consiglieri.map((o) => ({ key: o.id, label: optionLabel(o) }))}
                  selectedKey={payer?.kind === 'consigliere' ? (payer.ref ?? null) : null}
                  onSelect={(key) => choose({ kind: 'consigliere', ref: key })}
                />
              </View>
            )}
            <View style={styles.group}>
              <Text style={styles.groupLabel}>Altre persone</Text>
              <View style={styles.chips}>
                {others.map((o) => (
                  <Chip
                    key={`${o.kind}-${o.id}`}
                    label={optionLabel(o)}
                    variant="accent"
                    active={sameChoice(payer, o.kind, o.id)}
                    onPress={() => choose({ kind: o.kind, ref: o.id })}
                  />
                ))}
                {hiddenChoice && run?.paid_by_name ? (
                  <Chip label={run.paid_by_name} variant="accent" active />
                ) : null}
                <Chip
                  label="+ Nuova persona"
                  variant="accent"
                  active={sameChoice(payer, 'nuova')}
                  onPress={() => choose({ kind: 'nuova' })}
                />
              </View>
            </View>
            {payer?.kind === 'nuova' && (
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="Nome di chi ha pagato"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="words"
                autoFocus={!editing}
                accessibilityLabel="Nome di chi ha pagato"
                style={styles.input}
              />
            )}
            {payer && payer.kind !== 'cassa' && (
              <Text style={type.caption}>Resta da rimborsare finché non lo segni come rimborsato.</Text>
            )}
          </View>

          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={type.label}>
                Articoli · {selected.size} {selected.size === 1 ? 'scelto' : 'scelti'}
              </Text>
              {canMoveItems && candidates.length > 1 && (
                <Pressable onPress={toggleAll} hitSlop={8}>
                  <Text style={styles.selectAll}>
                    {selected.size === candidates.length ? 'Nessuno' : 'Tutti'}
                  </Text>
                </Pressable>
              )}
            </View>
            {candidates.length === 0 ? (
              <Text style={[type.caption, styles.empty]}>
                Non ci sono articoli comprati da attribuire: spunta nella lista quello che è stato comprato.
              </Text>
            ) : (
              <View style={styles.card}>
                {candidates.map((i, index) => {
                  const on = selected.has(i.id);
                  return (
                    <Pressable
                      key={i.id}
                      onPress={() => toggleItem(i.id)}
                      disabled={!canMoveItems}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on, disabled: !canMoveItems }}
                      style={[styles.itemRow, index < candidates.length - 1 && styles.divider]}
                    >
                      <View style={[styles.check, on && styles.checkOn]}>
                        {on && <Ionicons name="checkmark" size={16} color={colors.onAccent} />}
                      </View>
                      <View style={styles.flex}>
                        <Text style={type.body} numberOfLines={1}>
                          {i.name}
                        </Text>
                        <Text style={type.caption}>{qtyWithUnit(i.qty, i.unit)}</Text>
                      </View>
                      {i.price_cents != null && <Text style={styles.itemPrice}>{formatEuro(i.price_cents)}</Text>}
                    </Pressable>
                  );
                })}
              </View>
            )}
            {!canMoveItems && (
              <Text style={type.caption}>La lista è chiusa: gli articoli di questo pagamento non si cambiano più.</Text>
            )}
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Importo</Text>
            <View style={[styles.amountBox, amountBad && styles.amountBad]}>
              <Text style={styles.euro}>€</Text>
              <TextInput
                value={amountValue}
                onChangeText={(t) => {
                  setAmountTouched(true);
                  setAmountText(t);
                }}
                placeholder="0,00"
                placeholderTextColor={colors.placeholder}
                keyboardType="decimal-pad"
                accessibilityLabel="Importo pagato"
                style={styles.amountInput}
              />
            </View>
            {!amountTouched && suggestion != null ? (
              <Text style={styles.suggestion}>
                {receiptsKnown ? 'Preso dagli scontrini' : 'Somma dei prezzi degli articoli'}: puoi correggerlo
              </Text>
            ) : (
              <Text style={type.caption}>
                Se non lo sai ancora lascialo vuoto: il pagamento resta “importo da inserire”.
              </Text>
            )}
          </View>

          <View style={styles.field}>
            <Scontrini
              orgId={orgId}
              listId={listId}
              runId={editing ? id : null}
              title="Scontrini, facoltativi"
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
            <DateTimeField date={paidOn} time={null} withTime={false} label="Quando" onChangeDate={setPaidOn} />
          </View>

          {editing && listOpen && (
            <Pressable onPress={confirmDelete} disabled={busy} style={styles.remove}>
              <Ionicons name="trash-outline" size={18} color={colors.warn} />
              <Text style={styles.removeText}>Elimina pagamento</Text>
            </Pressable>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          {!payerValid && (
            <Text style={type.caption}>
              {payer?.kind === 'nuova' ? 'Scrivi il nome di chi ha pagato.' : 'Scegli chi ha pagato.'}
            </Text>
          )}
          <Pressable
            onPress={save}
            disabled={!canSave}
            style={({ pressed }) => [
              styles.saveButton,
              !canSave && styles.saveDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.saveText}>
                {editing ? 'Salva le modifiche' : 'Salva pagamento'}
                {amountCents != null ? ` · ${formatEuro(amountCents)}` : ''}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
