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
import { escapeLike, formatQty, locationLabel, roundQty, stepFor, type Location } from '@/lib/items';
import {
  SECTIONS,
  ensureEventList,
  useDeleteDish,
  useDishIngredients,
  useEvent,
  useSaveDish,
  useSetDishIngredientQty,
  type DishIngredient,
  type Section,
} from '@/lib/menu';
import { centsToInput, errorMessage, parseEuro } from '@/lib/spesa';
import { useMembership } from '@/providers/AuthProvider';
import { Chip } from '@/components/Chip';
import { colors, type } from '@/theme/tokens';
import { styles } from '@/styles/screens/menu/piatto';

const isSection = (v: unknown): v is Section =>
  typeof v === 'string' && SECTIONS.some((s) => s.value === v);

type Mode = 'inventory' | 'new-product' | 'list-only';

export default function Piatto() {
  const params = useLocalSearchParams<{ eventId: string; id?: string; section?: string }>();
  const membership = useMembership();
  const orgId = membership.data?.org_id;
  const event = useEvent(params.eventId);

  const [dishId, setDishId] = useState<string | undefined>(params.id);
  const existing = dishId ? event.data?.dishes.find((d) => d.id === dishId) : undefined;
  const isEdit = !!params.id;

  const save = useSaveDish(params.eventId, orgId);
  const remove = useDeleteDish();
  const ingredients = useDishIngredients(dishId);
  const setShare = useSetDishIngredientQty();

  const [section, setSection] = useState<Section>(
    isSection(params.section) ? params.section : 'primi',
  );
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [ready, setReady] = useState(!isEdit);
  const [error, setError] = useState<string | null>(null);

  const [term, setTerm] = useState('');
  const [opening, setOpening] = useState(false);
  const cleanTerm = term.trim();

  useEffect(() => {
    if (ready || !existing) return;
    setSection(isSection(existing.section) ? existing.section : 'primi');
    setName(existing.name);
    setDescription(existing.description ?? '');
    setPrice(centsToInput(existing.price_cents));
    setReady(true);
  }, [ready, existing]);

  const suggestions = useQuery({
    queryKey: ['menu', 'ingredient-suggest', orgId, cleanTerm],
    enabled: !!orgId && cleanTerm.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('items')
        .select('id, name, unit, location')
        .eq('org_id', orgId!)
        .eq('kind', 'consumabile')
        .ilike('name', `%${escapeLike(cleanTerm)}%`)
        .order('name')
        .limit(4);
      if (error) throw error;
      return data;
    },
  });
  const exactExists = (suggestions.data ?? []).some(
    (s) => s.name.toLowerCase() === cleanTerm.toLowerCase(),
  );

  const isFixed = event.data?.price_mode === 'fisso';
  const cleanName = name.trim();
  const cents = parseEuro(price);
  const priceInvalid = !isFixed && price.trim() !== '' && cents == null;
  const canSave = cleanName.length > 0 && !priceInvalid && !save.isPending;

  const lastPosition = () =>
    Math.max(-1, ...(event.data?.dishes ?? []).filter((d) => d.section === section).map((d) => d.position));

  function dishValues() {
    return {
      id: dishId,
      section,
      name: cleanName,
      description: description.trim() || null,
      price_cents: isFixed ? (existing?.price_cents ?? null) : cents,
      position: lastPosition() + 1,
    };
  }

  function submit() {
    setError(null);
    save.mutate(dishValues(), {
      onSuccess: () => router.back(),
      onError: (e) => setError(errorMessage(e, 'Piatto non salvato. Riprova.')),
    });
  }

  async function addIngredient(mode: Mode, ingredientName: string, itemId?: string) {
    if (!cleanName) {
      setError('Scrivi prima il nome del piatto.');
      return;
    }
    setError(null);
    setOpening(true);
    try {
      const id = dishId ?? (await save.mutateAsync(dishValues()));
      if (!dishId) setDishId(id);
      const listId = await ensureEventList(params.eventId);
      setTerm('');
      router.push({
        pathname: '/spesa/voce',
        params: {
          listId,
          location: 'cucina',
          mode,
          name: ingredientName,
          dishId: id,
          dishName: cleanName,
          ...(itemId ? { itemId } : {}),
        },
      });
    } catch (e) {
      setError(errorMessage(e, 'Non riesco ad aggiungere l’ingrediente. Riprova.'));
    } finally {
      setOpening(false);
    }
  }

  function confirmRemove() {
    if (!existing) return;
    const n = ingredients.data?.filter((i) => !i.shopping_list_items?.checked).length ?? 0;
    Alert.alert(
      'Togliere il piatto?',
      n > 0
        ? `“${existing.name}” non sarà più nel menù e le quantità dei suoi ${n} ingredienti non ancora comprati verranno tolte dalla lista della spesa.`
        : `“${existing.name}” non sarà più nel menù.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Togli',
          style: 'destructive',
          onPress: () => remove.mutate(existing.id, { onSuccess: () => router.back() }),
        },
      ],
    );
  }

  if (!ready) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const list = ingredients.data ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>{dishId && !isEdit ? 'Chiudi' : 'Annulla'}</Text>
        </Pressable>
        <Text style={type.heading}>{dishId ? 'Piatto' : 'Nuovo piatto'}</Text>
        <View style={styles.back} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={type.label}>Sezione</Text>
            <View style={styles.chips}>
              {SECTIONS.map((s) => (
                <Chip
                  key={s.value}
                  label={s.label}
                  variant="accent"
                  active={section === s.value}
                  onPress={() => setSection(s.value)}
                />
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Nome</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Es. Strangozzi al tartufo"
              placeholderTextColor={colors.muted}
              autoCapitalize="sentences"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Descrizione</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Come viene presentato nel menù (facoltativa)"
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.input, styles.multiline]}
            />
          </View>

          {isFixed ? (
            <Text style={type.caption}>
              Menù fisso: il piatto non ha un prezzo suo, vale quello a persona del menù.
            </Text>
          ) : (
            <View style={styles.field}>
              <Text style={type.label}>Prezzo</Text>
              <View style={[styles.priceBox, priceInvalid && styles.inputBad]}>
                <Text style={styles.euro}>€</Text>
                <TextInput
                  value={price}
                  onChangeText={setPrice}
                  placeholder="0,00"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Prezzo"
                  style={styles.priceInput}
                />
              </View>
            </View>
          )}

          <View style={styles.field}>
            <View style={styles.ingHead}>
              <Text style={type.label}>Ingredienti da comprare</Text>
              {list.length > 0 && <Text style={type.caption}>{list.length}</Text>}
            </View>
            <Text style={type.caption}>
              Finiscono subito nella lista della spesa di “{event.data?.name}”. Se un ingrediente
              con lo stesso nome c’è già (anche per un altro piatto), le quantità si sommano.
            </Text>

            {list.length > 0 && (
              <View style={styles.card}>
                {list.map((ing, i) => (
                  <IngredientRow
                    key={ing.id}
                    ing={ing}
                    isLast={i === list.length - 1}
                    onChange={(qty) => setShare.mutate({ id: ing.id, qty })}
                    onRemove={() =>
                      Alert.alert(
                        'Togliere l’ingrediente?',
                        `Togli ${formatQty(ing.qty)} ${ing.shopping_list_items?.unit ?? ''} di “${ing.shopping_list_items?.name}” da questo piatto e dalla lista della spesa.`,
                        [
                          { text: 'Annulla', style: 'cancel' },
                          { text: 'Togli', style: 'destructive', onPress: () => setShare.mutate({ id: ing.id, qty: 0 }) },
                        ],
                      )
                    }
                  />
                ))}
              </View>
            )}

            <View style={styles.addBox}>
              <Ionicons name="add-circle-outline" size={20} color={colors.muted} />
              <TextInput
                value={term}
                onChangeText={setTerm}
                placeholder="Aggiungi un ingrediente…"
                placeholderTextColor={colors.muted}
                style={styles.addInput}
              />
              {opening && <ActivityIndicator color={colors.accent} />}
            </View>

            {cleanTerm.length >= 2 && (
              <View style={styles.suggestBox}>
                {(suggestions.data ?? []).map((s) => (
                  <Option
                    key={s.id}
                    icon="cube-outline"
                    color={colors.accent}
                    title={s.name}
                    hint={`in ${locationLabel(s.location)}`}
                    onPress={() => addIngredient('inventory', s.name, s.id)}
                  />
                ))}
                {!exactExists && (
                  <Option
                    icon="add-circle-outline"
                    color={colors.accent}
                    title={`Nuovo prodotto: “${cleanTerm}”`}
                    hint="anche in Cucina"
                    onPress={() => addIngredient('new-product', cleanTerm)}
                  />
                )}
                <Option
                  icon="create-outline"
                  color={colors.muted}
                  title={`Solo in lista: “${cleanTerm}”`}
                  hint="non va in inventario"
                  onPress={() => addIngredient('list-only', cleanTerm)}
                />
              </View>
            )}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          {existing && (
            <Pressable onPress={confirmRemove} style={styles.removeButton}>
              <Ionicons name="trash-outline" size={18} color={colors.warn} />
              <Text style={styles.removeText}>Togli dal menù</Text>
            </Pressable>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={submit}
            disabled={!canSave}
            style={({ pressed }) => [
              styles.saveButton,
              !canSave && styles.saveDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            {save.isPending && !opening ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.saveText}>{dishId ? 'Salva' : 'Aggiungi al menù'}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function IngredientRow({
  ing,
  isLast,
  onChange,
  onRemove,
}: {
  ing: DishIngredient;
  isLast: boolean;
  onChange: (qty: number) => void;
  onRemove: () => void;
}) {
  const line = ing.shopping_list_items;
  if (!line) return null;
  const step = stepFor(line.unit);
  const shared = (line.dish_ingredients?.[0]?.count ?? 1) > 1;
  const where = line.item_id
    ? `Va in inventario · ${locationLabel((line.items?.location ?? 'cucina') as Location)}`
    : 'Solo in lista';

  return (
    <View style={[styles.ingRow, !isLast && styles.divider]}>
      <Ionicons
        name={line.checked ? 'checkmark-circle' : line.item_id ? 'cube-outline' : 'create-outline'}
        size={20}
        color={line.checked ? colors.ok : line.item_id ? colors.accent : colors.muted}
      />
      <View style={styles.flex}>
        <Text style={[type.body, line.checked && styles.done]}>{line.name}</Text>
        <Text style={type.caption}>
          {line.checked ? 'Già comprato' : where}
          {line.note ? ` · ${line.note}` : ''}
        </Text>
        {shared && (
          <Text style={styles.shared}>
            In lista {formatQty(line.qty)} {line.unit} in tutto, serve anche ad altri piatti
          </Text>
        )}
      </View>
      {line.checked ? (
        <Text style={styles.qty}>
          {formatQty(ing.qty)} {line.unit}
        </Text>
      ) : (
        <>
          <Pressable
            onPress={() => (ing.qty - step > 0 ? onChange(roundQty(ing.qty - step)) : onRemove())}
            accessibilityLabel={ing.qty - step > 0 ? `Togli ${formatQty(step)} ${line.unit}` : 'Togli ingrediente'}
            style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
          >
            <Ionicons
              name={ing.qty - step > 0 ? 'remove' : 'trash-outline'}
              size={18}
              color={ing.qty - step > 0 ? colors.text : colors.warn}
            />
          </Pressable>
          <View style={styles.qtyBox}>
            <Text style={styles.qty}>{formatQty(ing.qty)}</Text>
            <Text style={styles.unit}>{line.unit}</Text>
          </View>
          <Pressable
            onPress={() => onChange(roundQty(ing.qty + step))}
            accessibilityLabel={`Aggiungi ${formatQty(step)} ${line.unit}`}
            style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
          >
            <Ionicons name="add" size={18} color={colors.text} />
          </Pressable>
        </>
      )}
    </View>
  );
}

function Option({
  icon,
  color,
  title,
  hint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.bg }]}
    >
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[type.body, styles.flex]} numberOfLines={1}>{title}</Text>
      <Text style={type.caption}>{hint}</Text>
    </Pressable>
  );
}
