import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  ITEM_COLUMNS,
  available,
  formatQty,
  isLow,
  itemsKeys,
  kindLabel,
  locationLabel,
  movementsKeys,
  stepFor,
  useAdjustBroken,
  useAdjustQuantity,
  useDeleteItem,
  type Item,
} from '@/lib/items';
import { useAuth, useMembership } from '@/providers/AuthProvider';
import { Stepper } from '@/components/Stepper';
import { space, useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/screens/oggetto';
import { useRole } from '@/lib/ruoli';

type Movement = {
  id: number;
  delta: number;
  broken_delta: number;
  user_id: string | null;
  created_at: string;
};

export default function DettaglioOggetto() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const membership = useMembership();
  const orgId = membership.data?.org_id;

  const adjust = useAdjustQuantity();
  const broken = useAdjustBroken();
  const removeItem = useDeleteItem();
  const { isConsigliere } = useRole();
  const [count, setCount] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const item = useQuery({
    queryKey: itemsKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('items').select(ITEM_COLUMNS).eq('id', id!).maybeSingle();
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
  const step = stepFor(it.unit);
  const cantRemove = it.qty - step < it.broken_qty;

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

  function confirmDelete() {
    Alert.alert(
      `Eliminare “${it.name}”?`,
      'Sparisce dall’inventario insieme al suo storico dei movimenti. Se è in qualche lista della spesa, lì resta come voce libera.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () =>
            removeItem.mutate(it.id, {
              onSuccess: () => router.back(),
              onError: (e) =>
                setError(e instanceof Error && e.message ? e.message : 'Eliminazione non riuscita. Riprova.'),
            }),
        },
      ],
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
        {isConsigliere && (
          <Pressable
            onPress={() => router.push({ pathname: '/oggetto/modifica/[id]', params: { id: it.id } })}
            style={styles.edit}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Ionicons name="create-outline" size={20} color={colors.accent} />
            <Text style={styles.backText}>Modifica</Text>
          </Pressable>
        )}
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

        <View style={styles.summary}>
          {isEquipment ? (
            <>
              <Stat label="Totale" value={it.qty} />
              <Stat label="Disponibili" value={free} />
              <Stat label="Da riparare" value={it.broken_qty} alert={it.broken_qty > 0} />
            </>
          ) : (
            <>
              <Stat label={`Quantità (${it.unit})`} text={formatQty(it.qty)} alert={low} big />
              <Stat label="Scorta minima" text={formatQty(it.min_qty ?? 0)} big />
              <Stat label="Stato" text={low ? 'Da comprare' : 'Ok'} alert={low} />
            </>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.flex}>
              <Text style={type.body}>{isEquipment ? 'Totale pezzi' : 'Quantità'}</Text>
              <Text style={type.caption}>
                {!isConsigliere
                  ? it.unit
                  : isEquipment
                    ? 'Pezzi acquistati o persi'
                    : `+ e − di ${formatQty(step)} ${it.unit}`}
              </Text>
            </View>
            {isConsigliere && (
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  adjust.mutate({ id: it.id, delta: -step });
                }}
                disabled={cantRemove}
                accessibilityLabel={`Togli ${formatQty(step)} ${it.unit}`}
                style={({ pressed }) => [
                  styles.step,
                  cantRemove && styles.disabled,
                  pressed && styles.stepPressed,
                ]}
              >
                <Text style={styles.stepText}>−</Text>
              </Pressable>
            )}
            <Text style={styles.qty}>{formatQty(it.qty)}</Text>
            {isConsigliere && (
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  adjust.mutate({ id: it.id, delta: step });
                }}
                accessibilityLabel={`Aggiungi ${formatQty(step)} ${it.unit}`}
                style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
              >
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            )}
          </View>
        </View>

        {isEquipment && isConsigliere && (
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

        <View style={styles.history}>
          <Text style={type.label}>Ultimi movimenti</Text>
          <View style={styles.card}>
            {movements.isLoading ? (
              <ActivityIndicator color={colors.accent} style={{ padding: space(5) }} />
            ) : !movements.data?.length ? (
              <Text style={[type.caption, { padding: space(4) }]}>Ancora nessun movimento registrato.</Text>
            ) : (
              movements.data.map((m, i) => (
                <View
                  key={m.id}
                  style={[styles.historyRow, i < movements.data!.length - 1 && styles.cardDivider]}
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

        <View style={styles.danger}>
          {isConsigliere ? (
            <Pressable
              onPress={confirmDelete}
              disabled={removeItem.isPending}
              style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.85 }]}
            >
              {removeItem.isPending ? (
                <ActivityIndicator color={colors.warn} />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={18} color={colors.warn} />
                  <Text style={styles.deleteText}>Elimina dall’inventario</Text>
                </>
              )}
            </Pressable>
          ) : (
            <Text style={[type.caption, styles.centerText]}>
              L’inventario lo modificano i consiglieri: qui puoi solo consultarlo.
            </Text>
          )}
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
  big,
}: {
  label: string;
  value?: number;
  text?: string;
  alert?: boolean;
  big?: boolean;
}) {
  const styles = useStyles();
  const { colors, type } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={type.caption}>{label}</Text>
      <Text
        style={[styles.statValue, alert && { color: colors.warn }, text && !big ? styles.statText : null]}
      >
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
  if (m.delta > 0) return `+${formatQty(m.delta)} ${m.delta === 1 ? 'aggiunto' : 'aggiunti'}`;
  const n = -m.delta;
  return `−${formatQty(n)} ${n === 1 ? 'tolto' : 'tolti'}`;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `oggi ${time}`;
  return `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} ${time}`;
}
