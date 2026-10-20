import { useEffect, useState } from 'react';
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
import { useClient, useRental } from '@/lib/affitti';
import { printHtml, sharePdf, useContract, useSaveContract } from '@/lib/contratto';
import {
  ATTACHMENTS,
  parkClientPatch,
  parkContractHtml,
  parkDefaults,
  wordsFor,
  type ParkContractData,
  type Usage,
} from '@/lib/contrattoParco';
import { errorMessage } from '@/lib/spesa';
import { Chip } from '@/components/Chip';
import { DateTimeField } from '@/components/DateTimeField';
import { TimeField } from '@/components/TimeField';
import { Field, MoneyField, Section } from '@/components/FormField';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/screens/contratto';

export default function ContrattoParco() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const { rentalId } = useLocalSearchParams<{ rentalId: string }>();
  const rental = useRental(rentalId);
  const client = useClient(rental.data?.client_id);
  const record = useContract(rentalId);
  const save = useSaveContract(rentalId);

  const [data, setData] = useState<ParkContractData | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'stampa' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data || !rental.data || !record.data || client.isLoading) return;
    const base = parkDefaults(rental.data, (client.data as Record<string, string | null> | null) ?? null);
    const saved = record.data.contract as Partial<ParkContractData>;
    setData(saved.kind === 'parco' ? { ...base, ...saved } : base);
  }, [data, rental.data, record.data, client.isLoading, client.data]);

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

  const set = <K extends keyof ParkContractData>(key: K, value: ParkContractData[K]) =>
    setData((d) => (d ? { ...d, [key]: value } : d));

  function setPrice(value: string) {
    setData((d) => (d ? { ...d, price: value, priceInWords: wordsFor(value) } : d));
  }

  function toggleAttachment(key: string) {
    setData((d) => (d ? { ...d, attachments: { ...d.attachments, [key]: !d.attachments[key] } } : d));
  }

  async function persist() {
    await save.mutateAsync({
      id: record.data!.id,
      contract: data!,
      clientId: rental.data?.client_id,
      clientPatch: parkClientPatch(data!),
    });
  }

  async function run(kind: 'pdf' | 'stampa') {
    setError(null);
    setBusy(kind);
    try {
      await persist();
      const html = parkContractHtml(data!, record.data!.number);
      if (kind === 'pdf') await sharePdf(html, `Contratto Parco ${record.data!.number} ${data!.holderName}`);
      else await printHtml(html);
    } catch (e) {
      setError(errorMessage(e, 'Operazione non riuscita. Riprova.'));
    } finally {
      setBusy(null);
    }
  }

  async function saveOnly() {
    setError(null);
    try {
      await persist();
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
            <Text style={type.label}>Contratto n. {record.data.number}</Text>
            <Text style={type.title}>Concessione del Parco Cramaccioli</Text>
            <Text style={type.caption}>
              I campi lasciati vuoti restano come riga da compilare a penna nel PDF.
            </Text>
          </View>

          <Section title="Concessionario">
            <Field
              label="Sig. / Società"
              value={data.holderName}
              onChangeText={(v) => set('holderName', v)}
              autoCapitalize="words"
            />
            <Field
              label="Sede o residenza"
              value={data.holderSeat}
              onChangeText={(v) => set('holderSeat', v)}
            />
            <Field
              label="C.F. / P. IVA"
              value={data.holderTaxCode}
              onChangeText={(v) => set('holderTaxCode', v.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={16}
            />
            <View style={styles.twoCols}>
              <View style={styles.flex}>
                <Field
                  label="In persona di"
                  value={data.representative}
                  onChangeText={(v) => set('representative', v)}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.flex}>
                <Field
                  label="In qualità di"
                  value={data.representativeRole}
                  onChangeText={(v) => set('representativeRole', v)}
                  placeholder="Es. presidente"
                />
              </View>
            </View>
          </Section>

          <Section title="Art. 1 · Oggetto">
            <Field
              label="Porzione di area concessa"
              value={data.area}
              onChangeText={(v) => set('area', v)}
              placeholder="Es. prato centrale, esclusa l’area giochi"
              multiline
            />
            <Field label="Attività o evento" value={data.activity} onChangeText={(v) => set('activity', v)} />
            <Field
              label="Descrizione dell’attività, delle attrezzature e dei servizi"
              value={data.description}
              onChangeText={(v) => set('description', v)}
              multiline
            />
          </Section>

          <Section title="Art. 2 · Durata">
            <DateTimeField
              date={data.fromDate}
              time={null}
              onChangeDate={(d) => set('fromDate', d)}
              withTime={false}
              label="Dal"
            />
            <DateTimeField
              date={data.toDate}
              time={null}
              onChangeDate={(d) => set('toDate', d)}
              withTime={false}
              label="Al"
            />
            <View style={styles.card}>
              <View style={styles.divider}>
                <TimeField
                  label="Ore, il primo giorno"
                  value={data.fromTime}
                  onChange={(v) => set('fromTime', v)}
                />
              </View>
              <TimeField
                label="Ore, l’ultimo giorno"
                value={data.toTime}
                onChange={(v) => set('toTime', v)}
              />
            </View>
            <Field
              label="Giorni e orari aggiuntivi (allestimento, disallestimento)"
              value={data.extraTimes}
              onChangeText={(v) => set('extraTimes', v)}
              multiline
            />
          </Section>

          <Section title="Art. 2 · Corrispettivo e deposito">
            <View style={styles.card}>
              <View style={styles.pad}>
                <MoneyField label="Corrispettivo complessivo" value={data.price} onChangeText={setPrice} />
              </View>
            </View>
            <Field
              label="In lettere"
              value={data.priceInWords}
              onChangeText={(v) => set('priceInWords', v)}
              hint="Si compila da solo dall’importo"
            />
            <Field
              label="Modalità e scadenza del pagamento"
              value={data.paymentTerms}
              onChangeText={(v) => set('paymentTerms', v)}
              placeholder="Es. bonifico entro il…"
            />
            <View style={styles.card}>
              <View style={styles.pad}>
                <MoneyField
                  label="Deposito cauzionale, se previsto"
                  value={data.deposit}
                  onChangeText={(v) => set('deposit', v)}
                />
              </View>
            </View>
            <Field
              label="Modalità e condizioni di restituzione"
              value={data.depositTerms}
              onChangeText={(v) => set('depositTerms', v)}
            />
          </Section>

          <Section title="Art. 3 · Utenze">
            <Field
              label="Servizi igienici: disponibilità e condizioni d’uso"
              value={data.toilets}
              onChangeText={(v) => set('toilets', v)}
              multiline
            />
            <UsageChoice label="Utilizzo dell’acqua" value={data.water} onChange={(v) => set('water', v)} />
            {data.water === 'si' && (
              <Field
                label="Condizioni per l’acqua"
                value={data.waterConditions}
                onChangeText={(v) => set('waterConditions', v)}
              />
            )}
            <Field
              label="Consumi, costi o contabilizzazione dell’acqua"
              value={data.waterCosts}
              onChangeText={(v) => set('waterCosts', v)}
            />
            <Field
              label="Esigenze elettriche dichiarate"
              value={data.electricNeeds}
              onChangeText={(v) => set('electricNeeds', v)}
              placeholder="Apparecchi, potenza, punti di alimentazione…"
              multiline
            />
            <UsageChoice
              label="Impianto elettrico"
              value={data.electric}
              onChange={(v) => set('electric', v)}
            />
            {data.electric === 'si' && (
              <Field
                label="Condizioni per l’impianto elettrico"
                value={data.electricConditions}
                onChangeText={(v) => set('electricConditions', v)}
              />
            )}
          </Section>

          <Section title="Art. 4 e 5 · Assicurazione e rinuncia">
            <Field
              label="Massimale RCT e requisiti, se concordati"
              value={data.insurance}
              onChangeText={(v) => set('insurance', v)}
            />
            <Field
              label="Conseguenze economiche di rinuncia o risoluzione"
              value={data.cancellation}
              onChangeText={(v) => set('cancellation', v)}
              multiline
            />
          </Section>

          <Section title="Art. 7 · Allegati">
            <View style={styles.chips}>
              {ATTACHMENTS.map((a) => (
                <Chip
                  key={a.key}
                  label={a.label.charAt(0).toUpperCase() + a.label.slice(1)}
                  variant="accent"
                  active={!!data.attachments[a.key]}
                  onPress={() => toggleAttachment(a.key)}
                />
              ))}
            </View>
            <Field
              label="Altri allegati"
              value={data.otherAttachments}
              onChangeText={(v) => set('otherAttachments', v)}
            />
          </Section>

          <Section title="Sottoscrizione">
            <Field label="Luogo" value={data.place} onChangeText={(v) => set('place', v)} />
            <DateTimeField
              date={data.signedOn}
              time={null}
              onChangeDate={(d) => set('signedOn', d)}
              withTime={false}
              label="Data"
            />
            <Field
              label="Concedente: nome e cognome"
              value={data.grantorName}
              onChangeText={(v) => set('grantorName', v)}
              autoCapitalize="words"
            />
            <View style={[styles.card, styles.switchRow]}>
              <View style={styles.flex}>
                <Text style={type.body}>Firma del presidente</Text>
                <Text style={type.caption}>Appone la firma nello spazio del Concedente</Text>
              </View>
              <Switch
                value={data.presidentSignature}
                onValueChange={(v) => set('presidentSignature', v)}
                trackColor={{ true: colors.accent, false: colors.segment }}
                thumbColor={colors.onAccent}
              />
            </View>
          </Section>

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

function UsageChoice({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Usage;
  onChange: (v: Usage) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.usage}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        <Chip
          label="Non richiesto"
          variant="accent"
          active={value === 'no'}
          onPress={() => onChange(value === 'no' ? null : 'no')}
        />
        <Chip
          label="Richiesto e autorizzato"
          variant="accent"
          active={value === 'si'}
          onPress={() => onChange(value === 'si' ? null : 'si')}
        />
      </View>
    </View>
  );
}
