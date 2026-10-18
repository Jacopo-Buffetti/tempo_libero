import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  clientName,
  paymentState,
  periodLabel,
  spaceLabel,
  useClient,
  useDeleteClient,
  useSaveClient,
} from '@/lib/affitti';
import { errorMessage, formatEuro } from '@/lib/spesa';
import { useMembership } from '@/providers/AuthProvider';
import { colors, type } from '@/theme/tokens';
import { styles } from '@/styles/screens/cliente';

export default function Cliente() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'nuovo';
  const membership = useMembership();
  const orgId = membership.data?.org_id;

  const client = useClient(isNew ? undefined : id);
  const save = useSaveClient(orgId);
  const remove = useDeleteClient();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [ready, setReady] = useState(isNew);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready || !client.data) return;
    const c = client.data;
    setFirstName(c.first_name);
    setLastName(c.last_name ?? '');
    setPhone(c.phone ?? '');
    setAddress(c.address ?? '');
    setNotes(c.notes ?? '');
    setReady(true);
  }, [ready, client.data]);

  if (!ready) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const rentals = client.data?.rentals ?? [];
  const totals = rentals.reduce(
    (acc, r) => {
      const p = paymentState(r);
      return { paid: acc.paid + p.paid, due: acc.due + p.due };
    },
    { paid: 0, due: 0 },
  );
  const canSave = firstName.trim().length > 0 && !save.isPending;

  function submit() {
    setError(null);
    save.mutate(
      { id: isNew ? undefined : id, first_name: firstName, last_name: lastName, phone, address, notes },
      {
        onSuccess: () => router.back(),
        onError: (e) => setError(errorMessage(e, 'Salvataggio non riuscito. Riprova.')),
      },
    );
  }

  function confirmDelete() {
    Alert.alert(
      'Eliminare il cliente?',
      `${clientName({ first_name: firstName, last_name: lastName })} verrà tolto dalla rubrica.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () =>
            remove.mutate(id, {
              onSuccess: () => router.back(),
              onError: (e) => setError(e instanceof Error ? e.message : 'Eliminazione non riuscita.'),
            }),
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Rubrica</Text>
        </Pressable>
        {!isNew && !!phone && (
          <View style={styles.actions}>
            <Pressable
              onPress={() => Linking.openURL(`tel:${phone}`)}
              style={styles.contact}
              accessibilityLabel="Chiama"
            >
              <Ionicons name="call-outline" size={20} color={colors.accent} />
            </Pressable>
          </View>
        )}
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={type.title}>
            {isNew ? 'Nuovo cliente' : clientName({ first_name: firstName, last_name: lastName })}
          </Text>

          <View style={styles.card}>
            <View style={styles.form}>
              <View style={styles.twoCols}>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Nome"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="words"
                  style={[styles.input, styles.flex]}
                />
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Cognome"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="words"
                  style={[styles.input, styles.flex]}
                />
              </View>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Telefono"
                placeholderTextColor={colors.placeholder}
                keyboardType="phone-pad"
                style={styles.input}
              />
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="Indirizzo"
                placeholderTextColor={colors.placeholder}
                style={styles.input}
              />
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Note"
                placeholderTextColor={colors.placeholder}
                multiline
                style={[styles.input, styles.multiline]}
              />
            </View>
          </View>

          {!isNew && (
            <>
              <View style={styles.totals}>
                <View style={styles.total}>
                  <Text style={styles.totalNumber}>{formatEuro(totals.paid)}</Text>
                  <Text style={type.caption}>Incassato</Text>
                </View>
                <View style={[styles.total, totals.due > 0 && styles.totalWarn]}>
                  <Text style={[styles.totalNumber, totals.due > 0 && styles.warnText]}>
                    {formatEuro(totals.due)}
                  </Text>
                  <Text style={type.caption}>Da incassare</Text>
                </View>
              </View>

              <View style={styles.sectionHead}>
                <Text style={type.label}>Affitti · {rentals.length}</Text>
                <Pressable
                  onPress={() => router.push({ pathname: '/calendario/affitto', params: { clientId: id } })}
                >
                  <Text style={styles.link}>+ Nuovo affitto</Text>
                </Pressable>
              </View>
              {rentals.length > 0 && (
                <View style={styles.card}>
                  {rentals.map((r, i) => {
                    const p = paymentState(r);
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => router.push({ pathname: '/calendario/affitto', params: { id: r.id } })}
                        style={({ pressed }) => [
                          styles.row,
                          i < rentals.length - 1 && styles.divider,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.flex}>
                          <Text style={type.body}>{periodLabel(r)}</Text>
                          <Text style={type.caption}>{spaceLabel(r.space)}</Text>
                          <Text style={[styles.payment, p.warn && styles.warnText]}>{p.label}</Text>
                        </View>
                        <Text style={styles.price}>
                          {r.price_cents != null ? formatEuro(r.price_cents) : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          {!isNew && (
            <Pressable onPress={confirmDelete} style={styles.deleteButton}>
              <Ionicons name="trash-outline" size={18} color={colors.warn} />
              <Text style={styles.deleteText}>Elimina dalla rubrica</Text>
            </Pressable>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={submit}
            disabled={!canSave}
            style={({ pressed }) => [
              styles.saveButton,
              !canSave && styles.disabled,
              pressed && styles.savePressed,
            ]}
          >
            {save.isPending ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.saveText}>Salva</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
