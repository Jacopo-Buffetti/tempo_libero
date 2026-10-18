import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { formatQty, locationLabel } from '@/lib/items';
import {
  centsToInput,
  dateFromIso,
  formatEuro,
  parseEuro,
  useListItems,
  useSetListItemPrice,
  useSetReimbursed,
  type ListSummary,
} from '@/lib/spesa';
import { useAuth, useMembership } from '@/providers/AuthProvider';
import { colors, type } from '@/theme/tokens';
import { closedListText, shareAnywhere, shareOnWhatsApp } from '@/lib/condividiLista';
import { styles } from '@/styles/components/listaChiusa';

export function ListaChiusa({ list }: { list: ListSummary }) {
  const { session } = useAuth();
  const membership = useMembership();
  const orgId = membership.data?.org_id;
  const listId = list.id!;

  const items = useListItems(listId);
  const setPrice = useSetListItemPrice(listId);
  const setReimbursed = useSetReimbursed(listId);

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

  const lines = (items.data ?? [])
    .filter((i) => i.checked)
    .sort((a, b) => a.name.localeCompare(b.name, 'it'));

  const [prices, setPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setPrices((current) => {
      const next = { ...current };
      (items.data ?? []).forEach((l) => {
        if (next[l.id] === undefined) next[l.id] = centsToInput(l.price_cents);
      });
      return next;
    });
  }, [items.data]);

  function commit(id: string, saved: number | null) {
    const text = prices[id] ?? '';
    const cents = parseEuro(text);
    if (text.trim() !== '' && cents == null) {
      setError('Prezzo non valido: usa un formato come 6,90');
      return;
    }
    setError(null);
    if (cents !== saved) {
      setPrice.mutate(
        { id, cents },
        { onError: () => setError('Prezzo non salvato. Controlla la connessione e riprova.') },
      );
    }
  }

  const current = lines.map((l) =>
    prices[l.id] === undefined ? l.price_cents : parseEuro(prices[l.id]),
  );
  const total = current.reduce<number>((s, c) => s + (c ?? 0), 0);
  const missing = current.filter((c) => c == null).length;

  const payer =
    list.paid_by === 'cassa'
      ? 'Cassa Pro Loco'
      : list.paid_by_user === session?.user.id
        ? 'Anticipata da te'
        : `Anticipata da ${
            members.data?.find((m) => m.user_id === list.paid_by_user)?.display_name ??
            'un volontario'
          }`;

  const payerName =
    list.paid_by === 'cassa'
      ? 'cassa Pro Loco'
      : `anticipato da ${
          members.data?.find((m) => m.user_id === list.paid_by_user)?.display_name ?? 'un volontario'
        }${list.reimbursed ? ' (rimborsato)' : ' (da rimborsare)'}`;

  const shareText = () =>
    closedListText(
      { name: list.name!, location: list.location!, shop: list.shop, closed_on: list.closed_on },
      items.data ?? [],
      payerName,
    );

  function share() {
    shareOnWhatsApp(shareText()).catch(() => undefined);
  }

  function shareElsewhere() {
    shareAnywhere(shareText()).catch(() => undefined);
  }

  const day = list.closed_on
    ? dateFromIso(list.closed_on).toLocaleDateString('it-IT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : '';

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

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={type.title}>{list.name}</Text>
            <Text style={type.caption}>
              {[day.charAt(0).toUpperCase() + day.slice(1), list.shop, locationLabel(list.location!)]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>

          <View style={styles.totalCard}>
            <View style={styles.flex}>
              <Text style={type.label}>Totale</Text>
              {missing > 0 && (
                <Text style={[type.caption, { color: colors.warn }]}>
                  {missing === 1 ? '1 prezzo da inserire' : `${missing} prezzi da inserire`}
                </Text>
              )}
            </View>
            <Text style={styles.total}>{formatEuro(total)}</Text>
          </View>

          <View style={styles.payCard}>
            <Ionicons
              name={list.paid_by === 'cassa' ? 'wallet-outline' : 'person-outline'}
              size={20}
              color={colors.text}
            />
            <View style={styles.flex}>
              <Text style={type.body}>{payer}</Text>
              {list.paid_by === 'volontario' && (
                <Text style={[type.caption, !list.reimbursed && { color: colors.warn }]}>
                  {list.reimbursed ? 'Già rimborsata' : 'Da rimborsare'}
                </Text>
              )}
            </View>
            {list.paid_by === 'volontario' && (
              <Pressable
                onPress={() => setReimbursed.mutate(!list.reimbursed)}
                disabled={setReimbursed.isPending}
                style={({ pressed }) => [
                  styles.refundButton,
                  list.reimbursed && styles.refundUndo,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={[styles.refundText, list.reimbursed && { color: colors.text }]}>
                  {list.reimbursed ? 'Annulla' : 'Rimborsata'}
                </Text>
              </Pressable>
            )}
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Comprati · {lines.length}</Text>
            <View style={styles.card}>
              {lines.map((l, i) => {
                const text = prices[l.id] ?? '';
                const bad = text.trim() !== '' && parseEuro(text) == null;
                const empty = text.trim() === '';
                return (
                  <View key={l.id} style={[styles.line, i < lines.length - 1 && styles.divider]}>
                    <View style={styles.flex}>
                      <Text style={type.body} numberOfLines={1}>{l.name}</Text>
                      <Text style={type.caption}>
                        {formatQty(l.qty)} {l.unit}
                        {l.item_id ? ' · in inventario' : ''}
                      </Text>
                      {!!l.note && <Text style={styles.note}>{l.note}</Text>}
                    </View>
                    <View style={[styles.priceBox, empty && styles.priceMissing, bad && styles.priceBad]}>
                      <Text style={styles.euro}>€</Text>
                      <TextInput
                        value={text}
                        onChangeText={(v) => setPrices((p) => ({ ...p, [l.id]: v }))}
                        onEndEditing={() => commit(l.id, l.price_cents)}
                        placeholder="0,00"
                        placeholderTextColor={colors.placeholder}
                        keyboardType="decimal-pad"
                        accessibilityLabel={`Prezzo di ${l.name}`}
                        style={styles.priceInput}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
            <Text style={type.caption}>I prezzi si salvano appena chiudi la tastiera.</Text>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
