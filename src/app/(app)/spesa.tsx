import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LOCATIONS, type Location } from '@/lib/items';
import {
  dateFromIso,
  formatEuro,
  listLocations,
  listTotal,
  localIsoDate,
  locationsLabel,
  useListsContaining,
  useListsSummary,
  type ListSummary,
} from '@/lib/spesa';
import { Chip } from '@/components/Chip';
import { useMembership } from '@/providers/AuthProvider';
import { colors, space, type } from '@/theme/tokens';
import { styles } from '@/styles/screens/listeSpesa';

const refundOf = (l: ListSummary) =>
  (l.runs_count ?? 0) > 0
    ? (l.refund_cents ?? 0)
    : l.paid_by === 'volontario' && !l.reimbursed
      ? listTotal(l)
      : 0;
const toRefund = (l: ListSummary) => refundOf(l) > 0;

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function ListeSpesa() {
  const membership = useMembership();
  const orgId = membership.data?.org_id;
  const lists = useListsSummary(orgId);

  const [text, setText] = useState('');
  const [place, setPlace] = useState<Location | 'tutte'>('tutte');
  const term = useDebounced(text.trim());
  const containing = useListsContaining(orgId, term);
  const searching = term.length > 0 || place !== 'tutte';

  const filtered = useMemo(() => {
    const t = term.toLowerCase();
    return (lists.data ?? []).filter((l) => {
      if (place !== 'tutte' && !listLocations(l).includes(place)) return false;
      if (!t) return true;
      return (
        l.name?.toLowerCase().includes(t) ||
        l.shop?.toLowerCase().includes(t) ||
        (t.length >= 2 && containing.data?.has(l.id!))
      );
    });
  }, [lists.data, term, place, containing.data]);

  const all = lists.data ?? [];
  const open = filtered.filter((l) => l.status === 'aperta');
  const closed = useMemo(
    () =>
      filtered
        .filter((l) => l.status === 'chiusa')
        .sort((a, b) => (b.closed_on ?? '').localeCompare(a.closed_on ?? '')),
    [filtered],
  );
  const allClosed = all.filter((l) => l.status === 'chiusa');

  const thisMonth = localIsoDate().slice(0, 7);
  const monthTotal = allClosed
    .filter((l) => l.closed_on?.startsWith(thisMonth))
    .reduce((s, l) => s + listTotal(l), 0);
  const refundTotal = all.reduce((s, l) => s + refundOf(l), 0);

  const sections = [
    { key: 'attive', title: 'Attive', data: open },
    { key: 'storico', title: 'Storico', data: closed },
  ];

  const openList = (id: string) => router.push({ pathname: '/spesa/[id]', params: { id } });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={type.title}>Liste spesa</Text>
        <Pressable
          onPress={() => router.push('/spesa/nuova')}
          style={({ pressed }) => [styles.newButton, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="add" size={20} color={colors.onAccent} />
          <Text style={styles.newText}>Nuova</Text>
        </Pressable>
      </View>

      <View style={styles.search}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Cerca liste, negozi o prodotti…"
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Cerca nelle liste"
            style={styles.searchInput}
          />
          {text.length > 0 && (
            <Pressable onPress={() => setText('')} hitSlop={10} accessibilityLabel="Cancella">
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </Pressable>
          )}
        </View>
        <View style={styles.chips}>
          <Chip label="Tutte" active={place === 'tutte'} onPress={() => setPlace('tutte')} />
          {LOCATIONS.map((loc) => (
            <Chip
              key={loc.value}
              label={loc.label}
              active={place === loc.value}
              onPress={() => setPlace(place === loc.value ? 'tutte' : loc.value)}
            />
          ))}
        </View>
      </View>

      <SectionList
        sections={sections}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(l) => l.id!}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={lists.isRefetching}
            onRefresh={lists.refetch}
            tintColor={colors.accent}
          />
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={type.label}>{section.title}</Text>
            {section.key === 'storico' && !searching && closed.length > 0 && (
              <Text style={type.caption}>
                Questo mese {formatEuro(monthTotal)}
                {refundTotal > 0 ? ` · da rimborsare ${formatEuro(refundTotal)}` : ''}
              </Text>
            )}
          </View>
        )}
        renderSectionFooter={({ section }) =>
          section.data.length > 0 ? null : lists.isLoading ? (
            section.key === 'attive' ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: space(4) }} />
            ) : null
          ) : searching ? (
            <Text style={[type.caption, styles.emptyText]}>
              {section.key === 'attive' ? 'Nessuna lista attiva trovata.' : 'Nessuna lista chiusa trovata.'}
            </Text>
          ) : section.key === 'attive' ? (
            <Pressable onPress={() => router.push('/spesa/nuova')} style={styles.emptyCard}>
              <Ionicons name="cart-outline" size={26} color={colors.muted} />
              <Text style={[type.caption, styles.center]}>
                Nessuna lista attiva. Creane una per la Cucina, il Bar o il Magazzino.
              </Text>
            </Pressable>
          ) : (
            <Text style={[type.caption, styles.emptyText]}>
              Le liste chiuse, con prezzi e rimborsi, compariranno qui.
            </Text>
          )
        }
        renderItem={({ item: l, index, section }) =>
          section.key === 'attive' ? (
            <OpenCard
              list={l}
              match={containing.data?.get(l.id!)}
              onPress={() => openList(l.id!)}
              onLongPress={() => router.push({ pathname: '/spesa/modifica/[id]', params: { id: l.id! } })}
            />
          ) : (
            <ClosedRow
              list={l}
              match={term.length >= 2 ? containing.data?.get(l.id!) : undefined}
              onLongPress={() => router.push({ pathname: '/spesa/modifica/[id]', params: { id: l.id! } })}
              isFirst={index === 0}
              isLast={index === section.data.length - 1}
              onPress={() => openList(l.id!)}
            />
          )
        }
      />
    </SafeAreaView>
  );
}

