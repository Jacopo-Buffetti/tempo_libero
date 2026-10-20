import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  dateFromIso,
  formatEuro,
  listLocations,
  locationsLabel,
  useListItems,
  usePayerLabel,
  useRuns,
  type ListSummary,
} from '@/lib/spesa';
import { useAuth, useMembership } from '@/providers/AuthProvider';
import { closedListText, shareAnywhere, shareOnWhatsApp } from '@/lib/condividiLista';
import { RunCard } from '@/components/spesa/RunCard';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/components/listaChiusa';

const shortDate = (iso: string) =>
  dateFromIso(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });

export function ListaChiusa({ list }: { list: ListSummary }) {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const { session } = useAuth();
  const membership = useMembership();
  const orgId = membership.data?.org_id;
  const listId = list.id!;

  const items = useListItems(listId);
  const runs = useRuns(listId);
  const payerLabel = usePayerLabel(orgId, session?.user.id);

  const runList = runs.data ?? [];
  const bought = (items.data ?? []).filter((i) => i.checked);
  const total = runList.reduce((sum, r) => sum + r.total_cents, 0);
  const toRefund = runList
    .filter((r) => r.paid_by === 'volontario' && !r.reimbursed)
    .reduce((sum, r) => sum + r.total_cents, 0);
  const warnings = runList.filter((r) => r.amount_missing).length;

  const first = runList[0]?.run_date;
  const last = runList[runList.length - 1]?.run_date;
  const period =
    first && last
      ? first === last
        ? shortDate(first)
        : `dal ${shortDate(first)} al ${shortDate(last)}`
      : '';

  const shareText = () =>
    closedListText(
      { name: list.name!, locations: listLocations(list) },
      runList.map((run) => ({
        run,
        payer: payerLabel(run),
        items: bought.filter((i) => i.run_id === run.id),
      })),
    );

  function share() {
    shareOnWhatsApp(shareText()).catch(() => undefined);
  }

  function shareElsewhere() {
    shareAnywhere(shareText()).catch(() => undefined);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Liste</Text>
        </Pressable>
        <View style={styles.actions}>
          <Pressable
            onPress={share}
            onLongPress={shareElsewhere}
            hitSlop={6}
            accessibilityLabel="Condividi il resoconto su WhatsApp"
            accessibilityHint="Tieni premuto per scegliere un'altra app"
            style={({ pressed }) => [styles.whatsapp, pressed && styles.whatsappPressed]}
          >
            <Ionicons name="logo-whatsapp" size={20} color={colors.onAccent} />
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/spesa/modifica/[id]', params: { id: listId } })}
            style={styles.back}
            hitSlop={8}
            accessibilityLabel="Modifica o elimina la lista"
          >
            <Ionicons name="create-outline" size={20} color={colors.accent} />
            <Text style={styles.backText}>Modifica</Text>
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={type.title}>{list.name}</Text>
            <Text style={type.caption}>
              {[period, locationsLabel(listLocations(list))].filter(Boolean).join(' · ')}
            </Text>
          </View>

          <View style={styles.totalCard}>
            <View style={styles.flex}>
              <Text style={type.label}>
                Totale · {runList.length} {runList.length === 1 ? 'pagamento' : 'pagamenti'}
              </Text>
              {warnings > 0 && (
                <Text style={[type.caption, styles.warnText]}>
                  {warnings === 1 ? '1 importo da inserire' : `${warnings} importi da inserire`}
                </Text>
              )}
              {toRefund > 0 && (
                <Text style={[type.caption, styles.warnText]}>Da rimborsare: {formatEuro(toRefund)}</Text>
              )}
            </View>
            <Text style={styles.total}>{formatEuro(total)}</Text>
          </View>

          <View style={styles.runs}>
            {runList.map((run, index) => (
              <RunCard
                key={run.id}
                run={run}
                index={index}
                listId={listId}
                orgId={orgId}
                items={bought.filter((i) => i.run_id === run.id)}
                payerName={payerLabel(run)}
                initiallyOpen={runList.length === 1}
              />
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
