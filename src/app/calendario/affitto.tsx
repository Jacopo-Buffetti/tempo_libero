import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { todayIso } from '@/lib/calendario';
import {
  SPACES,
  clientName,
  overlaps,
  periodLabel,
  spaceLabel,
  useClients,
  useDeleteRental,
  useRental,
  useRentals,
  useSaveClient,
  useSaveRental,
  type Client,
  type Space,
} from '@/lib/affitti';
import { centsToInput, errorMessage, formatEuro, parseEuro } from '@/lib/spesa';
import { useMembership } from '@/providers/AuthProvider';
import { Chip } from '@/components/Chip';
import { DateTimeField } from '@/components/DateTimeField';
import { TimeField } from '@/components/TimeField';
import { DocumentoCliente } from '@/components/affitti/DocumentoCliente';
import { FirmatiAffitto } from '@/components/affitti/FirmatiAffitto';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/screens/affitto';

type ClientPick = Pick<Client, 'id' | 'first_name' | 'last_name' | 'phone'>;

const internationalPhone = (phone: string) => {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('00')) return digits.slice(2);
  return `39${digits}`;
};

export default function Affitto() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const params = useLocalSearchParams<{ id?: string; date?: string; clientId?: string }>();
  const membership = useMembership();
  const orgId = membership.data?.org_id;
  const isEdit = !!params.id;

  const rental = useRental(params.id);
  const saveRental = useSaveRental(orgId);
  const saveClient = useSaveClient(orgId);
  const remove = useDeleteRental();

  const [space, setSpace] = useState<Space>('stanza');
  const [date, setDate] = useState<string | null>(params.date ?? todayIso());
  const [multiDay, setMultiDay] = useState(false);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [client, setClient] = useState<ClientPick | null>(null);
  const [newClient, setNewClient] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [search, setSearch] = useState('');
  const [price, setPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [depositPaid, setDepositPaid] = useState(false);
  const [balancePaid, setBalancePaid] = useState(false);
  const [notes, setNotes] = useState('');
  const [ready, setReady] = useState(!isEdit);
  const [error, setError] = useState<string | null>(null);

  const clients = useClients(orgId, search);
  const preset = useClients(orgId, '');
  const lastDay = multiDay && endDate ? endDate : date;
  const periodBad = !!date && !!lastDay && lastDay < date;
  const sameDays = useRentals(orgId, date ?? undefined, lastDay ?? undefined);

  useEffect(() => {
    if (ready || !rental.data) return;
    const r = rental.data;
    setSpace(r.space);
    setDate(r.rent_date);
    setEndDate(r.end_date);
    setMultiDay(r.end_date !== r.rent_date);
    setStart(r.start_time);
    setEnd(r.end_time);
    setClient(r.clients);
    setPrice(centsToInput(r.price_cents));
    setDeposit(centsToInput(r.deposit_cents));
    setDepositPaid(r.deposit_paid);
    setBalancePaid(r.balance_paid);
    setNotes(r.notes ?? '');
    setReady(true);
  }, [ready, rental.data]);

  useEffect(() => {
    if (!params.clientId || client) return;
    const found = preset.data?.find((c) => c.id === params.clientId);
    if (found) setClient(found);
  }, [params.clientId, preset.data, client]);

  const priceCents = parseEuro(price);
  const depositCents = parseEuro(deposit);
  const priceBad = price.trim() !== '' && priceCents == null;
  const depositBad = deposit.trim() !== '' && depositCents == null;
  const due = balancePaid ? 0 : Math.max(0, (priceCents ?? 0) - (depositPaid ? (depositCents ?? 0) : 0));

  const conflicts =
    date && lastDay && !periodBad
      ? (sameDays.data ?? []).filter(
          (r) =>
            r.id !== params.id &&
            r.space === space &&
            overlaps(r, { rent_date: date, end_date: lastDay, start_time: start, end_time: end }),
        )
      : [];

  const hasClient = !!client || (newClient && firstName.trim().length > 0);
  const busy = saveRental.isPending || saveClient.isPending;
  const canSave = !!date && !!lastDay && !periodBad && hasClient && !priceBad && !depositBad && !busy;

  async function save() {
    setError(null);
    try {
      const clientId = client
        ? client.id
        : await saveClient.mutateAsync({
            first_name: firstName,
            last_name: lastName,
            phone,
            address,
            notes: null,
          });
      await saveRental.mutateAsync({
        id: params.id,
        space,
        client_id: clientId,
        rent_date: date!,
        end_date: lastDay!,
        start_time: start,
        end_time: end,
        price_cents: priceCents,
        deposit_cents: depositCents,
        deposit_paid: depositCents ? depositPaid : false,
        balance_paid: balancePaid,
        notes: notes.trim() || null,
      });
      router.back();
    } catch (e) {
      setError(errorMessage(e, 'Salvataggio non riuscito. Riprova.'));
    }
  }

  function confirmDelete() {
    if (!params.id) return;
    Alert.alert('Eliminare l’affitto?', 'Il cliente resta in rubrica.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: () => remove.mutate(params.id!, { onSuccess: () => router.back() }),
      },
    ]);
  }

  if (!ready) {
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
          <Text style={styles.backText}>Annulla</Text>
        </Pressable>
        <Text style={type.heading}>{isEdit ? 'Affitto' : 'Nuovo affitto'}</Text>
        <View style={styles.back} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={type.label}>Cosa si affitta</Text>
            <View style={styles.chips}>
              {SPACES.map((s) => (
                <Chip
                  key={s.value}
                  label={s.label}
                  variant="accent"
                  active={space === s.value}
                  onPress={() => setSpace(s.value)}
                />
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Quando</Text>
            <View style={styles.card}>
              <SwitchRow
                label="Più giorni"
                value={multiDay}
                onChange={(v) => {
                  setMultiDay(v);
                  if (v && (!endDate || (date && endDate < date))) setEndDate(date);
                }}
                last
              />
            </View>
            <DateTimeField
              date={date}
              time={null}
              onChangeDate={(d) => {
                setDate(d);
                if (d && endDate && endDate < d) setEndDate(d);
              }}
              withTime={false}
              label={multiDay ? 'Dal' : 'Giorno'}
            />
            {multiDay && (
              <DateTimeField
                date={endDate}
                time={null}
                onChangeDate={setEndDate}
                withTime={false}
                label="Al"
              />
            )}
            <View style={styles.card}>
              <View style={styles.divider}>
                <TimeField
                  label={multiDay ? 'Dalle, il primo giorno' : 'Dalle'}
                  value={start}
                  onChange={setStart}
                  fallback="19:00:00"
                />
              </View>
              <TimeField
                label={multiDay ? 'Alle, l’ultimo giorno' : 'Alle'}
                value={end}
                onChange={setEnd}
                fallback="23:30:00"
              />
            </View>
            <Text style={type.caption}>
              {multiDay
                ? 'Senza orari vale dalla mattina del primo giorno alla sera dell’ultimo. Il prezzo è quello totale.'
                : 'Senza orari vale per tutto il giorno.'}
            </Text>
            {periodBad && <Text style={styles.warn}>L’ultimo giorno viene prima del primo.</Text>}
            {conflicts.length > 0 && (
              <Text style={styles.warn}>
                Attenzione: {spaceLabel(space)} è già affittato a {clientName(conflicts[0].clients)} (
                {periodLabel(conflicts[0])}).
              </Text>
            )}
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Cliente</Text>
            {client ? (
              <View style={styles.clientCard}>
                <View style={styles.avatar}>
                  <Ionicons name="person" size={18} color={colors.accent} />
                </View>
                <View style={styles.flex}>
                  <Text style={type.body}>{clientName(client)}</Text>
                  {!!client.phone && <Text style={type.caption}>{client.phone}</Text>}
                </View>
                {!!client.phone && (
                  <>
                    <Pressable
                      onPress={() => Linking.openURL(`tel:${client.phone}`)}
                      style={styles.contact}
                      accessibilityLabel="Chiama"
                    >
                      <Ionicons name="call-outline" size={18} color={colors.accent} />
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        Linking.openURL(`whatsapp://send?phone=${internationalPhone(client.phone!)}`).catch(
                          () => Alert.alert('WhatsApp non disponibile', 'Non riesco ad aprire WhatsApp.'),
                        )
                      }
                      style={styles.contact}
                      accessibilityLabel="Scrivi su WhatsApp"
                    >
                      <Ionicons name="logo-whatsapp" size={18} color={colors.accent} />
                    </Pressable>
                  </>
                )}
                <Pressable onPress={() => setClient(null)} style={styles.change}>
                  <Text style={styles.changeText}>Cambia</Text>
                </Pressable>
              </View>
            ) : newClient ? (
              <View style={styles.card}>
                <View style={styles.newClient}>
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
                    autoCapitalize="sentences"
                    style={styles.input}
                  />
                  <Text style={type.caption}>Verrà salvato anche nella rubrica clienti.</Text>
                  <Pressable onPress={() => setNewClient(false)} style={styles.link}>
                    <Text style={styles.linkText}>Cerca in rubrica</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={18} color={colors.muted} />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Cerca per nome, cognome o telefono"
                    placeholderTextColor={colors.placeholder}
                    style={styles.searchInput}
                  />
                </View>
                {search.trim().length > 0 && (
                  <View style={styles.card}>
                    {(clients.data ?? []).slice(0, 6).map((c, i, all) => (
                      <Pressable
                        key={c.id}
                        onPress={() => {
                          setClient(c);
                          setSearch('');
                        }}
                        style={({ pressed }) => [
                          styles.option,
                          i < all.length - 1 && styles.dividerLine,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[type.body, styles.flex]}>{clientName(c)}</Text>
                        {!!c.phone && <Text style={type.caption}>{c.phone}</Text>}
                      </Pressable>
                    ))}
                    {clients.data?.length === 0 && (
                      <Text style={[type.caption, styles.pad]}>Nessun cliente trovato.</Text>
                    )}
                  </View>
                )}
                <Pressable
                  onPress={() => {
                    setNewClient(true);
                    const [n, ...rest] = search.trim().split(/\s+/);
                    setFirstName(n ?? '');
                    setLastName(rest.join(' '));
                  }}
                  style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
                >
                  <Ionicons name="person-add-outline" size={18} color={colors.accent} />
                  <Text style={styles.linkText}>Nuovo cliente</Text>
                </Pressable>
              </>
            )}
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Pagamento</Text>
            <View style={styles.card}>
              <MoneyRow label="Prezzo totale" value={price} onChange={setPrice} bad={priceBad} />
              <MoneyRow
                label="Caparra (facoltativa)"
                value={deposit}
                onChange={setDeposit}
                bad={depositBad}
              />
              {!!depositCents && (
                <SwitchRow label="Caparra versata" value={depositPaid} onChange={setDepositPaid} />
              )}
              <SwitchRow label="Saldo pagato" value={balancePaid} onChange={setBalancePaid} last />
            </View>
            {priceCents != null && (
              <Text style={[styles.due, due === 0 && styles.dueOk]}>
                {due === 0 ? 'Tutto pagato' : `Da incassare: ${formatEuro(due)}`}
              </Text>
            )}
          </View>

          <View style={styles.field}>
            <Text style={type.label}>Note</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Es. compleanno, servono tavoli e sedie…"
              placeholderTextColor={colors.placeholder}
              multiline
              style={[styles.input, styles.multiline]}
            />
          </View>

          <View style={styles.field}>
            {isEdit ? (
              <DocumentoCliente orgId={orgId} rentalId={params.id!} />
            ) : (
              <>
                <Text style={type.label}>Documento d’identità</Text>
                <Text style={type.caption}>Dopo aver salvato l’affitto potrai fotografare il documento del cliente.</Text>
              </>
            )}
          </View>

          {isEdit && space === 'cramaccioli' && (
            <View style={styles.documents}>
              <Text style={type.label}>Documenti</Text>
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/calendario/contratto-parco', params: { rentalId: params.id! } })
                }
                style={({ pressed }) => [styles.docButton, pressed && styles.pressed]}
              >
                <Ionicons name="document-text-outline" size={22} color={colors.accent} />
                <View style={styles.flex}>
                  <Text style={type.body}>Contratto del Parco</Text>
                  <Text style={type.caption}>
                    Concessione d’uso dell’area, utenze e responsabilità, in PDF
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
              <Text style={[type.label, styles.subLabel]}>Firmati</Text>
              <FirmatiAffitto
                orgId={orgId}
                rentalId={params.id!}
                kinds={[{ kind: 'contratto', label: 'Contratto del Parco firmato' }]}
              />
            </View>
          )}

          {isEdit && space === 'stanza' && (
            <View style={styles.documents}>
              <Text style={type.label}>Documenti</Text>
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/calendario/contratto', params: { rentalId: params.id! } })
                }
                style={({ pressed }) => [styles.docButton, pressed && styles.pressed]}
              >
                <Ionicons name="document-text-outline" size={22} color={colors.accent} />
                <View style={styles.flex}>
                  <Text style={type.body}>Contratto</Text>
                  <Text style={type.caption}>Accordo per l’utilizzo della sala, in PDF</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/calendario/verbale', params: { rentalId: params.id! } })
                }
                style={({ pressed }) => [styles.docButton, pressed && styles.pressed]}
              >
                <Ionicons name="clipboard-outline" size={22} color={colors.accent} />
                <View style={styles.flex}>
                  <Text style={type.body}>Verbale di consegna e riconsegna</Text>
                  <Text style={type.caption}>Stato dei locali, chiavi e deposito</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
              <Text style={[type.label, styles.subLabel]}>Firmati</Text>
              <FirmatiAffitto
                orgId={orgId}
                rentalId={params.id!}
                kinds={[
                  { kind: 'contratto', label: 'Contratto firmato' },
                  { kind: 'verbale', label: 'Verbale firmato' },
                ]}
              />
            </View>
          )}

          {error && <Text style={styles.warn}>{error}</Text>}

          {isEdit && (
            <Pressable onPress={confirmDelete} style={styles.deleteButton}>
              <Ionicons name="trash-outline" size={18} color={colors.warn} />
              <Text style={styles.deleteText}>Elimina l’affitto</Text>
            </Pressable>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={save}
            disabled={!canSave}
            style={({ pressed }) => [
              styles.saveButton,
              !canSave && styles.disabled,
              pressed && styles.savePressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.saveText}>{isEdit ? 'Salva' : 'Salva l’affitto'}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MoneyRow({
  label,
  value,
  onChange,
  bad,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  bad: boolean;
}) {
  const styles = useStyles();
  const { colors, type } = useTheme();
  return (
    <View style={[styles.moneyRow, styles.dividerLine]}>
      <Text style={[type.body, styles.flex]}>{label}</Text>
      <View style={[styles.priceBox, bad && styles.priceBad]}>
        <Text style={styles.euro}>€</Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="0,00"
          placeholderTextColor={colors.placeholder}
          keyboardType="decimal-pad"
          accessibilityLabel={label}
          style={styles.priceInput}
        />
      </View>
    </View>
  );
}

function SwitchRow({
  label,
  value,
  onChange,
  last,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  const styles = useStyles();
  const { colors, type } = useTheme();
  return (
    <View style={[styles.moneyRow, !last && styles.dividerLine]}>
      <Text style={[type.body, styles.flex]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.segment }}
        thumbColor={colors.onAccent}
      />
    </View>
  );
}