function OpenCard({
  list,
  match,
  onPress,
  onLongPress,
}: {
  list: ListSummary;
  match?: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const total = list.items_count ?? 0;
  const done = list.checked_count ?? 0;
  const left = total - done;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.pressed }]}
    >
      <View style={styles.cardTop}>
        <View style={styles.flex}>
          <Text style={type.body} numberOfLines={1}>
            {list.name}
          </Text>
          <Text style={type.caption}>
            {total === 0
              ? 'Lista vuota'
              : left === 0
                ? 'Tutto preso · da chiudere'
                : `${left} da prendere su ${total}`}
          </Text>
          {(list.runs_count ?? 0) > 0 && (
            <Text style={styles.spent}>
              Già speso {formatEuro(list.spent_cents)} in {list.runs_count}{' '}
              {list.runs_count === 1 ? 'spesa' : 'spese'}
              {(list.unregistered_count ?? 0) > 0 ? ` · ${list.unregistered_count} da registrare` : ''}
            </Text>
          )}
          {(list.runs_count ?? 0) === 0 && (list.unregistered_count ?? 0) > 0 && (
            <Text style={styles.spent}>{list.unregistered_count} presi, da registrare</Text>
          )}
          {match && <Text style={styles.match}>Contiene: {match}</Text>}
        </View>
        <Text style={styles.tag} numberOfLines={1}>
          {locationsLabel(listLocations(list))}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </View>
      {total > 0 && (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${(done / total) * 100}%` }]} />
        </View>
      )}
    </Pressable>
  );
}

function ClosedRow({
  list,
  match,
  isFirst,
  isLast,
  onPress,
  onLongPress,
}: {
  list: ListSummary;
  match?: string;
  isFirst: boolean;
  isLast: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const day = dateFromIso(list.closed_on ?? localIsoDate());
  const notes: string[] = [];
  let warn = false;
  const withReceipts = (list.receipts_count ?? 0) > 0;
  const missingAmounts = withReceipts ? (list.receipts_missing ?? 0) : (list.missing_prices ?? 0);
  if (missingAmounts > 0) {
    notes.push(
      withReceipts
        ? missingAmounts === 1
          ? '1 scontrino da completare'
          : `${missingAmounts} scontrini da completare`
        : missingAmounts === 1
          ? '1 prezzo da inserire'
          : `${missingAmounts} prezzi da inserire`,
    );
    warn = true;
  }
  if (toRefund(list)) {
    notes.push('da rimborsare');
    warn = true;
  }
  if (!warn) notes.push([list.shop, locationsLabel(listLocations(list))].filter(Boolean).join(' · '));
  if (match) notes.unshift(`contiene: ${match}`);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        isFirst && styles.first,
        isLast && styles.last,
        !isLast && styles.divider,
        pressed && { backgroundColor: colors.pressed },
      ]}
    >
      <View style={styles.date}>
        <Text style={styles.dateDay}>{day.getDate()}</Text>
        <Text style={styles.dateMonth}>{day.toLocaleDateString('it-IT', { month: 'short' })}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={type.body} numberOfLines={1}>
          {list.name}
        </Text>
        <Text style={[type.caption, warn && { color: colors.warn }]} numberOfLines={1}>
          {notes.join(' · ')}
        </Text>
      </View>
      <Text style={styles.amount}>{formatEuro(listTotal(list))}</Text>
    </Pressable>
  );
}
