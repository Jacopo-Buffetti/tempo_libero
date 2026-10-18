import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { formatEuro, localIsoDate, tripsKeys, type TripTotal } from '@/lib/spesa';
import { useMembership } from '@/providers/AuthProvider';
import { Chip } from '@/components/Chip';
import { colors, font, radius, space, touch, type } from '@/theme/tokens';

type Filter = 'tutte' | 'rimborsare' | 'prezzi';

const toRefund = (t: TripTotal) => t.paid_by === 'volontario' && !t.reimbursed;

const monthLabel = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  const s = d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export default function Storico() {
  const membership = useMembership();
  const orgId = membership.data?.org_id;
  const [filter, setFilter] = useState<Filter>('tutte');

  const trips = useQuery({
    queryKey: tripsKeys.list(orgId),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_trip_totals')
        .select('*')
        .eq('org_id', orgId!)
        .order('trip_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const all = trips.data ?? [];

  // Riepilogo del mese in corso
  const thisMonth = localIsoDate().slice(0, 7);
  const monthTrips = all.filter((t) => t.trip_date?.startsWith(thisMonth));
  const monthTotal = monthTrips.reduce((s, t) => s + (t.total_cents ?? 0), 0);
  const refundTotal = all.filter(toRefund).reduce((s, t) => s + (t.total_cents ?? 0), 0);

  const sections = useMemo(() => {
    const filtered = all.filter((t) =>
      filter === 'rimborsare' ? toRefund(t) : filter === 'prezzi' ? (t.missing_prices ?? 0) > 0 : true,
    );
    const groups = new Map<string, TripTotal[]>();
    filtered.forEach((t) => {
      const key = (t.trip_date ?? '').slice(0, 7);
      groups.set(key, [...(groups.get(key) ?? []), t]);
    });
    return [...groups.entries()].map(([key, data]) => ({
      title: monthLabel(`${key}-01`),
      data,
    }));
  }, [all, filter]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Spesa</Text>
        </Pressable>
        <Text style={type.heading}>Storico spese</Text>
        <View style={styles.back} />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id!}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={trips.isRefetching}
            onRefresh={trips.refetch}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.summary}>
              <Text style={type.label}>{monthLabel(`${thisMonth}-01`)}</Text>
              <Text style={styles.summaryTotal}>{formatEuro(monthTotal)}</Text>
              <Text style={type.caption}>
                {monthTrips.length === 1 ? '1 spesa' : `${monthTrips.length} spese`} questo mese
              </Text>
              {refundTotal > 0 && (
                <View style={styles.refund}>
                  <Ionicons name="person-outline" size={16} color="#6B3300" />
                  <Text style={styles.refundText}>
                    Da rimborsare ai volontari: {formatEuro(refundTotal)}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.chips}>
              <Chip label="Tutte" active={filter === 'tutte'} onPress={() => setFilter('tutte')} />
              <Chip
                label="Da rimborsare"
                active={filter === 'rimborsare'}
                onPress={() => setFilter('rimborsare')}
              />
              <Chip
                label="Prezzi mancanti"
                active={filter === 'prezzi'}
                onPress={() => setFilter('prezzi')}
              />
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={[type.label, styles.sectionTitle]}>{section.title}</Text>
        )}
        ListEmptyComponent={
          trips.isLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: space(8) }} />
          ) : (
            <Text style={[type.caption, styles.empty]}>
              {filter === 'tutte'
                ? 'Nessuna spesa registrata. Quando chiudi una spesa dalla lista, la trovi qui.'
                : 'Nessuna spesa con questo filtro.'}
            </Text>
          )
        }
        renderItem={({ item: t, index, section }) => {
          const isFirst = index === 0;
          const isLast = index === section.data.length - 1;
          const day = new Date(`${t.trip_date}T12:00:00`);
          const notes: { text: string; warn: boolean }[] = [];
          if ((t.missing_prices ?? 0) > 0) {
            notes.push({
              text: t.missing_prices === 1 ? '1 prezzo da inserire' : `${t.missing_prices} prezzi da inserire`,
              warn: true,
            });
          }
          if (toRefund(t)) notes.push({ text: 'da rimborsare', warn: true });
          if (notes.length === 0) {
            notes.push({
              text: t.lines_count === 1 ? '1 articolo' : `${t.lines_count} articoli`,
              warn: false,
            });
          }

          return (
            <Pressable
              onPress={() => router.push({ pathname: '/spesa/[id]', params: { id: t.id! } })}
              style={({ pressed }) => [
                styles.row,
                isFirst && styles.first,
                isLast && styles.last,
                !isLast && styles.divider,
                pressed && { backgroundColor: '#F7F8FC' },
              ]}
            >
              <View style={styles.date}>
                <Text style={styles.dateDay}>{day.getDate()}</Text>
                <Text style={styles.dateMonth}>
                  {day.toLocaleDateString('it-IT', { month: 'short' })}
                </Text>
              </View>
              <View style={styles.rowText}>
                <Text style={type.body} numberOfLines={1}>{t.shop}</Text>
                <Text
                  style={[type.caption, notes.some((n) => n.warn) && { color: colors.warn }]}
                  numberOfLines={1}
                >
                  {notes.map((n) => n.text).join(' · ')}
                </Text>
              </View>
              <Text style={styles.amount}>{formatEuro(t.total_cents)}</Text>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space(2),
    paddingVertical: space(1),
  },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: touch, width: 80 },
  backText: { fontFamily: font.bold, fontSize: 15, color: colors.accent },

  content: { padding: space(5), paddingTop: space(2), paddingBottom: space(10) },
  headerBlock: { gap: space(4), marginBottom: space(2) },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space(4),
    gap: space(1.5),
  },
  summaryTotal: { fontFamily: font.black, fontSize: 34, letterSpacing: -0.7, color: colors.text },
  refund: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    marginTop: space(2),
    backgroundColor: colors.warnSoft,
    borderRadius: radius.sm,
    padding: space(2.5),
  },
  refundText: { fontFamily: font.bold, fontSize: 14, color: '#6B3300' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },

  sectionTitle: { marginTop: space(4), marginBottom: space(2) },
  empty: { textAlign: 'center', marginTop: space(8), paddingHorizontal: space(6) },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingVertical: space(3),
    paddingHorizontal: space(4),
    backgroundColor: colors.surface,
  },
  first: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  last: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  date: {
    width: touch,
    height: touch,
    borderRadius: 12,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: { fontFamily: font.black, fontSize: 16, color: colors.text, lineHeight: 18 },
  dateMonth: { fontFamily: font.bold, fontSize: 10, color: colors.muted, textTransform: 'uppercase' },
  rowText: { flex: 1, gap: 2 },
  amount: { fontFamily: font.black, fontSize: 16, color: colors.text },
});
