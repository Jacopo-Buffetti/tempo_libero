import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  LOCATIONS,
  escapeLike,
  formatQty,
  locationLabel,
  roundQty,
  stepFor,
  unitWord,
  type Location,
} from '@/lib/items';
import {
  dishNames,
  errorMessage,
  formatEuro,
  listLocations,
  locationsLabel,
  usePayerLabel,
  useRuns,
  useAddListItems,
  useListItems,
  useLowStock,
  useRemoveListItem,
  useSetListItemQty,
  useToggleListItem,
  type ListItem,
  type ListSummary,
  type NewListEntry,
} from '@/lib/spesa';
import { useAuth, useMembership } from '@/providers/AuthProvider';
import { RunCard } from '@/components/spesa/RunCard';
import { space, useTheme } from '@/theme/tokens';
import { openListText, shareAnywhere, shareOnWhatsApp } from '@/lib/condividiLista';
import { useStyles } from '@/styles/components/listaAperta';
import { useRole } from '@/lib/ruoli';

export function ListaAperta({ list }: { list: ListSummary }) {
  const styles = useStyles();
  const { isConsigliere } = useRole();
  const { colors, type } = useTheme();
  const membership = useMembership();
  const orgId = membership.data?.org_id;
  const listId = list.id!;
  const locations = listLocations(list);
  const location = locations[0] ?? 'cucina';
  const where = locationsLabel(locations);

  const items = useListItems(listId);
  const toggle = useToggleListItem(listId);
  const setQty = useSetListItemQty(listId);
  const remove = useRemoveListItem(listId);
  const add = useAddListItems(listId, orgId);
  const low = useLowStock(orgId, locations);
  const [grouped, setGrouped] = useState(true);

  const [text, setText] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const term = text.trim();

  const { session } = useAuth();
  const runs = useRuns(listId);
  const payerLabel = usePayerLabel(orgId, session?.user.id);

  const stage = (i: ListItem) => (!i.checked ? 0 : i.run_id ? 2 : 1);
  const sorted = useMemo(() => [...(items.data ?? [])].sort((a, b) => stage(a) - stage(b)), [items.data]);
  const open = sorted.filter((i) => stage(i) < 2);
  const done = sorted.filter((i) => i.checked).length;

  const groups = useMemo(() => {
    const order: (Location | 'libero')[] = [
      ...locations,
      ...LOCATIONS.map((l) => l.value).filter((l) => !locations.includes(l)),
      'libero',
    ];
    return order
      .map((key) => ({
        key,
        label: key === 'libero' ? 'Solo in lista' : locationLabel(key),
        items: open.filter((i) => (i.items?.location ?? 'libero') === key),
      }))
      .filter((g) => g.items.length > 0);
  }, [open, locations]);

  type Entry =
    | { kind: 'header'; key: string; label: string; count: number }
    | { kind: 'item'; item: ListItem; isFirst: boolean; isLast: boolean };

  const entries: Entry[] = useMemo(() => {
    const asItems = (list: ListItem[]): Entry[] =>
      list.map((item, i) => ({ kind: 'item', item, isFirst: i === 0, isLast: i === list.length - 1 }));
    if (!grouped || groups.length <= 1) return asItems(open);
    return groups.flatMap((g) => [
      { kind: 'header', key: g.key, label: g.label, count: g.items.length } as Entry,
      ...asItems(g.items),
    ]);
  }, [grouped, groups, open]);
  const unregistered = sorted.filter((i) => stage(i) === 1).length;
  const runList = runs.data ?? [];
  const spent = runList.reduce((sum, r) => sum + r.total_cents, 0);
  const linkedIds = useMemo(() => new Set(sorted.map((i) => i.item_id).filter(Boolean)), [sorted]);
  const lowMissing = (low.data ?? []).filter((i) => !linkedIds.has(i.id));

  const suggestions = useQuery({
    queryKey: ['spesa', 'suggest', orgId, term],
    enabled: !!orgId && term.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('items')
        .select('id, name, unit, location')
        .eq('org_id', orgId!)
        .ilike('name', `%${escapeLike(term)}%`)
        .order('name')
        .limit(8);
      if (error) throw error;
      return data;
    },
  });
  const matches = (suggestions.data ?? [])
    .filter((s) => !linkedIds.has(s.id))
    .sort((a, b) => Number(!locations.includes(a.location)) - Number(!locations.includes(b.location)))
    .slice(0, 5);
  const exactExists = (suggestions.data ?? []).some((s) => s.name.toLowerCase() === term.toLowerCase());

  function addEntries(entries: NewListEntry[]) {
    setAddError(null);
    add.mutate(entries, {
      onSuccess: () => setText(''),
      onError: (e) => setAddError(errorMessage(e, 'Non sono riuscito ad aggiungerlo. Riprova.')),
    });
  }

  function openNew(params: { mode: 'inventory' | 'list-only'; name: string; itemId?: string }) {
    const canCreate = params.mode === 'list-only' && isConsigliere && !exactExists;
    setText('');
    setAddError(null);
    router.push({
      pathname: '/spesa/voce',
      params: {
        listId,
        location,
        locations: locations.join(','),
        ...params,
        ...(canCreate ? { canCreate: '1' } : {}),
      },
    });
  }

  const shareText = () => openListText({ name: list.name!, locations, created_at: list.created_at }, sorted);

  function share() {
    shareOnWhatsApp(shareText()).catch(() => Alert.alert('Condivisione non riuscita', 'Riprova tra poco.'));
  }

  function shareElsewhere() {
    shareAnywhere(shareText()).catch(() => undefined);
  }

  function onToggle(i: ListItem) {
    if (i.run_id) {
      Alert.alert(
        'È in un pagamento',
        'Per togliere la spunta apri il pagamento qui sotto e togli l’articolo da lì.',
      );
      return;
    }
    Haptics.selectionAsync();
    toggle.mutate(
      { id: i.id, checked: !i.checked },
      {
        onError: (e) =>
          Alert.alert('Non è stato possibile', errorMessage(e, 'Controlla la connessione e riprova.')),
      },
    );
  }

  function onMinus(i: ListItem) {
    const step = stepFor(i.unit);
    if (i.qty - step > 0) {
      Haptics.selectionAsync();
      setQty.mutate({ id: i.id, qty: roundQty(i.qty - step) });
      return;
    }
    Alert.alert('Togliere dalla lista?', `“${i.name}” non sarà più in questa lista.`, [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Togli', style: 'destructive', onPress: () => remove.mutate({ id: i.id }) },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={colors.accent} />
            <Text style={styles.backText}>Liste</Text>
          </Pressable>
          <View style={styles.actions}>
            <Pressable
              onPress={share}
              onLongPress={shareElsewhere}
              disabled={sorted.length === 0}
              hitSlop={6}
              accessibilityLabel="Condividi la lista su WhatsApp"
              accessibilityHint="Tieni premuto per scegliere un'altra app"
              style={({ pressed }) => [
                styles.whatsapp,
                sorted.length === 0 && styles.disabled,
                pressed && styles.whatsappPressed,
              ]}
            >
              <Ionicons name="logo-whatsapp" size={20} color={colors.onAccent} />
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: '/spesa/modifica/[id]', params: { id: listId } })}
              style={styles.back}
              hitSlop={8}
              accessibilityLabel="Modifica o elimina la lista"
            >
              <Ionicons name="create-outline" size={20} color={colors.accent} />
              <Text style={styles.backText}>Modifica</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.header}>
          <Text style={type.title} numberOfLines={2}>
            {list.name}
          </Text>
          <View style={styles.tags}>
            {locations.map((l) => (
              <Text key={l} style={styles.tag}>
                {locationLabel(l)}
              </Text>
            ))}
          </View>

          {sorted.length > 0 && (
            <View style={styles.progressRow}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${(done / sorted.length) * 100}%` }]} />
              </View>
              <Text style={type.label}>
                {done} di {sorted.length} presi
              </Text>
            </View>
          )}

          {lowMissing.length > 0 && (
            <View style={styles.lowBanner}>
              <Ionicons name="alert-circle-outline" size={20} color={colors.warn} />
              <Text style={[styles.lowText, styles.flex]}>
                {lowMissing.length === 1
                  ? `${lowMissing[0].name} è sotto scorta`
                  : `${lowMissing.length} prodotti sotto scorta in ${where}`}
              </Text>
              <Pressable
                onPress={() =>
                  addEntries(
                    lowMissing.map((i) => ({
                      itemId: i.id,
                      name: i.name,
                      unit: i.unit,
                      qty: roundQty((i.min_qty ?? 0) - i.qty),
                    })),
                  )
                }
                style={styles.lowButton}
              >
                <Text style={styles.lowButtonText}>Aggiungi</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.addBox}>
            <Ionicons name="add-circle-outline" size={20} color={colors.muted} />
            <TextInput
              value={text}
              onChangeText={(t) => {
                setText(t);
                setAddError(null);
              }}
              placeholder="Aggiungi alla lista…"
              placeholderTextColor={colors.muted}
              returnKeyType="next"
              onSubmitEditing={() =>
                term &&
                (matches[0]
                  ? openNew({ mode: 'inventory', itemId: matches[0].id, name: matches[0].name })
                  : openNew({ mode: 'list-only', name: term }))
              }
              style={styles.addInput}
            />
          </View>

          {term.length >= 2 && (
            <View style={styles.suggestBox}>
              {matches.map((s) => (
                <Option
                  key={s.id}
                  icon="cube-outline"
                  iconColor={colors.accent}
                  title={s.name}
                  hint={
                    locations.includes(s.location)
                      ? locationLabel(s.location)
                      : `${locationLabel(s.location)} · si aggiunge`
                  }
                  onPress={() => openNew({ mode: 'inventory', itemId: s.id, name: s.name })}
                />
              ))}
              <Option
                icon="add-circle-outline"
                iconColor={colors.accent}
                title={`Aggiungi “${term}”`}
                hint="nuova voce"
                onPress={() => openNew({ mode: 'list-only', name: term })}
              />
            </View>
          )}
          {addError && <Text style={styles.error}>{addError}</Text>}
        </View>

        {open.length > 0 && groups.length > 1 && (
          <View style={styles.viewSwitch}>
            <Pressable
              onPress={() => setGrouped(true)}
              style={[styles.viewOption, grouped && styles.viewOptionActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: grouped }}
            >
              <Text style={[styles.viewText, grouped && styles.viewTextActive]}>Per luogo</Text>
            </Pressable>
            <Pressable
              onPress={() => setGrouped(false)}
              style={[styles.viewOption, !grouped && styles.viewOptionActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: !grouped }}
            >
              <Text style={[styles.viewText, !grouped && styles.viewTextActive]}>Tutto insieme</Text>
            </Pressable>
          </View>
        )}

        <FlatList
          data={entries}
          keyExtractor={(e) => (e.kind === 'header' ? `h-${e.key}` : e.item.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={items.isRefetching}
              onRefresh={items.refetch}
              tintColor={colors.accent}
            />
          }
          ListEmptyComponent={
            items.isLoading ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: space(8) }} />
            ) : items.isError ? (
              <Text style={[type.caption, styles.empty, { color: colors.warn }]}>
                Non riesco a caricare le voci. Trascina in basso per riprovare.
              </Text>
            ) : (
              <Text style={[type.caption, styles.empty]}>
                Lista vuota. Scrivi qui sopra cosa serve per {where}.
              </Text>
            )
          }
          ListFooterComponent={
            runList.length > 0 ? (
              <View style={styles.runs}>
                <View style={styles.runsHead}>
                  <Text style={type.label}>Pagamenti · {runList.length}</Text>
                  <Text style={styles.runsTotal}>{formatEuro(spent)}</Text>
                </View>
                {runList.map((r, index) => (
                  <RunCard
                    key={r.id}
                    run={r}
                    index={index}
                    listId={listId}
                    orgId={orgId}
                    items={sorted.filter((i) => i.run_id === r.id)}
                    payerName={payerLabel(r)}
                  />
                ))}
              </View>
            ) : null
          }
          renderItem={({ item: entry }) =>
            entry.kind === 'header' ? (
              <View style={styles.groupHead}>
                <Text style={styles.groupTitle}>{entry.label}</Text>
                <Text style={type.caption}>{entry.count}</Text>
              </View>
            ) : (
              <Row
                item={entry.item}
                where={locationLabel(location)}
                isFirst={entry.isFirst}
                isLast={entry.isLast}
                onToggle={() => onToggle(entry.item)}
                onOpen={() =>
                  router.push({
                    pathname: '/spesa/voce',
                    params: { listId, location, locations: locations.join(','), id: entry.item.id },
                  })
                }
                onMinus={() => onMinus(entry.item)}
                onPlus={() => {
                  Haptics.selectionAsync();
                  setQty.mutate({
                    id: entry.item.id,
                    qty: roundQty(entry.item.qty + stepFor(entry.item.unit)),
                  });
                }}
              />
            )
          }
        />

        <View style={styles.footer}>
          {unregistered > 0 ? (
            <Pressable
              onPress={() => router.push({ pathname: '/spesa/pagamento', params: { listId } })}
              style={({ pressed }) => [styles.registerButton, pressed && styles.registerPressed]}
            >
              <Ionicons name="wallet-outline" size={18} color={colors.onAccent} />
              <Text style={styles.registerText}>Aggiungi pagamento · {unregistered} da attribuire</Text>
            </Pressable>
          ) : (
            <Text style={[type.caption, styles.footerHint]}>
              {done === 0
                ? 'Spunta quello che compri, poi indica chi l’ha pagato.'
                : 'Tutto attribuito. Puoi continuare ad aggiungere voci.'}
            </Text>
          )}
          <Pressable
            onPress={() => router.push({ pathname: '/spesa/chiudi/[id]', params: { id: listId } })}
            disabled={runList.length === 0}
            style={({ pressed }) => [
              styles.closeButton,
              runList.length === 0 && styles.closeDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.closeText, runList.length === 0 && { color: colors.muted }]}>
              Chiudi la lista
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Option({
  icon,
  iconColor,
  title,
  hint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  hint: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { colors, type } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.bg }]}
    >
      <Ionicons name={icon} size={18} color={iconColor} />
      <Text style={[type.body, styles.flex]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={type.caption}>{hint}</Text>
    </Pressable>
  );
}

function Row({
  item,
  where,
  isFirst,
  isLast,
  onToggle,
  onOpen,
  onMinus,
  onPlus,
}: {
  item: ListItem;
  where: string;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const linked = !!item.item_id;
  const step = stepFor(item.unit);

  const dest = item.items ? locationLabel(item.items.location) : where;
  const destination = item.checked
    ? linked
      ? `In inventario · ${dest} · da attribuire`
      : 'Preso · da attribuire'
    : linked
      ? `Va in inventario · ${dest}`
      : 'Solo in lista';

  return (
    <View style={[styles.row, isFirst && styles.first, isLast && styles.last, !isLast && styles.divider]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked }}
        accessibilityLabel={item.name}
        style={styles.checkHit}
      >
        <View style={[styles.check, item.checked && styles.checkOn]}>
          {item.checked && <Ionicons name="checkmark" size={16} color={colors.onAccent} />}
        </View>
      </Pressable>

      <Pressable
        onPress={item.checked ? onToggle : onOpen}
        accessibilityHint={item.checked ? undefined : 'Apre la scheda della voce'}
        style={styles.rowText}
      >
        <Text style={[type.body, item.checked && styles.doneText]} numberOfLines={1}>
          {item.name}
        </Text>
        {!!dishNames(item) && (
          <Text style={styles.forDish} numberOfLines={2}>
            Per: {dishNames(item)}
          </Text>
        )}
        {!!item.note && (
          <Text style={styles.note} numberOfLines={2}>
            {item.note}
          </Text>
        )}
        <Text style={[type.caption, item.checked && linked && { color: colors.ok }]}>{destination}</Text>
      </Pressable>

      {item.checked ? (
        <View style={styles.qty}>
          <Text style={styles.qtyNumber}>{formatQty(item.qty)}</Text>
          <Text style={styles.qtyUnit}>{unitWord(item.qty, item.unit)}</Text>
        </View>
      ) : (
        <>
          <Pressable
            onPress={onMinus}
            accessibilityLabel={
              item.qty - step > 0 ? `Togli ${formatQty(step)} ${item.unit}` : 'Togli dalla lista'
            }
            style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
          >
            <Ionicons
              name={item.qty - step > 0 ? 'remove' : 'trash-outline'}
              size={18}
              color={item.qty - step > 0 ? colors.text : colors.warn}
            />
          </Pressable>
          <Pressable onPress={onOpen} style={styles.qty} accessibilityLabel="Cambia quantità e unità">
            <Text style={styles.qtyNumber}>{formatQty(item.qty)}</Text>
            <Text style={styles.qtyUnit}>{unitWord(item.qty, item.unit)}</Text>
          </Pressable>
          <Pressable
            onPress={onPlus}
            accessibilityLabel={`Aggiungi ${formatQty(step)} ${item.unit}`}
            style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
          >
            <Ionicons name="add" size={18} color={colors.text} />
          </Pressable>
        </>
      )}
    </View>
  );
}
