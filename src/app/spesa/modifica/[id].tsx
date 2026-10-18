import { useEffect, useState } from 'react';
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
import { LOCATIONS, type Location } from '@/lib/items';
import {
  errorMessage,
  useDeleteList,
  useList,
  useListItems,
  useUpdateList,
  type PaymentSource,
} from '@/lib/spesa';
import { colors, type } from '@/theme/tokens';
import { styles } from '@/styles/screens/spesa/modifica';

const LOCATION_ICONS: Record<Location, keyof typeof Ionicons.glyphMap> = {
  magazzino: 'cube-outline',
  cucina: 'flame-outline',
  bar: 'wine-outline',
};

const isoToIt = (iso?: string | null) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

function itToIso(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (date.getDate() !== Number(d) || date.getMonth() !== Number(mo) - 1) return null;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export default function ModificaLista() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const list = useList(id);
  const items = useListItems(id);
  const update = useUpdateList(id);
  const remove = useDeleteList(id);

  const [name, setName] = useState('');
  const [location, setLocation] = useState<Location>('cucina');
  const [shop, setShop] = useState('');
  const [date, setDate] = useState('');
  const [paidBy, setPaidBy] = useState<PaymentSource>('cassa');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready || !list.data) return;
    const l = list.data;
    setName(l.name ?? '');
    setLocation(l.location!);
    setShop(l.shop ?? '');
    setDate(isoToIt(l.closed_on));
    setPaidBy(l.paid_by ?? 'cassa');
    setReady(true);
  }, [ready, list.data]);

  if (!ready || !list.data) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const l = list.data;
  const isOpen = l.status === 'aperta';
  const checkedLinked = (items.data ?? []).filter((i) => i.checked && i.item_id).length;
  const anyChecked = (items.data ?? []).some((i) => i.checked);
  const canMove = isOpen && !anyChecked;

  const cleanName = name.trim();
  const isoDate = isOpen ? null : itToIso(date);
  const dateInvalid = !isOpen && isoDate == null;
  const canSave = cleanName.length > 0 && !dateInvalid && !update.isPending;

  function save() {
    setError(null);
    const changes: Parameters<typeof update.mutate>[0] = {};
    if (cleanName !== l.name) changes.name = cleanName;
    if (location !== l.location) changes.location = location;
    if (!isOpen) {
      if ((shop.trim() || null) !== (l.shop ?? null)) changes.shop = shop.trim() || null;
      if (isoDate && isoDate !== l.closed_on) changes.closed_on = isoDate;
      if (paidBy !== l.paid_by) changes.paid_by = paidBy;
    }
    if (Object.keys(changes).length === 0) {
      router.back();
      return;
    }
    update.mutate(changes, {
      onSuccess: () => router.back(),
      onError: (e) => setError(errorMessage(e, 'Modifica non salvata. Riprova.')),
    });
  }

  function doDelete(revert: boolean) {
    setError(null);
    remove.mutate(revert, {
      onSuccess: () => router.dismissAll(),
      onError: (e) => setError(errorMessage(e, 'Eliminazione non riuscita. Riprova.')),
    });
  }

  function confirmDelete() {
    if (isOpen && checkedLinked > 0) {
      Alert.alert(
        'Eliminare la lista?',
        checkedLinked === 1
          ? '1 prodotto spuntato è già entrato in inventario. Vuoi toglierlo o lasciarlo?'
          : `${checkedLinked} prodotti spuntati sono già entrati in inventario. Vuoi toglierli o lasciarli?`,
        [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Lascia l’inventario', onPress: () => doDelete(false) },
          { text: 'Togli dall’inventario', style: 'destructive', onPress: () => doDelete(true) },
        ],
      );
      return;
    }
    Alert.alert(
      'Eliminare la lista?',
      isOpen
        ? `“${l.name}” e tutte le sue voci verranno eliminate.`
        : `Eliminerai anche lo storico di questa spesa (${l.items_count} articoli). L’inventario non cambia.`,
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Elimina', style: 'destructive', onPress: () => doDelete(false) },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Annulla</Text>
        </Pressable>
        <Text style={type.heading}>Modifica lista</Text>
        <View style={styles.back} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={type.label}>Nome</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              autoCapitalize="sentences"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Per</Text>
            <View style={styles.tiles}>
              {LOCATIONS.map((loc) => {
                const active = loc.value === location;
                return (
                  <Pressable
                    key={loc.value}
                    onPress={() => canMove && setLocation(loc.value)}
                    disabled={!canMove}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active, disabled: !canMove }}
                    style={[styles.tile, active && styles.tileActive, !canMove && !active && styles.tileOff]}
                  >
                    <Ionicons
                      name={LOCATION_ICONS[loc.value]}
                      size={24}
                      color={active ? colors.onAccent : colors.text}
                    />
                    <Text style={[styles.tileText, active && { color: colors.onAccent }]}>{loc.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {!canMove && (
              <Text style={type.caption}>
                {isOpen
                  ? 'Il luogo si può cambiare solo prima di spuntare le voci.'
                  : 'Il luogo di una lista chiusa non si cambia.'}
              </Text>
            )}
          </View>

          {!isOpen && (
            <>
              <View style={styles.field}>
                <Text style={type.label}>Negozio</Text>
                <TextInput
                  value={shop}
                  onChangeText={setShop}
                  placeholder="Es. Supermercato"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={type.label}>Data della spesa</Text>
                <TextInput
                  value={date}
                  onChangeText={setDate}
                  placeholder="gg/mm/aaaa"
                  placeholderTextColor={colors.muted}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.input, dateInvalid && styles.inputBad]}
                />
                {dateInvalid && (
                  <Text style={[type.caption, { color: colors.warn }]}>
                    Scrivi la data come 17/10/2026
                  </Text>
                )}
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
                {paidBy !== l.paid_by && (
                  <Text style={type.caption}>Cambiando chi ha pagato, il rimborso riparte da zero.</Text>
                )}
              </View>
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.danger}>
            <Pressable
              onPress={confirmDelete}
              disabled={remove.isPending}
              style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.85 }]}
            >
              {remove.isPending ? (
                <ActivityIndicator color={colors.warn} />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={18} color={colors.warn} />
                  <Text style={styles.deleteText}>Elimina la lista</Text>
                </>
              )}
            </Pressable>
            <Text style={[type.caption, styles.center]}>
              Può eliminarla chi l’ha creata o un amministratore.
            </Text>
          </View>
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
            {update.isPending ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.saveText}>Salva le modifiche</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
