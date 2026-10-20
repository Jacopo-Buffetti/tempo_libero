import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  errorMessage,
  formatEuro,
  refundPersonKey,
  runDateLabel,
  useRefunds,
  useSetPaymentsReimbursed,
  type Refund,
} from '@/lib/spesa';
import { useAuth, useMembership } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/screens/spesa/rimborsi';

type Group = { key: string; name: string; total: number; missing: number; payments: Refund[] };

export default function Rimborsi() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const { session } = useAuth();
  const membership = useMembership();
  const refunds = useRefunds(membership.data?.org_id);
  const reimburse = useSetPaymentsReimbursed();
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const byKey = new Map<string, Group>();
    (refunds.data ?? []).forEach((r) => {
      const key = refundPersonKey(r);
      const mine = !!r.paid_by_user && r.paid_by_user === session?.user.id;
      const group = byKey.get(key) ?? {
        key,
        name: mine ? 'Tu' : (r.paid_by_name ?? 'Senza nome'),
        total: 0,
        missing: 0,
        payments: [],
      };
      group.total += r.amount_cents ?? 0;
      if (r.amount_cents == null) group.missing += 1;
      group.payments.push(r);
      byKey.set(key, group);
    });
    return [...byKey.values()].sort((a, b) => b.total - a.total);
  }, [refunds.data, session?.user.id]);

  const total = groups.reduce((sum, g) => sum + g.total, 0);

  function markAll(group: Group) {
    const count = group.payments.length;
    const missingNote = group.missing
      ? `\n\nAttenzione: ${group.missing === 1 ? 'un pagamento non ha' : `${group.missing} pagamenti non hanno`} ancora l’importo.`
      : '';
    Alert.alert(
      'Segnare come rimborsato?',
      `${group.name}: ${count} ${count === 1 ? 'pagamento' : 'pagamenti'} per ${formatEuro(group.total)}.${missingNote}`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Rimborsato',
          onPress: () => {
            setError(null);
            reimburse.mutate(
              { ids: group.payments.map((p) => p.id), value: true },
              { onError: (e) => setError(errorMessage(e, 'Non sono riuscito a segnarlo. Riprova.')) },
            );
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Liste</Text>
        </Pressable>
        <Text style={type.heading}>Da rimborsare</Text>
        <View style={styles.back} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refunds.isRefetching} onRefresh={refunds.refetch} tintColor={colors.accent} />
        }
      >
        {refunds.isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : refunds.isError ? (
          <Text style={styles.error}>{errorMessage(refunds.error, 'Non riesco a caricare i rimborsi.')}</Text>
        ) : groups.length === 0 ? (
          <Text style={[type.body, styles.empty]}>Nessun rimborso in sospeso.</Text>
        ) : (
          <>
            <View style={styles.summary}>
              <Text style={type.label}>
                {groups.length} {groups.length === 1 ? 'persona' : 'persone'} da rimborsare
              </Text>
              <Text style={styles.total}>{formatEuro(total)}</Text>
            </View>

            {groups.map((g) => {
              const expanded = open === g.key;
              return (
                <View key={g.key} style={styles.card}>
                  <Pressable
                    onPress={() => setOpen(expanded ? null : g.key)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    style={({ pressed }) => [styles.head, pressed && styles.headPressed]}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{g.name.trim().charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={type.body} numberOfLines={1}>
                        {g.name}
                      </Text>
                      <Text style={type.caption}>
                        {g.payments.length} {g.payments.length === 1 ? 'pagamento' : 'pagamenti'}
                        {g.missing ? ` · ${g.missing} senza importo` : ''}
                      </Text>
                    </View>
                    <Text style={styles.amount}>{formatEuro(g.total)}</Text>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
                  </Pressable>

                  {expanded && (
                    <>
                      {g.payments.map((p) => (
                        <Pressable
                          key={p.id}
                          onPress={() => router.push({ pathname: '/spesa/[id]', params: { id: p.list_id } })}
                          style={({ pressed }) => [styles.line, pressed && styles.linePressed]}
                        >
                          <View style={styles.flex}>
                            <Text style={type.body} numberOfLines={1}>
                              {p.shopping_lists?.name ?? 'Lista'}
                            </Text>
                            <Text style={type.caption} numberOfLines={1}>
                              {[runDateLabel(p.run_date), p.shop].filter(Boolean).join(' · ')}
                            </Text>
                          </View>
                          {p.amount_cents == null ? (
                            <Text style={styles.missing}>da inserire</Text>
                          ) : (
                            <Text style={styles.lineAmount}>{formatEuro(p.amount_cents)}</Text>
                          )}
                        </Pressable>
                      ))}
                      <Pressable
                        onPress={() => markAll(g)}
                        disabled={reimburse.isPending}
                        style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
                      >
                        <Text style={styles.actionText}>Segna tutto rimborsato</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              );
            })}
            {error && <Text style={styles.error}>{error}</Text>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
