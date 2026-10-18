import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dayTitle, monthOf, monthRange, weekdayShort, dateOf } from '@/lib/calendario';
import {
  isHardDay,
  personLabel,
  personShort,
  useAssignShift,
  usePeople,
  useShifts,
  useSwapShifts,
} from '@/lib/turni';
import { errorMessage } from '@/lib/spesa';
import { useMembership } from '@/providers/AuthProvider';
import { colors, type } from '@/theme/tokens';
import { styles } from '@/styles/screens/turno';

type Tab = 'cambia' | 'scambia';

export default function Turno() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const membership = useMembership();
  const orgId = membership.data?.org_id;
  const { from, to } = monthRange(monthOf(date));

  const people = usePeople(orgId);
  const shifts = useShifts(orgId, from, to);
  const assign = useAssignShift(orgId);
  const swap = useSwapShifts();
  const [tab, setTab] = useState<Tab>('cambia');
  const [error, setError] = useState<string | null>(null);

  const personById = new Map((people.data ?? []).map((p) => [p.id, p]));
  const current = (shifts.data ?? []).find((s) => s.shift_date === date);
  const monthCount = new Map<string, number>();
  (shifts.data ?? []).forEach((s) => monthCount.set(s.person_id, (monthCount.get(s.person_id) ?? 0) + 1));
  const others = (shifts.data ?? []).filter(
    (s) => s.shift_date !== date && s.person_id !== current?.person_id,
  );

  const done = {
    onSuccess: () => router.back(),
    onError: (e: unknown) => setError(errorMessage(e, 'Modifica non salvata. Riprova.')),
  };

  function choose(personId: string) {
    if (personId === current?.person_id) return;
    assign.mutate({ date, personId }, done);
  }

  function swapWith(otherId: string, otherDate: string, otherPerson: string) {
    if (!current) return;
    Alert.alert(
      'Scambiare i turni?',
      `${personShort(personById.get(current.person_id))} fa il ${dayTitle(otherDate).toLowerCase()} e ${personShort(personById.get(otherPerson))} fa il ${dayTitle(date).toLowerCase()}.`,
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Scambia', onPress: () => swap.mutate({ first: current.id, second: otherId }, done) },
      ],
    );
  }

  const busy = assign.isPending || swap.isPending;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Calendario</Text>
        </Pressable>
        {busy && <ActivityIndicator color={colors.accent} />}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={type.label}>{dayTitle(date)}</Text>
          <Text style={type.title}>
            {current ? personLabel(personById.get(current.person_id)) : 'Nessun turno'}
          </Text>
          {isHardDay(date) && <Text style={styles.hard}>Venerdì e domenica girano tra tutti</Text>}
        </View>

        {current && (
          <View style={styles.segment}>
            {(
              [
                { value: 'cambia', label: 'Cambia persona' },
                { value: 'scambia', label: 'Scambia con un giorno' },
              ] as const
            ).map((t) => (
              <Pressable
                key={t.value}
                onPress={() => setTab(t.value)}
                style={[styles.segmentItem, tab === t.value && styles.segmentItemActive]}
              >
                <Text style={[styles.segmentText, tab === t.value && styles.segmentTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {(tab === 'cambia' || !current) && (
          <View style={styles.card}>
            {(people.data ?? [])
              .filter((p) => p.active)
              .map((p, i, all) => {
                const active = p.id === current?.person_id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => choose(p.id)}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.row,
                      i < all.length - 1 && styles.divider,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <Text style={[type.body, styles.flex]}>{personLabel(p)}</Text>
                    <Text style={type.caption}>{monthCount.get(p.id) ?? 0} nel mese</Text>
                    {active && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
                  </Pressable>
                );
              })}
          </View>
        )}

        {tab === 'scambia' && current && (
          <View style={styles.card}>
            {others.length === 0 ? (
              <Text style={[type.caption, styles.empty]}>Non ci sono altri turni in questo mese.</Text>
            ) : (
              others.map((s, i) => (
                <Pressable
                  key={s.id}
                  onPress={() => swapWith(s.id, s.shift_date, s.person_id)}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.row,
                    i < others.length - 1 && styles.divider,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View style={[styles.dateBox, isHardDay(s.shift_date) && styles.dateBoxHard]}>
                    <Text style={styles.dateDay}>{dateOf(s.shift_date).getDate()}</Text>
                    <Text style={styles.dateWeek}>{weekdayShort(s.shift_date)}</Text>
                  </View>
                  <Text style={[type.body, styles.flex]}>{personLabel(personById.get(s.person_id))}</Text>
                  <Ionicons name="swap-horizontal" size={20} color={colors.accent} />
                </Pressable>
              ))
            )}
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}
