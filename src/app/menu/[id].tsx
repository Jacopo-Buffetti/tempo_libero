import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import {
  SECTIONS,
  fixedPriceLine,
  formatEventDate,
  posterUrl,
  printMenu,
  shareMenu,
  useEvent,
  useEventList,
} from '@/lib/menu';
import { formatEuro } from '@/lib/spesa';
import { colors, type } from '@/theme/tokens';
import { styles } from '@/styles/screens/menu/dettaglio';

export default function DettaglioMenu() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = useEvent(id);
  const eventList = useEventList(id);
  const [zoom, setZoom] = useState(false);

  if (event.isLoading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (event.isError) {
    const message = (event.error as { message?: string })?.message;
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.warn} />
        <Text style={type.heading}>Non riesco a caricare il menù</Text>
        {!!message && <Text style={[type.caption, styles.center, styles.errorText]}>{message}</Text>}
        <Pressable onPress={() => event.refetch()} style={styles.linkButton}>
          <Text style={styles.link}>Riprova</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.linkButton}>
          <Text style={styles.link}>Torna ai menù</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!event.data) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <Text style={type.heading}>Menù non trovato</Text>
        <Pressable onPress={() => router.back()} style={styles.linkButton}>
          <Text style={styles.link}>Torna ai menù</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const e = event.data;
  const url = posterUrl(e.poster_path);
  const fixed = fixedPriceLine(e);
  const sections = SECTIONS.map((s) => ({
    ...s,
    dishes: e.dishes.filter((d) => d.section === s.value),
  })).filter((s) => s.dishes.length > 0);

  const addDish = (section?: string) =>
    router.push({ pathname: '/menu/piatto', params: { eventId: e.id, section: section ?? '' } });

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch {
      Alert.alert('Non è stato possibile', 'Riprova tra poco.');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Menù</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/menu/modifica/[id]', params: { id: e.id } })}
          style={styles.back}
          hitSlop={8}
        >
          <Ionicons name="create-outline" size={20} color={colors.accent} />
          <Text style={styles.backText}>Modifica</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={event.isRefetching}
            onRefresh={event.refetch}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.hero}>
          <Pressable
            onPress={() =>
              url ? setZoom(true) : router.push({ pathname: '/menu/modifica/[id]', params: { id: e.id } })
            }
            accessibilityLabel={url ? 'Ingrandisci la locandina' : 'Aggiungi una locandina'}
          >
            {url ? (
              <Image source={{ uri: url }} style={styles.poster} contentFit="cover" transition={150} />
            ) : (
              <View style={[styles.poster, styles.posterEmpty]}>
                <Ionicons name="image-outline" size={28} color={colors.muted} />
                <Text style={[type.caption, styles.center]}>Aggiungi locandina</Text>
              </View>
            )}
          </Pressable>

          <View style={styles.heroText}>
            <Text style={type.title} numberOfLines={3}>
              {e.name}
            </Text>
            <Text style={type.caption}>{formatEventDate(e.starts_on, e.start_time)}</Text>
            {e.place && <Text style={type.caption}>{e.place}</Text>}
            <Text style={type.caption}>
              {e.dishes.length === 1 ? '1 piatto' : `${e.dishes.length} piatti`}
            </Text>
          </View>
        </View>

        {fixed ? (
          <Pressable
            onPress={() => router.push({ pathname: '/menu/modifica/[id]', params: { id: e.id } })}
            style={styles.fixed}
          >
            <Ionicons name="pricetag-outline" size={20} color={colors.accent} />
            <Text style={styles.fixedText}>{fixed}</Text>
          </Pressable>
        ) : null}

        {!!e.notes && <Text style={styles.notes}>{e.notes}</Text>}

        <View style={styles.actions}>
          <Action icon="share-outline" label="Condividi" onPress={() => run(() => shareMenu(e))} />
          <Action icon="print-outline" label="Stampa" onPress={() => run(() => printMenu(e))} />
          <Action
            icon="copy-outline"
            label="Duplica"
            onPress={() => router.push({ pathname: '/menu/nuovo', params: { from: e.id } })}
          />
        </View>

        {eventList.data && (
          <Pressable
            onPress={() => router.push({ pathname: '/spesa/[id]', params: { id: eventList.data!.id! } })}
            style={({ pressed }) => [styles.listCard, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="cart-outline" size={22} color={colors.ok} />
            <View style={styles.flex}>
              <Text style={type.body}>Lista della spesa del menù</Text>
              <Text style={type.caption}>
                {eventList.data.status === 'chiusa'
                  ? 'Spesa fatta e chiusa'
                  : `${(eventList.data.items_count ?? 0) - (eventList.data.checked_count ?? 0)} da prendere su ${eventList.data.items_count ?? 0}`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        )}

        {sections.length === 0 ? (
          <Pressable onPress={() => addDish()} style={styles.emptyCard}>
            <Ionicons name="restaurant-outline" size={26} color={colors.muted} />
            <Text style={[type.caption, styles.center]}>Il menù è vuoto. Aggiungi il primo piatto.</Text>
          </Pressable>
        ) : (
          sections.map((s) => (
            <View key={s.value} style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{s.label}</Text>
                <Pressable
                  onPress={() => addDish(s.value)}
                  hitSlop={8}
                  accessibilityLabel={`Aggiungi un piatto in ${s.label}`}
                  style={styles.sectionAdd}
                >
                  <Ionicons name="add" size={20} color={colors.accent} />
                </Pressable>
              </View>
              <View style={styles.card}>
                {s.dishes.map((d, i) => (
                  <Pressable
                    key={d.id}
                    onPress={() =>
                      router.push({ pathname: '/menu/piatto', params: { eventId: e.id, id: d.id } })
                    }
                    style={({ pressed }) => [
                      styles.dish,
                      i < s.dishes.length - 1 && styles.divider,
                      pressed && { backgroundColor: colors.pressed },
                    ]}
                  >
                    <View style={styles.flex}>
                      <Text style={type.body}>{d.name}</Text>
                      {!!d.description && <Text style={type.caption}>{d.description}</Text>}
                      <Text style={[styles.ingCount, !d.ingredients && { color: colors.muted }]}>
                        {d.ingredients
                          ? `${d.ingredients} ${d.ingredients === 1 ? 'ingrediente' : 'ingredienti'} in lista`
                          : 'Nessun ingrediente'}
                      </Text>
                    </View>
                    {e.price_mode !== 'fisso' && (
                      <Text style={styles.price}>
                        {d.price_cents != null ? formatEuro(d.price_cents) : ''}
                      </Text>
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          ))
        )}

        <Pressable
          onPress={() => addDish()}
          style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
          <Text style={styles.addText}>Aggiungi piatto</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={zoom} transparent animationType="fade" onRequestClose={() => setZoom(false)}>
        <Pressable style={styles.zoom} onPress={() => setZoom(false)} accessibilityLabel="Chiudi">
          {url && <Image source={{ uri: url }} style={styles.zoomImage} contentFit="contain" />}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Action({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.segment }]}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}
