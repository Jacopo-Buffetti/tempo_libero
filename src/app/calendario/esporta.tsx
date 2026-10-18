import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { addMonths, monthOf, monthRange, monthTitle, todayIso } from '@/lib/calendario';
import { personLabel, shareIcs, usePeople, useShifts } from '@/lib/turni';
import { useMembership } from '@/providers/AuthProvider';
import { Chip } from '@/components/Chip';
import { colors, type } from '@/theme/tokens';
import { styles } from '@/styles/screens/esporta';

const PERIODS = [
  { months: 1, label: 'Solo questo mese' },
  { months: 3, label: '3 mesi' },
  { months: 6, label: '6 mesi' },
];

export default function EsportaTurni() {
  const params = useLocalSearchParams<{ month?: string }>();
  const month = params.month ?? monthOf(todayIso());
  const membership = useMembership();
  const orgId = membership.data?.org_id;

  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const from = monthRange(month).from;
  const to = monthRange(addMonths(month, months - 1)).to;
  const people = usePeople(orgId);
  const shifts = useShifts(orgId, from, to);
  const list = shifts.data ?? [];

  async function share(key: string, personId?: string) {
    setError(null);
    setBusy(key);
    try {
      await shareIcs(month, months, list, people.data ?? [], personId);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Non riesco a creare il file. Riprova.');
    } finally {
      setBusy(null);
    }
  }

  const period =
    months === 1 ? monthTitle(month) : `${monthTitle(month)} – ${monthTitle(addMonths(month, months - 1))}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Calendario</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={type.title}>Turni nel calendario del telefono</Text>
          <Text style={type.caption}>
            Crea un file .ics da mandare su WhatsApp: aprendolo, i turni finiscono nel calendario del
            telefono. Con un consigliere solo, ci sono solo i suoi turni e un promemoria la sera prima.
          </Text>
        </View>

        <View style={styles.chips}>
          {PERIODS.map((p) => (
            <Chip
              key={p.months}
              label={p.label}
              variant="accent"
              active={months === p.months}
              onPress={() => setMonths(p.months)}
            />
          ))}
        </View>
        <Text style={type.label}>{period}</Text>

        {shifts.isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : list.length === 0 ? (
          <Text style={styles.warn}>Nel periodo non ci sono turni: generali prima dal calendario.</Text>
        ) : (
          <>
            <Pressable
              onPress={() => share('tutti')}
              disabled={busy !== null}
              style={({ pressed }) => [styles.all, pressed && styles.allPressed]}
            >
              <Ionicons name="calendar" size={22} color={colors.onAccent} />
              <View style={styles.flex}>
                <Text style={styles.allTitle}>Tutti i turni</Text>
                <Text style={styles.allCaption}>{list.length} giorni, con il nome di chi è di turno</Text>
              </View>
              {busy === 'tutti' ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Ionicons name="share-outline" size={20} color={colors.onAccent} />
              )}
            </Pressable>

            <View style={styles.card}>
              {(people.data ?? [])
                .filter((p) => list.some((s) => s.person_id === p.id))
                .map((p, i, all) => {
                  const count = list.filter((s) => s.person_id === p.id).length;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => share(p.id, p.id)}
                      disabled={busy !== null}
                      style={({ pressed }) => [
                        styles.row,
                        i < all.length - 1 && styles.divider,
                        pressed && styles.rowPressed,
                      ]}
                    >
                      <View style={styles.flex}>
                        <Text style={type.body}>{personLabel(p)}</Text>
                        <Text style={type.caption}>
                          {count} {count === 1 ? 'turno' : 'turni'}
                        </Text>
                      </View>
                      {busy === p.id ? (
                        <ActivityIndicator color={colors.accent} />
                      ) : (
                        <Ionicons name="share-outline" size={20} color={colors.accent} />
                      )}
                    </Pressable>
                  );
                })}
            </View>
          </>
        )}

        {error && <Text style={styles.warn}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}
