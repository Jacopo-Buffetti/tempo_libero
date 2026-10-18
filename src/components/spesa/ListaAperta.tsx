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
import { escapeLike, formatQty, locationLabel, roundQty, stepFor } from '@/lib/items';
import {
  dishNames,
  errorMessage,
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
import { useMembership } from '@/providers/AuthProvider';
import { colors, space, type } from '@/theme/tokens';
import { openListText, shareAnywhere, shareOnWhatsApp } from '@/lib/condividiLista';
import { styles } from '@/styles/components/listaAperta';

export function ListaAperta({ list }: { list: ListSummary }) {
  const membership = useMembership();
  const orgId = membership.data?.org_id;
  const listId = list.id!;
  const location = list.location!;
  const where = locationLabel(location);

  const items = useListItems(listId);
  const toggle = useToggleListItem(listId);
  const setQty = useSetListItemQty(listId);
  const remove = useRemoveListItem(listId);
  const add = useAddListItems(listId, orgId);
  const low = useLowStock(orgId, location);

  const [text, setText] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const term = text.trim();

  const sorted = useMemo(
    () => [...(items.data ?? [])].sort((a, b) => Number(a.checked) - Number(b.checked)),
    [items.data],
  );
  const done = sorted.filter((i) => i.checked).length;
  const linkedIds = useMemo(
    () => new Set(sorted.map((i) => i.item_id).filter(Boolean)),
    [sorted],
  );
  const lowMissing = (low.data ?? []).filter((i) => !linkedIds.has(i.id));

  const suggestions = useQuery({
    queryKey: ['spesa', 'suggest', orgId, location, term],
    enabled: !!orgId && term.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('items')
        .select('id, name, unit')
        .eq('org_id', orgId!)
        .eq('location', location)
        .ilike('name', `%${escapeLike(term)}%`)
        .order('name')
        .limit(4);
      if (error) throw error;
      return data;
    },
  });
  const matches = (suggestions.data ?? []).filter((s) => !linkedIds.has(s.id));
  const exactExists = (suggestions.data ?? []).some(
    (s) => s.name.toLowerCase() === term.toLowerCase(),
  );

  function addEntries(entries: NewListEntry[]) {
    setAddError(null);
    add.mutate(entries, {
      onSuccess: () => setText(''),
      onError: (e) => setAddError(errorMessage(e, 'Non sono riuscito ad aggiungerlo. Riprova.')),
    });
  }

  function openNew(params: { mode: 'inventory' | 'new-product' | 'list-only'; name: string; itemId?: string }) {
    setText('');
    setAddError(null);
    router.push({
      pathname: '/spesa/voce',
      params: { listId, location, ...params },
    });
  }

  const shareText = () =>
    openListText({ name: list.name!, location, created_at: list.created_at }, sorted);

  function share() {
    shareOnWhatsApp(shareText()).catch(() => Alert.alert('Condivisione non riuscita', 'Riprova tra poco.'));
  }

  function shareElsewhere() {
    shareAnywhere(shareText()).catch(() => undefined);
  }

  function onToggle(i: ListItem) {
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
          <View style={styles.titleRow}>
            <Text style={[type.title, styles.flex]} numberOfLines={2}>{list.name}</Text>
            <Text style={styles.tag}>{where}</Text>
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
                  : `${lowMissing.length} prodotti di ${where} sotto scorta`}
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
                  : openNew({ mode: exactExists ? 'list-only' : 'new-product', name: term }))
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
                  hint={`in ${where}`}
                  onPress={() => openNew({ mode: 'inventory', itemId: s.id, name: s.name })}
                />
              ))}
              {!exactExists && (
                <Option
                  icon="add-circle-outline"
                  iconColor={colors.accent}
                  title={`Nuovo prodotto: “${term}”`}
                  hint={`anche in ${where}`}
                  onPress={() => openNew({ mode: 'new-product', name: term })}
                />
              )}
              <Option
                icon="create-outline"
                iconColor={colors.muted}
                title={`Solo in lista: “${term}”`}
                hint="non va in inventario"
                onPress={() => openNew({ mode: 'list-only', name: term })}
              />
            </View>
          )}
          {addError && <Text style={styles.error}>{addError}</Text>}
        </View>

        <FlatList
          data={sorted}
          keyExtractor={(i) => i.id}
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
          renderItem={({ item: i, index }) => (
            <Row
              item={i}
              where={where}
              isFirst={index === 0}
              isLast={index === sorted.length - 1}
              onToggle={() => onToggle(i)}
              onOpen={() =>
                router.push({ pathname: '/spesa/voce', params: { listId, location, id: i.id } })
              }
              onMinus={() => onMinus(i)}
              onPlus={() => {
                Haptics.selectionAsync();
                setQty.mutate({ id: i.id, qty: roundQty(i.qty + stepFor(i.unit)) });
              }}
            />
          )}
        />

        <View style={styles.footer}>
          <Pressable
            onPress={() => router.push({ pathname: '/spesa/chiudi/[id]', params: { id: listId } })}
            disabled={done === 0}
            style={({ pressed }) => [
              styles.closeButton,
              done === 0 && styles.closeDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.closeText, done === 0 && { color: colors.muted }]}>
              {done === 0 ? 'Spunta quello che hai preso' : 'Chiudi la lista · inserisci i prezzi'}
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
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.bg }]}
    >
      <Ionicons name={icon} size={18} color={iconColor} />
      <Text style={[type.body, styles.flex]} numberOfLines={1}>{title}</Text>
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
  const linked = !!item.item_id;
  const step = stepFor(item.unit);

  const dest = item.items ? locationLabel(item.items.location) : where;
  const destination = item.checked
    ? linked
      ? `Aggiunto all’inventario di ${dest}`
      : 'Preso'
    : linked
      ? `Va in inventario · ${dest}`
      : 'Solo in lista';

  return (
    <View
      style={[styles.row, isFirst && styles.first, isLast && styles.last, !isLast && styles.divider]}
    >
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
        <Text style={[type.caption, item.checked && linked && { color: colors.ok }]}>
          {destination}
        </Text>
      </Pressable>

      {item.checked ? (
        <View style={styles.qty}>
          <Text style={styles.qtyNumber}>{formatQty(item.qty)}</Text>
          <Text style={styles.qtyUnit}>{item.unit}</Text>
        </View>
      ) : (
        <>
          <Pressable
            onPress={onMinus}
            accessibilityLabel={item.qty - step > 0 ? `Togli ${formatQty(step)} ${item.unit}` : 'Togli dalla lista'}
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
            <Text style={styles.qtyUnit}>{item.unit}</Text>
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
