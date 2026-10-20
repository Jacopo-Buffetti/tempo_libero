import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  ITEM_COLUMNS,
  LOCATIONS,
  escapeLike,
  isLow,
  itemsKeys,
  needsRepair,
  type Location,
} from '@/lib/items';
import { useMembership } from '@/providers/AuthProvider';
import { Chip } from '@/components/Chip';
import { ItemRow } from '@/components/ItemRow';
import { space, useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/screens/ricerca';

type Place = Location | 'tutti';

function useDebounced<T>(value: T, ms = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function Ricerca() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const membership = useMembership();
  const orgId = membership.data?.org_id;

  const [text, setText] = useState('');
  const [place, setPlace] = useState<Place>('tutti');
  const [onlyLow, setOnlyLow] = useState(false);
  const [onlyRepair, setOnlyRepair] = useState(false);

  const term = useDebounced(text.trim());
  const hasCriteria = term.length > 0 || place !== 'tutti' || onlyLow || onlyRepair;

  const results = useQuery({
    queryKey: itemsKeys.search(orgId, term, place),
    enabled: !!orgId && hasCriteria,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from('items').select(ITEM_COLUMNS).eq('org_id', orgId!).order('name').limit(100);
      if (term) query = query.ilike('name', `%${escapeLike(term)}%`);
      if (place !== 'tutti') query = query.eq('location', place);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const visible = useMemo(() => {
    let list = results.data ?? [];
    if (onlyLow) list = list.filter(isLow);
    if (onlyRepair) list = list.filter(needsRepair);
    return list;
  }, [results.data, onlyLow, onlyRepair]);

  const count = visible.length === 1 ? '1 risultato' : `${visible.length} risultati`;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.searchRow}>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Cerca sedie, gin, pentoloni…"
              placeholderTextColor={colors.muted}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Cerca nell’inventario"
              style={styles.input}
            />
            {text.length > 0 && (
              <Pressable onPress={() => setText('')} hitSlop={10} accessibilityLabel="Cancella">
                <Ionicons name="close-circle" size={20} color={colors.muted} />
              </Pressable>
            )}
          </View>
          <Pressable onPress={() => router.back()} style={styles.close}>
            <Text style={styles.closeText}>Chiudi</Text>
          </Pressable>
        </View>

        <View style={styles.group}>
          <Text style={type.label}>Dove</Text>
          <View style={styles.chips}>
            <Chip
              label="Tutti"
              variant="accent"
              active={place === 'tutti'}
              onPress={() => setPlace('tutti')}
            />
            {LOCATIONS.map((l) => (
              <Chip
                key={l.value}
                label={l.label}
                variant="accent"
                active={place === l.value}
                onPress={() => setPlace(l.value)}
              />
            ))}
          </View>
        </View>

        <View style={styles.group}>
          <Text style={type.label}>Stato</Text>
          <View style={styles.chips}>
            <Chip label="Sotto scorta" active={onlyLow} onPress={() => setOnlyLow((v) => !v)} />
            <Chip label="Da riparare" active={onlyRepair} onPress={() => setOnlyRepair((v) => !v)} />
          </View>
        </View>
      </View>

      {!hasCriteria ? (
        <Text style={[type.caption, styles.hint]}>Scrivi il nome di un oggetto oppure scegli un filtro.</Text>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            results.isFetching && !results.data ? null : (
              <Text style={[type.label, styles.count]}>{count}</Text>
            )
          }
          ListEmptyComponent={
            results.isLoading ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: space(8) }} />
            ) : results.isError ? (
              <Text style={[type.caption, styles.hint]}>
                Ricerca non riuscita. Controlla la connessione e riprova.
              </Text>
            ) : (
              <Text style={[type.caption, styles.hint]}>
                Nessun oggetto trovato. Prova un altro nome o togli qualche filtro.
              </Text>
            )
          }
          renderItem={({ item, index }) => (
            <ItemRow
              item={item}
              isFirst={index === 0}
              isLast={index === visible.length - 1}
              showLocation
              highlight={term}
              onPress={() => router.push({ pathname: '/oggetto/[id]', params: { id: item.id } })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
