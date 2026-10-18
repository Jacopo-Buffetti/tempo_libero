import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  ITEM_COLUMNS,
  LOCATIONS,
  isLow,
  itemsKeys,
  locationLabel,
  needsRepair,
  useAdjustQuantity,
  type Location,
} from '@/lib/items';
import { useMembership } from '@/providers/AuthProvider';
import { Chip } from '@/components/Chip';
import { ItemRow } from '@/components/ItemRow';
import { colors, space, type } from '@/theme/tokens';
import { styles } from '@/styles/screens/inventario';

type Filter = 'tutti' | 'scorta' | 'riparare';

export default function Inventario() {
  const membership = useMembership();
  const orgId = membership.data?.org_id;
  const [location, setLocation] = useState<Location>('magazzino');
  const [filter, setFilter] = useState<Filter>('tutti');
  const adjust = useAdjustQuantity();

  const items = useQuery({
    queryKey: itemsKeys.list(orgId, location),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('items')
        .select(ITEM_COLUMNS)
        .eq('org_id', orgId!)
        .eq('location', location)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const all = items.data ?? [];
  const lowCount = useMemo(() => all.filter(isLow).length, [all]);
  const repairCount = useMemo(() => all.filter(needsRepair).length, [all]);
  const visible = useMemo(
    () =>
      filter === 'scorta' ? all.filter(isLow) : filter === 'riparare' ? all.filter(needsRepair) : all,
    [all, filter],
  );

  if (membership.isLoading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (!membership.data) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <Text style={type.heading}>Account non collegato</Text>
        <Text style={[type.caption, styles.centerText]}>
          Il tuo account non fa ancora parte di una Pro Loco. Chiedi a un amministratore di
          aggiungerti.
        </Text>
      </SafeAreaView>
    );
  }

  const label = locationLabel(location);
  const emptyText =
    filter === 'scorta'
      ? `Niente sotto scorta in ${label}.`
      : filter === 'riparare'
        ? `Niente da riparare in ${label}.`
        : `Ancora niente in ${label}. Aggiungi il primo oggetto con il pulsante +.`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={type.title}>Inventario</Text>
          <Pressable
            onPress={() => router.push('/inventario/dati')}
            accessibilityLabel="Esporta o importa l'inventario"
            style={({ pressed }) => [styles.dataButton, pressed && styles.dataButtonPressed]}
          >
            <Ionicons name="swap-vertical" size={18} color={colors.accent} />
            <Text style={styles.dataButtonText}>PDF · CSV</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.push('/ricerca')}
          accessibilityRole="search"
          style={({ pressed }) => [styles.search, pressed && { backgroundColor: colors.bg }]}
        >
          <Ionicons name="search" size={18} color={colors.muted} />
          <Text style={styles.searchText}>Cerca in tutto l’inventario</Text>
        </Pressable>

        <View style={styles.segment}>
          {LOCATIONS.map((l) => {
            const active = l.value === location;
            return (
              <Pressable
                key={l.value}
                onPress={() => {
                  setLocation(l.value);
                  setFilter('tutti');
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={[styles.segmentItem, active && styles.segmentItemActive]}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {l.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.chips}>
          <Chip label="Tutti" active={filter === 'tutti'} onPress={() => setFilter('tutti')} />
          <Chip
            label={`Sotto scorta · ${lowCount}`}
            active={filter === 'scorta'}
            onPress={() => setFilter(filter === 'scorta' ? 'tutti' : 'scorta')}
          />
          <Chip
            label={`Da riparare · ${repairCount}`}
            active={filter === 'riparare'}
            onPress={() => setFilter(filter === 'riparare' ? 'tutti' : 'riparare')}
          />
        </View>
      </View>

      <FlatList
        data={visible}
        keyExtractor={(i) => i.id}
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
            <Text style={[type.caption, styles.centerText]}>
              Non riesco a caricare l’inventario. Trascina in basso per riprovare.
            </Text>
          ) : (
            <Text style={[type.caption, styles.centerText]}>{emptyText}</Text>
          )
        }
        renderItem={({ item, index }) => (
          <ItemRow
            item={item}
            isFirst={index === 0}
            isLast={index === visible.length - 1}
            onAdjust={(delta) => adjust.mutate({ id: item.id, delta })}
            onPress={() => router.push({ pathname: '/oggetto/[id]', params: { id: item.id } })}
          />
        )}
      />

      <Pressable
        onPress={() => router.push({ pathname: '/nuovo-oggetto', params: { location } })}
        accessibilityLabel={`Aggiungi un oggetto in ${label}`}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="add" size={30} color={colors.onAccent} />
      </Pressable>
    </SafeAreaView>
  );
}
