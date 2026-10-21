import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { todayIso } from '@/lib/calendario';
import { useClient, useRental } from '@/lib/affitti';
import {
  contractDefaults,
  contractHtml,
  printHtml,
  roomClientPatch,
  sharePdf,
  useContract,
  useSaveContract,
  type ContractData,
  type KitchenOption,
} from '@/lib/contratto';
import { errorMessage } from '@/lib/spesa';
import {
  computeTaxCode,
  findPlace,
  normalizeTaxCode,
  placeLabel,
  taxCodeProblem,
  type Sex,
} from '@/lib/codiceFiscale';
import { Chip } from '@/components/Chip';
import { DateTimeField } from '@/components/DateTimeField';
import { TimeField } from '@/components/TimeField';
import { Field, MoneyField, Section } from '@/components/FormField';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/screens/contratto';

export default function Contratto() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const { rentalId } = useLocalSearchParams<{ rentalId: string }>();
  const rental = useRental(rentalId);
  const client = useClient(rental.data?.client_id);
  const record = useContract(rentalId);
  const save = useSaveContract(rentalId);

  const [data, setData] = useState<ContractData | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'stampa' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoTaxCode = useRef<string | null>(null);

  useEffect(() => {
    if (data || !rental.data || !record.data || client.isLoading) return;
    const base = contractDefaults(rental.data, (client.data as Record<string, string | null> | null) ?? null);
    const merged = { ...base, ...record.data.contract };
    setData({ ...merged, placeDate: merged.placeDate ?? merged.signedOn });
  }, [data, rental.data, record.data, client.isLoading, client.data]);

  const placeMatch = useMemo(() => findPlace(data?.birthPlace ?? ''), [data?.birthPlace]);
  const taxResult = useMemo(
    () =>
      data
        ? computeTaxCode({
            firstName: data.firstName,
            lastName: data.lastName,
            sex: data.sex,
            birthDate: data.birthDate,
            birthPlace: data.birthPlace,
          })
        : null,
    [data?.firstName, data?.lastName, data?.sex, data?.birthDate, data?.birthPlace],
  );
  const expectedTaxCode = taxResult?.status === 'ok' ? taxResult.code : null;

  useEffect(() => {
    if (!expectedTaxCode) return;
    setData((d) => {
      if (!d) return d;
      const current = normalizeTaxCode(d.taxCode);
      if (current !== '' && current !== autoTaxCode.current && current !== expectedTaxCode) return d;
      autoTaxCode.current = expectedTaxCode;
      return current === expectedTaxCode ? d : { ...d, taxCode: expectedTaxCode };
    });
  }, [expectedTaxCode]);

  if (!data || !record.data || !rental.data) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        {record.isError ? (
          <Text style={styles.error}>{errorMessage(record.error, 'Non riesco ad aprire il contratto.')}</Text>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </SafeAreaView>
    );
  }

  const set = <K extends keyof ContractData>(key: K, value: ContractData[K]) =>
    setData((d) => (d ? { ...d, [key]: value } : d));

  const taxWarn = taxCodeProblem(data.taxCode, expectedTaxCode);
  const taxHint =
    expectedTaxCode && normalizeTaxCode(data.taxCode) === expectedTaxCode
      ? 'Calcolato da nome, cognome, sesso, data e luogo di nascita'
      : taxResult?.status === 'incomplete'
        ? `Per calcolarlo manca: ${taxResult.missing.join(', ')}`
        : undefined;
  const placeWarn =
    placeMatch.status === 'ambiguous'
      ? 'Ci sono più comuni con questo nome: scegli quello giusto'
      : placeMatch.status === 'unknown'
        ? placeMatch.options.length
          ? 'Comune non trovato: è uno di questi?'
          : 'Comune non trovato: scrivi il comune, non la frazione'
        : null;
  const placeHint = placeMatch.status === 'found' ? placeLabel(placeMatch.place) : undefined;
  const placeOptions =
    placeMatch.status === 'ambiguous' || placeMatch.status === 'unknown' ? placeMatch.options : [];
  const chooseSex = (sex: Sex) => set('sex', data.sex === sex ? null : sex);
  const emailWarn =
    data.email.trim() && !/^\S+@\S+\.\S+$/.test(data.email.trim()) ? 'E-mail non valida' : null;
  const multiDay = !!data.eventEndDate && data.eventEndDate !== data.eventDate;

  function chooseOption(option: KitchenOption) {
    set('option', option);
  }

  const contract = (): ContractData => ({ ...data, signedOn: data.placeDate });

  async function run(kind: 'pdf' | 'stampa') {
    if (!data || !record.data) return;
    setError(null);
    setBusy(kind);
    try {
      await save.mutateAsync({
        id: record.data.id,
        contract: contract(),
        clientId: rental.data?.client_id,
        clientPatch: roomClientPatch(data),
      });
      const html = contractHtml(contract(), record.data.number);
      const name = `Accordo ${record.data.number} ${data.firstName} ${data.lastName}`;
      if (kind === 'pdf') await sharePdf(html, name);
      else await printHtml(html);
    } catch (e) {
      setError(errorMessage(e, 'Operazione non riuscita. Riprova.'));
    } finally {
      setBusy(null);
    }
  }

  async function saveOnly() {
    if (!data || !record.data) return;
    setError(null);
    try {
      await save.mutateAsync({
        id: record.data.id,
        contract: contract(),
        clientId: rental.data?.client_id,
        clientPatch: roomClientPatch(data),
      });
      router.back();
    } catch (e) {
      setError(errorMessage(e, 'Salvataggio non riuscito. Riprova.'));
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Affitto</Text>
        </Pressable>
        <Pressable onPress={saveOnly} disabled={save.isPending} style={styles.back} hitSlop={8}>
          <Text style={[styles.backText, styles.right]}>Salva</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={type.label}>Accordo n. {record.data.number}</Text>
            <Text style={type.title}>Contratto per la sala</Text>
            <Text style={type.caption}>
              I campi lasciati vuoti restano come riga da compilare a penna nel PDF.
            </Text>
          </View>

          <Section title="Richiedente" hint="I dati vengono salvati anche nella rubrica clienti.">
            <View style={styles.twoCols}>
              <View style={styles.flex}>
                <Field
                  label="Nome"
                  value={data.firstName}
                  onChangeText={(v) => set('firstName', v)}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.flex}>
                <Field
                  label="Cognome"
                  value={data.lastName}
                  onChangeText={(v) => set('lastName', v)}
                  autoCapitalize="words"
                />
              </View>
            </View>
            <View style={styles.usage}>
              <Text style={styles.label}>Sesso</Text>
              <View style={styles.chips}>
                <Chip label="Maschio" variant="accent" active={data.sex === 'M'} onPress={() => chooseSex('M')} />
                <Chip label="Femmina" variant="accent" active={data.sex === 'F'} onPress={() => chooseSex('F')} />
              </View>
            </View>
            <Field
              label="Nato/a a"
              value={data.birthPlace}
              onChangeText={(v) => set('birthPlace', v)}
              autoCapitalize="words"
              hint={placeHint}
              warn={placeWarn}
            />
            {placeOptions.length > 0 && (
              <View style={styles.chips}>
                {placeOptions.map((option) => (
                  <Chip
                    key={`${option.code}-${option.province}-${option.name}`}
                    label={placeLabel(option)}
                    variant="accent"
                    onPress={() => set('birthPlace', placeLabel(option))}
                  />
                ))}
              </View>
            )}
            <DateTimeField
              date={data.birthDate}
              time={null}
              onChangeDate={(d) => set('birthDate', d)}
              withTime={false}
              label="Nato/a il"
            />
            <Field
              label="Residente in"
              value={data.residence}
              onChangeText={(v) => set('residence', v)}
              placeholder="Via, numero, comune"
            />
            <Field
              label="Codice fiscale"
              value={data.taxCode}
              onChangeText={(v) => set('taxCode', v.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={16}
              warn={taxWarn}
              hint={taxHint}
            />
            <Field
              label="Telefono"
              value={data.phone}
              onChangeText={(v) => set('phone', v)}
              keyboardType="phone-pad"
            />
            <Field
              label="E-mail"
              value={data.email}
              onChangeText={(v) => set('email', v)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              warn={emailWarn}
            />
          </Section>

          <Section title="Art. 1 · Evento">
            <Field
              label="Tipologia di evento"
              value={data.eventType}
              onChangeText={(v) => set('eventType', v)}
              placeholder="Es. festa di compleanno"
            />
            <DateTimeField
              date={data.eventDate}
              time={null}
              onChangeDate={(d) => set('eventDate', d)}
              withTime={false}
              label={multiDay ? 'Dal' : 'Data'}
            />
            {multiDay && (
              <DateTimeField
                date={data.eventEndDate}
                time={null}
                onChangeDate={(d) => set('eventEndDate', d)}
                withTime={false}
                label="Al"
              />
            )}
            <View style={styles.card}>
              <View style={styles.divider}>
                <TimeField
                  label="Dalle ore"
                  value={data.startTime}
                  onChange={(v) => set('startTime', v)}
                  fallback="19:00:00"
                />
              </View>
              <TimeField
                label="Alle ore"
                value={data.endTime}
                onChange={(v) => set('endTime', v)}
                fallback="23:30:00"
              />
            </View>
            <Field
              label="Numero indicativo di partecipanti"
              value={data.participants}
              onChangeText={(v) => set('participants', v)}
              keyboardType="number-pad"
            />
          </Section>

          <Section title="Art. 2 · Corrispettivo">
            <View style={styles.card}>
              <View style={styles.pad}>
                <MoneyField
                  label="Importo concordato"
                  value={data.agreedPrice}
                  onChangeText={(v) => set('agreedPrice', v)}
                />
              </View>
            </View>
            <View style={styles.chips}>
              <Chip
                label="Senza cucina"
                variant="accent"
                active={data.option === 'senza'}
                onPress={() => chooseOption(data.option === 'senza' ? null : 'senza')}
              />
              <Chip
                label="Con cucina"
                variant="accent"
                active={data.option === 'con'}
                onPress={() => chooseOption(data.option === 'con' ? null : 'con')}
              />
            </View>
          </Section>

          <Section
            title="Art. 3 · Deposito cauzionale"
            hint="È la cauzione restituita a fine evento se è tutto in ordine: non è la caparra sul prezzo."
          >
            <View style={styles.card}>
              <View style={styles.pad}>
                <MoneyField
                  label="Deposito cauzionale"
                  value={data.deposit}
                  onChangeText={(v) => set('deposit', v)}
                />
              </View>
            </View>
          </Section>

          <Section title="Firme">
            <Field label="Luogo" value={data.place} onChangeText={(v) => set('place', v)} />
            <DateTimeField
              date={data.placeDate}
              time={null}
              onChangeDate={(d) => set('placeDate', d ?? todayIso())}
              withTime={false}
              label="Data"
            />
            <View style={styles.twoCols}>
              <View style={styles.flex}>
                <Field
                  label="Referente"
                  value={data.referentName}
                  onChangeText={(v) => set('referentName', v)}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.flex}>
                <Field
                  label="Qualifica"
                  value={data.referentRole}
                  onChangeText={(v) => set('referentRole', v)}
                  autoCapitalize="sentences"
                />
              </View>
            </View>
            <View style={[styles.card, styles.switchRow]}>
              <View style={styles.flex}>
                <Text style={type.body}>Firma del presidente</Text>
                <Text style={type.caption}>Appone la firma nello spazio dell’Associazione</Text>
              </View>
              <Switch
                value={data.presidentSignature}
                onValueChange={(v) => set('presidentSignature', v)}
                trackColor={{ true: colors.accent, false: colors.segment }}
                thumbColor={colors.onAccent}
              />
            </View>
          </Section>

          <Pressable
            onPress={() => router.push({ pathname: '/calendario/verbale', params: { rentalId } })}
            style={({ pressed }) => [styles.linkCard, pressed && styles.linkPressed]}
          >
            <Ionicons name="clipboard-outline" size={22} color={colors.accent} />
            <View style={styles.flex}>
              <Text style={type.body}>Verbale di consegna e riconsegna</Text>
              <Text style={type.caption}>Allegato A, da compilare alla consegna delle chiavi</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={() => run('stampa')}
            disabled={busy !== null}
            style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
          >
            {busy === 'stampa' ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Ionicons name="print-outline" size={20} color={colors.accent} />
            )}
          </Pressable>
          <Pressable
            onPress={() => run('pdf')}
            disabled={busy !== null}
            style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
          >
            {busy === 'pdf' ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <>
                <Ionicons name="document-text-outline" size={20} color={colors.onAccent} />
                <Text style={styles.primaryText}>Scarica il PDF</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
