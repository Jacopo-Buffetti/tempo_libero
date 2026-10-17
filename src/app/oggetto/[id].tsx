import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  ITEM_COLUMNS,
  available,
  isLow,
  itemsKeys,
  kindLabel,
  locationLabel,
  movementsKeys,
  useAdjustBroken,
  useAdjustQuantity,
  type Item,
} from '@/lib/items';
import { useAuth, useMembership } from '@/providers/AuthProvider';
import { Stepper } from '@/components/Stepper';
import { colors, font, radius, space, touch, type } from '@/theme/tokens';

type Movement = {
  id: number;
  delta: number;
  broken_delta: number;
  user_id: string | null;
  created_at: string;
};

export default function DettaglioOggetto() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const membership = useMembership();
  const orgId = membership.data?.org_id;

  const adjust = useAdjustQuantity();
  const broken = useAdjustBroken();
  const [count, setCount] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const item = useQuery({
    queryKey: itemsKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('items')
        .select(ITEM_COLUMNS)
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const movements = useQuery({
    queryKey: movementsKeys.item(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('item_movements')
        .select('id, delta, broken_delta, user_id, created_at')
        .eq('item_id', id!)
        .order('created_at', { ascending: false })
        .limit(15);
      if (error) throw error;
      return data as Movement[];
    },
  });

  // Nomi dei volontari, per dire chi ha fatto cosa
  const members = useQuery({
    queryKey: ['members', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('members')
        .select('user_id, display_name')
        .eq('org_id', orgId!);
      if (error) throw error;
      return data;
    },
  });

  const names = useMemo(() => {
    const map = new Map<string, string>();
    members.data?.forEach((m) => m.display_name && map.set(m.user_id, m.display_name));
    return map;
  }, [members.data]);

  if (item.isLoading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (!item.data) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <Text style={type.heading}>Oggetto non trovato</Text>
        <Text style={[type.caption, styles.centerText]}>
          Potrebbe essere stato eliminato da un altro volontario.
        </Text>
        <Pressable onPress={() => router.back()} style={styles.linkButton}>
          <Text style={styles.link}>Torna indietro</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const it: Item = item.data;
  const isEquipment = it.kind === 'attrezzatura';
  const free = available(it);
  const low = isLow(it);

  function moveBroken(delta: number) {
    setError(null);
    broken.mutate(
      { id: it.id, delta },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setCount(1);
        },
        onError: () => setError('Operazione non riuscita. Controlla la connessione e riprova.'),
      },
    );
  }

  function who(userId: string | null) {
    if (!userId) return 'Utente rimosso';
    if (userId === session?.user.id) return 'Tu';
    return names.get(userId) ?? 'Un volontario';
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-down" size={22} color={colors.accent} />
          <Text style={styles.backText}>Chiudi</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={type.title}>{it.name}</Text>
          <View style={styles.tags}>
            <Text style={styles.tag}>{locationLabel(it.location)}</Text>
            <Text style={styles.tag}>{kindLabel(it.kind)}</Text>
            <Text style={styles.tag}>{it.unit}</Text>
          </View>
        </View>

        {/* Riepilogo */}
        <View style={styles.summary}>
          {isEquipment ? (
            <>
              <Stat label="Totale" value={it.qty} />
              <Stat label="Disponibili" value={free} />
              <Stat label="Da riparare" value={it.broken_qty} alert={it.broken_qty > 0} />
            </>
          ) : (
            <>
              <Stat label="Quantità" value={it.qty} alert={low} />
              <Stat label="Scorta minima" value={it.min_qty ?? 0} />
              <Stat label="Stato" text={low ? 'Da comprare' : 'Ok'} alert={low} />
            </>
          )}
        </View>

        {/* Totale */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.flex}>
              <Text style={type.body}>{isEquipment ? 'Totale pezzi' : 'Quantità'}</Text>
              <Text style={type.caption}>
                {isEquipment ? 'Pezzi acquistati o persi' : 'Usati o comprati'}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                adjust.mutate({ id: it.id, delta: -1 });
              }}
              disabled={it.qty <= it.broken_qty}
              accessibilityLabel="Togli uno"
              style={({ pressed }) => [
                styles.step,
                it.qty <= it.broken_qty && styles.disabled,
                pressed && styles.stepPressed,
              ]}
            >
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <Text style={styles.qty}>{it.qty}</Text>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                adjust.mutate({ id: it.id, delta: 1 });
              }}
              accessibilityLabel="Aggiungi uno"
              style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
            >
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
        </View>

        {/* Riparazioni: solo attrezzatura */}
        {isEquipment && (
          <View style={styles.card}>
            <View style={[styles.cardRow, styles.cardDivider]}>
              <View style={styles.flex}>
                <Text style={type.body}>Riparazioni</Text>
                <Text style={type.caption}>Quanti pezzi spostare</Text>
              </View>
              <Stepper
                label="Pezzi da spostare"
                value={count}
                onChange={setCount}
                min={1}
                max={Math.max(1, it.qty)}
              />
            </View>

            <View style={styles.actions}>
              <Pressable
                onPress={() => moveBroken(count)}
                disabled={free < count || broken.isPending}
                style={({ pressed }) => [
                  styles.action,
                  styles.actionWarn,
                  (free < count || broken.isPending) && styles.disabled,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="construct-outline" size={20} color={colors.warn} />
                <Text style={[styles.actionText, { color: colors.warn }]}>Da riparare</Text>
                <Text style={styles.actionHint}>{free} disponibili</Text>
              </Pressable>

              <Pressable
                onPress={() => moveBroken(-count)}
                disabled={it.broken_qty < count || broken.isPending}
                style={({ pressed }) => [
                  styles.action,
                  styles.actionOk,
                  (it.broken_qty < count || broken.isPending) && styles.disabled,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.ok} />
                <Text style={[styles.actionText, { color: colors.ok }]}>Riparati</Text>
                <Text style={styles.actionHint}>{it.broken_qty} da riparare</Text>
              </Pressable>
            </View>
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        {/* Storico */}
        <View style={styles.history}>
          <Text style={type.label}>Ultimi movimenti</Text>
          <View style={styles.card}>
            {movements.isLoading ? (
              <ActivityIndicator color={colors.accent} style={{ padding: space(5) }} />
            ) : !movements.data?.length ? (
              <Text style={[type.caption, { padding: space(4) }]}>
                Ancora nessun movimento registrato.
              </Text>
            ) : (
              movements.data.map((m, i) => (
                <View
                  key={m.id}
                  style={[
                    styles.historyRow,
                    i < movements.data!.length - 1 && styles.cardDivider,
                  ]}
                >
                  <Text style={[type.body, styles.flex]}>{describe(m)}</Text>
                  <View style={styles.historyMeta}>
                    <Text style={styles.historyWho}>{who(m.user_id)}</Text>
                    <Text style={type.caption}>{formatWhen(m.created_at)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  label,
  value,
  text,
  alert,
}: {
  label: string;
  value?: number;
  text?: string;
  alert?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text style={type.caption}>{label}</Text>
      <Text style={[styles.statValue, alert && { color: colors.warn }, text ? styles.statText : null]}>
        {text ?? value}
      </Text>
    </View>
  );
}

function describe(m: Movement) {
  if (m.broken_delta > 0) return `${m.broken_delta} da riparare`;
  if (m.broken_delta < 0) {
    const n = -m.broken_delta;
    return `${n} ${n === 1 ? 'riparato' : 'riparati'}`;
  }
  if (m.delta > 0) return `+${m.delta} ${m.delta === 1 ? 'aggiunto' : 'aggiunti'}`;
  const n = -m.delta;
  return `−${n} ${n === 1 ? 'tolto' : 'tolti'}`;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `oggi ${time}`;
  return `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} ${time}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { alignItems: 'center', justifyContent: 'center', padding: space(8), gap: space(2) },
  centerText: { textAlign: 'center' },
  flex: { flex: 1 },

  topBar: { paddingHorizontal: space(2), paddingVertical: space(1) },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: touch, alignSelf: 'flex-start' },
  backText: { fontFamily: font.bold, fontSize: 15, color: colors.accent },
  linkButton: { minHeight: touch, justifyContent: 'center' },
  link: { fontFamily: font.bold, fontSize: 15, color: colors.accent },

  content: { padding: space(5), paddingTop: space(1), gap: space(4) },
  hero: { gap: space(2) },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space(1.5) },
  tag: {
    fontFamily: font.bold,
    fontSize: 12,
    color: colors.muted,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },

  summary: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: space(4),
  },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontFamily: font.black, fontSize: 26, color: colors.text },
  statText: { fontSize: 16, marginTop: 6 },

  card: { backgroundColor: colors.surface, borderRadius: radius.lg },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingVertical: space(3),
    paddingLeft: space(4),
    paddingRight: space(3),
  },
  cardDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },

  step: {
    width: touch,
    height: touch,
    borderRadius: 12,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPressed: { backgroundColor: colors.segment },
  stepText: { fontFamily: font.bold, fontSize: 20, color: colors.text },
  qty: { minWidth: 48, textAlign: 'center', fontFamily: font.black, fontSize: 20, color: colors.text },
  disabled: { opacity: 0.35 },

  actions: { flexDirection: 'row', gap: space(2.5), padding: space(3) },
  action: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingVertical: space(3),
    alignItems: 'center',
    gap: 2,
  },
  actionWarn: { borderColor: colors.warn, backgroundColor: colors.warnSoft },
  actionOk: { borderColor: colors.ok, backgroundColor: '#E3F2EC' },
  actionText: { fontFamily: font.black, fontSize: 15 },
  actionHint: { fontFamily: font.medium, fontSize: 12, color: colors.muted },

  error: { fontFamily: font.bold, fontSize: 14, color: colors.warn },

  history: { gap: space(2) },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingVertical: space(3),
    paddingHorizontal: space(4),
  },
  historyMeta: { alignItems: 'flex-end', gap: 2 },
  historyWho: { fontFamily: font.bold, fontSize: 13, color: colors.text },
});
