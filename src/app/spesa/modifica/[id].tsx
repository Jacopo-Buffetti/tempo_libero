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
import { type Location } from '@/lib/items';
import {
  errorMessage,
  listLocations,
  locationsLabel,
  useDeleteList,
  useList,
  useListItems,
  useUpdateList,
} from '@/lib/spesa';
import { useTheme } from '@/theme/tokens';
import { LocationPicker } from '@/components/LocationPicker';
import { useStyles } from '@/styles/screens/spesa/modifica';
import { useRole } from '@/lib/ruoli';

export default function ModificaLista() {
  const styles = useStyles();
  const { isConsigliere, userId } = useRole();
  const { colors, type } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const list = useList(id);
  const canDelete = isConsigliere || (!!userId && list.data?.created_by === userId);
  const items = useListItems(id);
  const update = useUpdateList(id);
  const remove = useDeleteList(id);

  const [name, setName] = useState('');
  const [locations, setLocations] = useState<Location[]>(['cucina']);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready || !list.data) return;
    const l = list.data;
    setName(l.name ?? '');
    setLocations(listLocations(l));
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

  const cleanName = name.trim();
  const canSave = cleanName.length > 0 && !update.isPending;

  function save() {
    setError(null);
    const changes: Parameters<typeof update.mutate>[0] = {};
    if (cleanName !== l.name) changes.name = cleanName;
    if (isOpen && locations.join(',') !== listLocations(l).join(',')) changes.locations = locations;
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

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={type.label}>Nome</Text>
            <TextInput value={name} onChangeText={setName} autoCapitalize="sentences" style={styles.input} />
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Per</Text>
            {isOpen ? (
              <>
                <LocationPicker value={locations} onChange={setLocations} />
                <Text style={type.caption}>
                  Togliere un luogo non sposta niente: ogni prodotto va sempre nel suo posto in inventario.
                </Text>
              </>
            ) : (
              <Text style={type.body}>{locationsLabel(locations)}</Text>
            )}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          {canDelete ? (
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
          ) : (
            <Text style={[type.caption, styles.center]}>
              Solo chi ha creato la lista o un consigliere può eliminarla.
            </Text>
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
