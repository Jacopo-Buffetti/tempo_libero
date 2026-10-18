import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dateOf, todayIso } from '@/lib/calendario';
import { personLabel, useSavePerson, usePeople, useShifts } from '@/lib/turni';
import { errorMessage } from '@/lib/spesa';
import { useMembership } from '@/providers/AuthProvider';
import { colors, type } from '@/theme/tokens';
import { styles } from '@/styles/screens/consiglieri';

export default function Consiglieri() {
  const membership = useMembership();
  const orgId = membership.data?.org_id;
  const isAdmin = membership.data?.role === 'admin';
  const today = todayIso();
  const [year, setYear] = useState(Number(today.slice(0, 4)));

  const people = usePeople(orgId);
  const shifts = useShifts(orgId, `${year}-01-01`, `${year}-12-31`);
  const save = useSavePerson(orgId);

  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);

  const month = today.slice(0, 7);
  const stats = (people.data ?? []).map((p) => {
    const mine = (shifts.data ?? []).filter((s) => s.person_id === p.id);
    const day = (n: number) => mine.filter((s) => dateOf(s.shift_date).getDay() === n).length;
    return {
      person: p,
      total: mine.length,
      done: mine.filter((s) => s.shift_date <= today).length,
      fri: day(5),
      sun: day(0),
      month: mine.filter((s) => s.shift_date.startsWith(month)).length,
    };
  });

  function add() {
    if (!name.trim()) return;
    setError(null);
    save.mutate(
      { name, nickname: nickname || null, position: (people.data?.length ?? 0) + 1 },
      {
        onSuccess: () => {
          setName('');
          setNickname('');
        },
        onError: (e) => setError(errorMessage(e, 'Non sono riuscito ad aggiungerlo.')),
      },
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Calendario</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <Text style={type.title}>Consiglieri</Text>
          <View style={styles.year}>
            <Pressable onPress={() => setYear(year - 1)} hitSlop={8} accessibilityLabel="Anno precedente">
              <Ionicons name="chevron-back" size={20} color={colors.accent} />
            </Pressable>
            <Text style={styles.yearText}>{year}</Text>
            <Pressable onPress={() => setYear(year + 1)} hitSlop={8} accessibilityLabel="Anno successivo">
              <Ionicons name="chevron-forward" size={20} color={colors.accent} />
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <View style={[styles.row, styles.headRow]}>
            <Text style={[styles.head, styles.nameCol]}>Consigliere</Text>
            <Text style={styles.head}>Anno</Text>
            <Text style={styles.head}>Ven</Text>
            <Text style={styles.head}>Dom</Text>
            <Text style={styles.head}>Mese</Text>
          </View>
          {shifts.isLoading ? (
            <ActivityIndicator color={colors.accent} style={styles.loading} />
          ) : (
            stats.map((s, i) => (
              <View
                key={s.person.id}
                style={[
                  styles.row,
                  i < stats.length - 1 && styles.divider,
                  !s.person.active && styles.inactive,
                ]}
              >
                <View style={styles.nameCol}>
                  <Text style={type.body} numberOfLines={1}>
                    {personLabel(s.person)}
                  </Text>
                  <Text style={type.caption}>{s.done} fatti</Text>
                </View>
                <Text style={styles.num}>{s.total}</Text>
                <Text style={styles.num}>{s.fri}</Text>
                <Text style={styles.num}>{s.sun}</Text>
                <Text style={styles.num}>{s.month}</Text>
                {isAdmin && (
                  <Switch
                    value={s.person.active}
                    onValueChange={(v) => save.mutate({ id: s.person.id, active: v })}
                    trackColor={{ true: colors.accent, false: colors.segment }}
                    thumbColor={colors.onAccent}
                    accessibilityLabel={`${personLabel(s.person)} nei turni`}
                  />
                )}
              </View>
            ))
          )}
        </View>
        <Text style={type.caption}>
          “Mese” è il mese in corso.{' '}
          {isAdmin ? 'Con l’interruttore escludi un consigliere dai prossimi turni generati.' : ''}
        </Text>

        {isAdmin && (
          <View style={styles.card}>
            <View style={styles.addBox}>
              <Text style={type.body}>Aggiungi un consigliere</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Nome"
                placeholderTextColor={colors.placeholder}
                style={styles.input}
              />
              <TextInput
                value={nickname}
                onChangeText={setNickname}
                placeholder="Soprannome, se ci sono due nomi uguali"
                placeholderTextColor={colors.placeholder}
                style={styles.input}
              />
              <Pressable
                onPress={add}
                disabled={!name.trim() || save.isPending}
                style={({ pressed }) => [
                  styles.addButton,
                  !name.trim() && styles.disabled,
                  pressed && styles.addPressed,
                ]}
              >
                <Text style={styles.addText}>Aggiungi</Text>
              </Pressable>
            </View>
          </View>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}
