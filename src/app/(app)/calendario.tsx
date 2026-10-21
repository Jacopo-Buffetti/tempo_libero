import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dayTitle, monthOf, monthRange, monthTitle, todayIso } from '@/lib/calendario';
import {
  isClosedDay,
  isHardDay,
  personLabel,
  personShort,
  shareMonth,
  usePeople,
  useShifts,
} from '@/lib/turni';
import {
  SPACES,
  clientName,
  daysOf,
  paymentState,
  periodLabel,
  spaceShort,
  timeRange,
  useRentals,
  type Rental,
  type Space,
} from '@/lib/affitti';
import { formatEuro } from '@/lib/spesa';
import { useMembership } from '@/providers/AuthProvider';
import { Chip } from '@/components/Chip';
import { MonthGrid } from '@/components/calendario/MonthGrid';
import { useTheme, type ThemeColors } from '@/theme/tokens';
import { useStyles } from '@/styles/screens/calendario';

type Mode = 'turni' | 'affitti';

const spaceColor = (space: Space, colors: ThemeColors) => (space === 'stanza' ? colors.accent : colors.sun);

export default function Calendario() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const membership = useMembership();
  const orgId = membership.data?.org_id;

  const [mode, setMode] = useState<Mode>('turni');
  const [month, setMonth] = useState(monthOf(todayIso()));
  const [selected, setSelected] = useState<string>(todayIso());
  const [space, setSpace] = useState<Space | 'tutti'>('tutti');
  const { from, to } = monthRange(month);

  const people = usePeople(orgId);
  const shifts = useShifts(orgId, from, to);
  const rentals = useRentals(orgId, from, to);

  const personById = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p])), [people.data]);
  const shiftByDate = useMemo(
    () => new Map((shifts.data ?? []).map((s) => [s.shift_date, s])),
    [shifts.data],
  );
  const visibleRentals = (rentals.data ?? []).filter((r) => space === 'tutti' || r.space === space);
  const rentalsByDate = useMemo(() => {
    const map = new Map<string, Rental[]>();
    visibleRentals.forEach((r) => daysOf(r).forEach((day) => map.set(day, [...(map.get(day) ?? []), r])));
    return map;
  }, [visibleRentals]);

  function changeMonth(next: string) {
    setMonth(next);
    setSelected(next === monthOf(todayIso()) ? todayIso() : `${next}-01`);
  }

  const shortOf = (iso: string) => {
    const person = personById.get(shiftByDate.get(iso)?.person_id ?? '');
    return person ? personShort(person) : undefined;
  };

  const dayShift = shiftByDate.get(selected);
  const dayRentals = rentalsByDate.get(selected) ?? [];
  const monthDue = visibleRentals.reduce((sum, r) => sum + paymentState(r).due, 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={type.title}>Calendario</Text>
          {mode === 'turni' ? (
            <View style={styles.actions}>
              <Pressable
                onPress={() =>
                  shareMonth(month, shifts.data ?? [], people.data ?? []).catch(() =>
                    Alert.alert('Condivisione non riuscita', 'Riprova tra poco.'),
                  )
                }
                disabled={!shifts.data?.length}
                accessibilityLabel="Condividi i turni del mese"
                style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              >
                <Ionicons name="logo-whatsapp" size={20} color={colors.accent} />
              </Pressable>
              <Pressable
                onPress={() => router.push({ pathname: '/calendario/esporta', params: { month } })}
                accessibilityLabel="Turni nel calendario del telefono"
                style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              >
                <Ionicons name="calendar-number-outline" size={20} color={colors.accent} />
              </Pressable>
              <Pressable
                onPress={() => router.push('/calendario/consiglieri')}
                accessibilityLabel="Consiglieri e conteggi"
                style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              >
                <Ionicons name="people-outline" size={20} color={colors.accent} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => router.push('/calendario/clienti')}
              style={({ pressed }) => [styles.textButton, pressed && styles.iconButtonPressed]}
            >
              <Ionicons name="book-outline" size={18} color={colors.accent} />
              <Text style={styles.textButtonText}>Rubrica</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.segment}>
          {(
            [
              { value: 'turni', label: 'Turni del circolo' },
              { value: 'affitti', label: 'Affitti' },
            ] as const
          ).map((m) => (
            <Pressable
              key={m.value}
              onPress={() => setMode(m.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m.value }}
              style={[styles.segmentItem, mode === m.value && styles.segmentItemActive]}
            >
              <Text style={[styles.segmentText, mode === m.value && styles.segmentTextActive]}>
                {m.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === 'affitti' && (
          <View style={styles.chips}>
            <Chip label="Tutti" active={space === 'tutti'} onPress={() => setSpace('tutti')} />
            {SPACES.map((s) => (
              <Chip
                key={s.value}
                label={s.label}
                active={space === s.value}
                onPress={() => setSpace(s.value)}
              />
            ))}
          </View>
        )}

        <MonthGrid
          month={month}
          onMonthChange={changeMonth}
          selected={selected}
          onSelect={setSelected}
          info={(iso) =>
            mode === 'turni'
              ? isClosedDay(iso)
                ? { muted: true, label: 'chiuso' }
                : { label: shortOf(iso), highlight: isHardDay(iso) }
              : { dots: (rentalsByDate.get(iso) ?? []).map((r) => spaceColor(r.space, colors)) }
          }
        />

        {mode === 'turni' && (
          <>
            <View style={styles.dayCard}>
              <Text style={type.label}>{dayTitle(selected)}</Text>
              {isClosedDay(selected) ? (
                <Text style={type.body}>Il sabato il circolo è chiuso.</Text>
              ) : shifts.isLoading ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <View style={styles.dayRow}>
                  <View style={styles.avatar}>
                    <Ionicons name="person" size={20} color={colors.accent} />
                  </View>
                  <Text style={[styles.dayName, !dayShift && styles.dayEmpty]}>
                    {dayShift ? personLabel(personById.get(dayShift.person_id)) : 'Nessun turno assegnato'}
                  </Text>
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: '/calendario/turno/[date]', params: { date: selected } })
                    }
                    style={({ pressed }) => [styles.smallButton, pressed && styles.iconButtonPressed]}
                  >
                    <Text style={styles.smallButtonText}>{dayShift ? 'Cambia' : 'Assegna'}</Text>
                  </Pressable>
                </View>
              )}
            </View>

            <Pressable
              onPress={() => router.push({ pathname: '/calendario/genera', params: { month } })}
              style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
            >
              <Ionicons name="sparkles-outline" size={18} color={colors.onAccent} />
              <Text style={styles.primaryText}>
                {shifts.data?.length ? 'Rigenera i turni' : 'Genera i turni'}
              </Text>
            </Pressable>
            <Text style={[type.caption, styles.center]}>
              In giallo venerdì e domeniche: girano tra tutti i consiglieri.
            </Text>
          </>
        )}

        {mode === 'affitti' && (
          <>
            <View style={styles.dayCard}>
              <View style={styles.dayHead}>
                <Text style={type.label}>{dayTitle(selected)}</Text>
                <Pressable
                  onPress={() => router.push({ pathname: '/calendario/affitto', params: { date: selected } })}
                  style={({ pressed }) => [styles.smallButton, pressed && styles.iconButtonPressed]}
                >
                  <Text style={styles.smallButtonText}>+ Affitto</Text>
                </Pressable>
              </View>
              {dayRentals.length === 0 ? (
                <Text style={type.caption}>Nessun affitto in questo giorno.</Text>
              ) : (
                dayRentals.map((r) => <RentalRow key={r.id} rental={r} />)
              )}
            </View>

            {visibleRentals.length > 0 && (
              <View style={[styles.dayCard, styles.dayHead]}>
                <Text style={type.label}>
                  {monthTitle(month)} · {visibleRentals.length} {visibleRentals.length === 1 ? 'affitto' : 'affitti'}
                </Text>
                {monthDue > 0 ? (
                  <Text style={styles.due}>Da incassare {formatEuro(monthDue)}</Text>
                ) : (
                  <Text style={type.caption}>Tutto incassato</Text>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function RentalRow({ rental }: { rental: Rental }) {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const pay = paymentState(rental);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/calendario/affitto', params: { id: rental.id } })}
      style={({ pressed }) => [styles.rental, pressed && styles.rentalPressed]}
    >
      <View style={[styles.spaceBar, { backgroundColor: spaceColor(rental.space, colors) }]} />
      <View style={styles.flex}>
        <Text style={type.body} numberOfLines={1}>
          {clientName(rental.clients)}
        </Text>
        <Text style={type.caption} numberOfLines={1}>
          {spaceShort(rental.space)} ·{' '}
          {rental.rent_date !== rental.end_date ? periodLabel(rental) : timeRange(rental)}
        </Text>
        <Text style={[styles.payment, pay.warn && styles.paymentWarn]}>{pay.label}</Text>
      </View>
      <Text style={styles.price}>{rental.price_cents != null ? formatEuro(rental.price_cents) : ''}</Text>
    </Pressable>
  );
}
