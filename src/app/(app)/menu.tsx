import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { supabase } from '@/lib/supabase';
import { fixedPriceLine, formatEventDate, localIsoDate, posterUrl, useEvents } from '@/lib/menu';
import { useMembership } from '@/providers/AuthProvider';
import { colors, space, type } from '@/theme/tokens';
import { styles } from '@/styles/screens/elencoMenu';

type EventItem = NonNullable<ReturnType<typeof useEvents>['data']>[number];

export default function Menu() {
  const membership = useMembership();
  const orgId = membership.data?.org_id;
  const events = useEvents(orgId);
  const [text, setText] = useState('');

  const today = localIsoDate();
  const term = text.trim().toLowerCase();

  const { upcoming, past } = useMemo(() => {
    const all = (events.data ?? []).filter(
      (e) => !term || e.name.toLowerCase().includes(term) || e.place?.toLowerCase().includes(term),
    );
    return {
      upcoming: all.filter((e) => e.starts_on >= today).sort((a, b) => a.starts_on.localeCompare(b.starts_on)),
      past: all.filter((e) => e.starts_on < today),
    };
  }, [events.data, term, today]);

  const open = (id: string) => router.push({ pathname: '/menu/[id]', params: { id } });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={type.title}>Menù</Text>
        <Pressable
          onPress={() => router.push('/menu/nuovo')}
          style={({ pressed }) => [styles.newButton, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="add" size={20} color={colors.onAccent} />
          <Text style={styles.newText}>Nuovo</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={events.isRefetching}
            onRefresh={events.refetch}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Cerca un evento o un luogo…"
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            style={styles.searchInput}
          />
          {text.length > 0 && (
            <Pressable onPress={() => setText('')} hitSlop={10} accessibilityLabel="Cancella">
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </Pressable>
          )}
        </View>

        <Text style={[type.label, styles.section]}>In programma</Text>
        {events.isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: space(4) }} />
        ) : upcoming.length === 0 ? (
          <Pressable onPress={() => router.push('/menu/nuovo')} style={styles.emptyCard}>
            <Ionicons name="restaurant-outline" size={26} color={colors.muted} />
            <Text style={[type.caption, styles.center]}>
              {term
                ? 'Nessun evento in programma trovato.'
                : 'Nessun evento in programma. Crea il menù del prossimo evento.'}
            </Text>
          </Pressable>
        ) : (
          upcoming.map((e) => <UpcomingCard key={e.id} event={e} onPress={() => open(e.id)} />)
        )}

        <Text style={[type.label, styles.section]}>Storico</Text>
        {!events.isLoading && past.length === 0 ? (
          <Text style={type.caption}>
            {term ? 'Nessun evento passato trovato.' : 'Qui troverai i menù degli eventi passati.'}
          </Text>
        ) : (
          <View style={styles.grid}>
            {past.map((e) => (
              <PastTile
                key={e.id}
                event={e}
                onPress={() => open(e.id)}
                onDuplicate={() => router.push({ pathname: '/menu/nuovo', params: { from: e.id } })}
              />
            ))}
          </View>
        )}

        <Pressable onPress={() => supabase.auth.signOut()} style={styles.logout}>
          <Text style={styles.logoutText}>Esci dall’account</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Poster({ path, style }: { path: string | null; style: object }) {
  const url = posterUrl(path);
  return url ? (
    <Image source={{ uri: url }} style={style} contentFit="cover" transition={150} />
  ) : (
    <View style={[style, styles.posterEmpty]}>
      <Ionicons name="image-outline" size={24} color={colors.muted} />
    </View>
  );
}

function UpcomingCard({ event, onPress }: { event: EventItem; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.pressed }]}
    >
      <Poster path={event.poster_path} style={styles.posterBig} />
      <View style={styles.cardText}>
        <Text style={styles.badge}>
          {event.starts_on === localIsoDate() ? 'Oggi' : 'In programma'}
        </Text>
        <Text style={type.heading} numberOfLines={2}>{event.name}</Text>
        <Text style={type.caption}>{formatEventDate(event.starts_on, event.start_time)}</Text>
        {event.place && <Text style={type.caption}>{event.place}</Text>}
        {fixedPriceLine(event) && <Text style={styles.fixed}>{fixedPriceLine(event)}</Text>}
        <Text style={[type.caption, styles.cardFoot]}>
          {event.dishes === 1 ? '1 piatto' : `${event.dishes} piatti`}
          {event.poster_path ? ' · locandina ✓' : ' · senza locandina'}
        </Text>
      </View>
    </Pressable>
  );
}

function PastTile({
  event,
  onPress,
  onDuplicate,
}: {
  event: EventItem;
  onPress: () => void;
  onDuplicate: () => void;
}) {
  const d = new Date(`${event.starts_on}T12:00:00`);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && { backgroundColor: colors.pressed }]}
    >
      <Poster path={event.poster_path} style={styles.posterTile} />
      <View style={styles.tileFoot}>
        <View style={styles.flex}>
          <Text style={styles.tileName} numberOfLines={1}>{event.name}</Text>
          <Text style={type.caption}>
            {d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
          </Text>
        </View>
        <Pressable
          onPress={onDuplicate}
          hitSlop={4}
          accessibilityLabel={`Duplica il menù di ${event.name}`}
          style={({ pressed }) => [styles.dup, pressed && { backgroundColor: colors.segment }]}
        >
          <Ionicons name="copy-outline" size={18} color={colors.text} />
        </Pressable>
      </View>
    </Pressable>
  );
}
