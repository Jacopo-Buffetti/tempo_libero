import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { addMonths, dateOf, monthOf, monthRange, monthTitle, todayIso } from '@/lib/calendario';
import { useGenerateShifts, usePeople, useShifts } from '@/lib/turni';
import { errorMessage } from '@/lib/spesa';
import { useMembership } from '@/providers/AuthProvider';
import { Chip } from '@/components/Chip';
import { colors, type } from '@/theme/tokens';
import { styles } from '@/styles/screens/genera';

const PERIODS = [
  { months: 1, label: 'Solo questo mese' },
  { months: 3, label: '3 mesi' },
  { months: 6, label: '6 mesi' },
  { months: 0, label: 'Fino a fine anno' },
];

const longDate = (iso: string) =>
  dateOf(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

export default function GeneraTurni() {
  const params = useLocalSearchParams<{ month?: string }>();
  const membership = useMembership();
  const orgId = membership.data?.org_id;
  const today = todayIso();
  const month = params.month ?? monthOf(today);

  const [period, setPeriod] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const people = usePeople(orgId);
  const generate = useGenerateShifts(orgId);

  const monthStart = monthRange(month).from;
  const from = monthStart > today ? monthStart : today;
  const lastMonth = period === 0 ? `${month.slice(0, 4)}-12` : addMonths(month, period - 1);
  const to = monthRange(lastMonth).to;
  const existing = useShifts(orgId, from, to);
  const active = (people.data ?? []).filter((p) => p.active);
  const tooLate = from > to;

  function run() {
    setError(null);
    const doIt = () =>
      generate.mutate(
        { from, to },
        {
          onSuccess: (n) => {
            Alert.alert('Turni pronti', `${n} turni assegnati dal ${longDate(from)} al ${longDate(to)}.`, [
              { text: 'Ok', onPress: () => router.back() },
            ]);
          },
          onError: (e) => setError(errorMessage(e, 'Generazione non riuscita. Riprova.')),
        },
      );
    if (existing.data?.length) {
      Alert.alert(
        'Sostituire i turni?',
        `Nel periodo ci sono già ${existing.data.length} turni: verranno rifatti da capo, compresi i cambi fatti a mano.`,
        [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Rigenera', style: 'destructive', onPress: doIt },
        ],
      );
    } else {
      doIt();
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Annulla</Text>
        </Pressable>
        <Text style={type.heading}>Genera i turni</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.field}>
          <Text style={type.label}>Da {monthTitle(month)}</Text>
          <View style={styles.chips}>
            {PERIODS.map((p) => (
              <Chip
                key={p.months}
                label={p.label}
                variant="accent"
                active={period === p.months}
                onPress={() => setPeriod(p.months)}
              />
            ))}
          </View>
          {!tooLate && (
            <Text style={type.caption}>
              Dal {longDate(from)} al {longDate(to)}. I giorni già passati non vengono toccati.
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={type.body}>Come vengono divisi</Text>
          <Rule text="Tutti i giorni tranne il sabato" />
          <Rule text="Ogni consigliere fa 2 o 3 turni al mese, e nell’anno tutti lo stesso numero" />
          <Rule text="Venerdì e domenica girano tra tutti: tocca a chi ne ha fatti meno" />
          <Rule text="Mai due giorni di fila alla stessa persona" />
          <Text style={type.caption}>
            {active.length} consiglieri attivi. Si tiene conto dei turni già fatti quest’anno.
          </Text>
        </View>

        {existing.data && existing.data.length > 0 && (
          <Text style={styles.warn}>
            Nel periodo ci sono già {existing.data.length} turni: verranno sostituiti.
          </Text>
        )}
        {tooLate && <Text style={styles.warn}>Questo periodo è già passato.</Text>}
        {error && <Text style={styles.warn}>{error}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={run}
          disabled={generate.isPending || tooLate || active.length === 0}
          style={({ pressed }) => [
            styles.primary,
            (tooLate || active.length === 0) && styles.disabled,
            pressed && styles.primaryPressed,
          ]}
        >
          {generate.isPending ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.primaryText}>Genera</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Rule({ text }: { text: string }) {
  return (
    <View style={styles.rule}>
      <Ionicons name="checkmark-circle" size={18} color={colors.ok} />
      <Text style={styles.ruleText}>{text}</Text>
    </View>
  );
}
