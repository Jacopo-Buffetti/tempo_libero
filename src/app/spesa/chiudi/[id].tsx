import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage, formatEuro, useCloseList, useList, useListItems, useRuns } from '@/lib/spesa';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/screens/spesa/chiudi';

export default function ChiudiLista() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const list = useList(id);
  const items = useListItems(id);
  const runs = useRuns(id);
  const close = useCloseList(id);

  const [carryOver, setCarryOver] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const all = items.data ?? [];
  const unassigned = all.filter((i) => i.checked && !i.run_id).length;
  const notTaken = all.filter((i) => !i.checked).length;
  const runList = runs.data ?? [];
  const total = runList.reduce((sum, r) => sum + r.total_cents, 0);
  const missing = runList.filter((r) => r.amount_missing).length;
  const toRefund = runList
    .filter((r) => r.paid_by === 'volontario' && !r.reimbursed)
    .reduce((sum, r) => sum + r.total_cents, 0);

  const canClose = !close.isPending && unassigned === 0 && runList.length > 0;

  function submit() {
    setError(null);
    close.mutate(
      { carryOver },
      {
        onSuccess: () => router.back(),
        onError: (e) => setError(errorMessage(e, 'La lista non è stata chiusa. Riprova.')),
      },
    );
  }

  if (items.isLoading || list.isLoading || runs.isLoading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Lista</Text>
        </Pressable>
        <Text style={type.heading}>Chiudi la lista</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={type.caption}>
          {list.data?.name}. La lista finisce nello storico con i suoi pagamenti. Gli importi mancanti e i rimborsi
          si possono completare anche dopo.
        </Text>

        {unassigned > 0 && (
          <View style={styles.carry}>
            <Ionicons name="alert-circle-outline" size={22} color={colors.warn} />
            <View style={styles.flex}>
              <Text style={type.body}>
                {unassigned === 1
                  ? '1 articolo comprato senza pagamento'
                  : `${unassigned} articoli comprati senza pagamento`}
              </Text>
              <Text style={type.caption}>Prima di chiudere va indicato chi li ha pagati.</Text>
            </View>
            <Pressable
              onPress={() => router.replace({ pathname: '/spesa/pagamento', params: { listId: id } })}
              hitSlop={8}
            >
              <Text style={styles.backText}>Aggiungi</Text>
            </Pressable>
          </View>
        )}

        {runList.length === 0 && unassigned === 0 && (
          <Text style={[type.body, styles.empty]}>
            Non c’è niente da chiudere: spunta quello che hai comprato e aggiungi un pagamento.
          </Text>
        )}

        {runList.length > 0 && (
          <View style={styles.card}>
            <View style={[styles.line, styles.divider]}>
              <Text style={[type.body, styles.flex]}>
                {runList.length} {runList.length === 1 ? 'pagamento' : 'pagamenti'}
              </Text>
              <Text style={type.body}>{formatEuro(total)}</Text>
            </View>
            {missing > 0 && (
              <View style={[styles.line, styles.divider]}>
                <Text style={[type.caption, styles.flex, { color: colors.warn }]}>
                  {missing === 1 ? '1 importo da inserire' : `${missing} importi da inserire`}
                </Text>
              </View>
            )}
            <View style={styles.line}>
              <Text style={[type.caption, styles.flex]}>Da rimborsare</Text>
              <Text style={[type.caption, toRefund > 0 && { color: colors.warn }]}>{formatEuro(toRefund)}</Text>
            </View>
          </View>
        )}

        {notTaken > 0 && (
          <View style={styles.carry}>
            <View style={styles.flex}>
              <Text style={type.body}>
                {notTaken === 1 ? '1 voce non presa' : `${notTaken} voci non prese`}
              </Text>
              <Text style={type.caption}>
                {carryOver ? 'Andranno in una nuova lista, da finire' : 'Verranno tolte, la lista si chiude così'}
              </Text>
            </View>
            <Switch
              value={carryOver}
              onValueChange={setCarryOver}
              trackColor={{ true: colors.accent, false: colors.segment }}
              thumbColor={colors.onAccent}
            />
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={submit}
          disabled={!canClose}
          style={({ pressed }) => [styles.saveButton, !canClose && styles.saveDisabled, pressed && { opacity: 0.85 }]}
        >
          {close.isPending ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.saveText}>Chiudi la lista</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
