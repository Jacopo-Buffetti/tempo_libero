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
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  COUNT_UNITS,
  MEASURE_UNITS,
  formatQty,
  isLocation,
  locationLabel,
  roundQty,
  unitInfo,
  qtyWithUnit,
  LOCATIONS,
  type Kind,
  type Location,
} from '@/lib/items';
import {
  dishNames,
  errorMessage,
  useAddListItems,
  useListItems,
  useRemoveListItem,
  useUpdateListItem,
} from '@/lib/spesa';
import { useMembership } from '@/providers/AuthProvider';
import { Chip } from '@/components/Chip';
import { Stepper } from '@/components/Stepper';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/screens/spesa/voce';

type Mode = 'inventory' | 'new-product' | 'list-only';

const defaultQty = (unit: string) => (unit === 'g' || unit === 'ml' ? 500 : 1);

export default function VoceLista() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const params = useLocalSearchParams<{
    listId: string;
    location: string;
    id?: string;
    mode?: Mode;
    name?: string;
    itemId?: string;
    dishId?: string;
    dishName?: string;
    canCreate?: string;
  }>();
  const membership = useMembership();
  const orgId = membership.data?.org_id;
  const listId = params.listId;
  const location = isLocation(params.location) ? params.location : 'cucina';

  const listItems = useListItems(listId);
  const existing = params.id ? listItems.data?.find((i) => i.id === params.id) : undefined;
  const isEdit = !!params.id;

  const productId = existing?.item_id ?? params.itemId;
  const product = useQuery({
    queryKey: ['spesa', 'product', productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('items')
        .select('id, name, unit, qty, min_qty, kind, location')
        .eq('id', productId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const canCreate = !isEdit && params.mode !== 'inventory' && params.canCreate === '1';
  const [alsoInventory, setAlsoInventory] = useState(params.mode === 'new-product');
  const mode: Mode = isEdit
    ? existing?.item_id
      ? 'inventory'
      : 'list-only'
    : params.mode === 'inventory'
      ? 'inventory'
      : canCreate && alsoInventory
        ? 'new-product'
        : 'list-only';
  const linked = mode === 'inventory';

  const [name, setName] = useState(params.name ?? '');
  const [unit, setUnit] = useState('pezzi');
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [newLocation, setNewLocation] = useState<Location>(location);
  const [kind, setKind] = useState<Kind>('consumabile');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = useAddListItems(listId, orgId);
  const update = useUpdateListItem(listId);
  const remove = useRemoveListItem(listId);

  useEffect(() => {
    if (ready) return;
    if (isEdit) {
      if (!existing) return;
      setName(existing.name);
      setUnit(existing.unit);
      setQty(existing.qty);
      setNote(existing.note ?? '');
      setReady(true);
      return;
    }
    if (linked) {
      if (!product.data) return;
      const p = product.data;
      setName(p.name);
      setUnit(p.unit);
      const missing = p.min_qty != null && p.qty < p.min_qty ? roundQty(p.min_qty - p.qty) : 0;
      setQty(missing > 0 ? missing : defaultQty(p.unit));
      setReady(true);
      return;
    }
    setReady(true);
  }, [ready, isEdit, existing, linked, product.data]);

  function changeUnit(u: string) {
    setUnit(u);
    setQty(defaultQty(u));
  }

  const cleanName = name.trim();
  const busy = add.isPending || update.isPending;
  const canSave = cleanName.length > 0 && qty > 0 && !busy;

  function save() {
    setError(null);
    if (isEdit && existing) {
      update.mutate(
        { id: existing.id, name: cleanName, qty, unit, note: note || null },
        {
          onSuccess: () => router.back(),
          onError: (e) => setError(errorMessage(e, 'Modifica non salvata. Riprova.')),
        },
      );
      return;
    }
    add.mutate(
      [
        {
          name: cleanName,
          qty,
          unit,
          note,
          itemId: linked ? productId : null,
          createIn: mode === 'new-product' ? newLocation : undefined,
          kind: mode === 'new-product' ? kind : undefined,
          dishId: params.dishId ?? null,
        },
      ],
      {
        onSuccess: () => router.back(),
        onError: (e) => setError(errorMessage(e, 'Non sono riuscito ad aggiungerla. Riprova.')),
      },
    );
  }

  function confirmRemove() {
    if (!existing) return;
    Alert.alert('Togliere dalla lista?', `“${existing.name}” non sarà più in questa lista.`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Togli',
        style: 'destructive',
        onPress: () => remove.mutate({ id: existing.id }, { onSuccess: () => router.back() }),
      },
    ]);
  }

  if (!ready) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const p = product.data;
  const dishName = params.dishName ?? (existing ? dishNames(existing) : undefined);
  const destination =
    mode === 'inventory'
      ? {
          icon: 'cube-outline' as const,
          text: `Quando la spunti va in inventario · ${locationLabel((p?.location as Location) ?? location)}`,
        }
      : mode === 'new-product'
        ? {
            icon: 'add-circle-outline' as const,
            text: `Nuovo prodotto: verrà creato in ${locationLabel(newLocation)}`,
          }
        : { icon: 'create-outline' as const, text: 'Solo in lista, non va in inventario' };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Annulla</Text>
        </Pressable>
        <Text style={type.heading}>{isEdit ? 'Modifica voce' : 'Nuova voce'}</Text>
        <View style={styles.back} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!!dishName && (
            <View style={[styles.destination, styles.dish]}>
              <Ionicons name="restaurant-outline" size={18} color={colors.ok} />
              <Text style={[styles.destinationText, { color: colors.ok }]}>
                {params.dishName ? `Ingrediente di “${dishName}”` : `Serve per: ${dishName}`}
              </Text>
            </View>
          )}
          {canCreate ? (
            <View style={styles.field}>
              <Text style={type.label}>Inventario</Text>
              <View style={styles.choices}>
                {(
                  [
                    {
                      value: false,
                      icon: 'create-outline',
                      title: 'Solo in lista',
                      hint: 'Non va in inventario',
                    },
                    {
                      value: true,
                      icon: 'add-circle-outline',
                      title: 'Nuovo prodotto',
                      hint: 'Va anche in inventario',
                    },
                  ] as const
                ).map((c) => {
                  const active = alsoInventory === c.value;
                  return (
                    <Pressable
                      key={c.title}
                      onPress={() => setAlsoInventory(c.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      style={[styles.choice, active && styles.choiceActive]}
                    >
                      <Ionicons name={c.icon} size={20} color={active ? colors.accent : colors.muted} />
                      <Text style={[styles.choiceTitle, active && styles.choiceTitleActive]}>{c.title}</Text>
                      <Text style={type.caption}>{c.hint}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.destination}>
              <Ionicons name={destination.icon} size={18} color={colors.accent} />
              <Text style={styles.destinationText}>{destination.text}</Text>
            </View>
          )}

          <View style={styles.field}>
            <Text style={type.label}>Prodotto</Text>
            {linked ? (
              <View style={styles.readonly}>
                <Text style={type.body}>{name}</Text>
                {p && (
                  <Text style={type.caption}>
                    In inventario: {qtyWithUnit(p.qty, p.unit)}
                    {p.min_qty != null ? ` · minimo ${formatQty(p.min_qty)}` : ''}
                  </Text>
                )}
              </View>
            ) : (
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Es. Farina 00"
                placeholderTextColor={colors.muted}
                autoCapitalize="sentences"
                style={styles.input}
              />
            )}
          </View>

          {mode === 'new-product' && (
            <>
              <View style={styles.field}>
                <Text style={type.label}>Dove va</Text>
                <View style={styles.chips}>
                  {LOCATIONS.map((l) => (
                    <Chip
                      key={l.value}
                      label={l.label}
                      variant="accent"
                      active={newLocation === l.value}
                      onPress={() => setNewLocation(l.value)}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.field}>
                <Text style={type.label}>Tipo</Text>
                <View style={styles.chips}>
                  <Chip
                    label="Si consuma"
                    variant="accent"
                    active={kind === 'consumabile'}
                    onPress={() => setKind('consumabile')}
                  />
                  <Chip
                    label="Attrezzatura"
                    variant="accent"
                    active={kind === 'attrezzatura'}
                    onPress={() => setKind('attrezzatura')}
                  />
                </View>
              </View>
            </>
          )}

          <View style={styles.field}>
            <Text style={type.label}>Unità</Text>
            {linked ? (
              <Text style={type.caption}>
                In {unitInfo(unit).label}, come il prodotto in inventario, così la quantità si somma
                correttamente.
              </Text>
            ) : (
              <>
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
              </>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.flex}>
              <Text style={type.body}>Quantità</Text>
              <Text style={type.caption}>
                In {unitInfo(unit).label}
                {unitInfo(unit).decimals > 0 ? ' · puoi scrivere 1,5' : ''}
              </Text>
            </View>
            <Stepper label="Quantità" value={qty} onChange={setQty} unit={unit} min={0} />
          </View>
          {p && p.min_qty != null && p.qty < p.min_qty && (
            <Text style={[type.caption, { color: colors.warn }]}>
              Per tornare alla scorta minima ne servono {qtyWithUnit(roundQty(p.min_qty - p.qty), p.unit)}.
            </Text>
          )}

          <View style={styles.field}>
            <Text style={type.label}>Nota</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Es. marca, formato, senza glutine, solo se in offerta…"
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.input, styles.noteInput]}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          {isEdit && (
            <Pressable onPress={confirmRemove} style={styles.removeButton}>
              <Ionicons name="trash-outline" size={18} color={colors.warn} />
              <Text style={styles.removeText}>Togli dalla lista</Text>
            </Pressable>
          )}
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
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.saveText}>{isEdit ? 'Salva' : `Aggiungi ${formatQty(qty)} ${unit}`}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
