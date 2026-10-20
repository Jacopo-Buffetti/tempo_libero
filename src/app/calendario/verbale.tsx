import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { useClient, useRental } from '@/lib/affitti';
import {
  CHECK_AFTER,
  CHECK_BEFORE,
  contractDefaults,
  handoverDefaults,
  handoverHtml,
  printHtml,
  sharePdf,
  useContract,
  useSaveContract,
  type ContractData,
  type DepositOutcome,
  type HandoverData,
} from '@/lib/contratto';
import { errorMessage } from '@/lib/spesa';
import { Chip } from '@/components/Chip';
import { DateTimeField } from '@/components/DateTimeField';
import { TimeField } from '@/components/TimeField';
import { Field, MoneyField, Section } from '@/components/FormField';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/screens/verbale';

type Step = 'consegna' | 'riconsegna';

export default function Verbale() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const { rentalId } = useLocalSearchParams<{ rentalId: string }>();
  const rental = useRental(rentalId);
  const client = useClient(rental.data?.client_id);
  const record = useContract(rentalId);
  const save = useSaveContract(rentalId);

  const [contract, setContract] = useState<ContractData | null>(null);
  const [data, setData] = useState<HandoverData | null>(null);
  const [step, setStep] = useState<Step>('consegna');
  const [busy, setBusy] = useState<'pdf' | 'stampa' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data || !rental.data || !record.data || client.isLoading) return;
    const c = {
      ...contractDefaults(rental.data, (client.data as Record<string, string | null> | null) ?? null),
      ...record.data.contract,
    };
    setContract(c);
    const h = { ...handoverDefaults(c, rental.data), ...record.data.handover };
    setData(h);
    if (Object.keys(record.data.handover.before ?? {}).length > 0) setStep('riconsegna');
  }, [data, rental.data, record.data, client.isLoading, client.data]);

  if (!data || !contract || !record.data) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        {record.isError ? (
          <Text style={styles.error}>{errorMessage(record.error, 'Non riesco ad aprire il verbale.')}</Text>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </SafeAreaView>
    );
  }

  const set = <K extends keyof HandoverData>(key: K, value: HandoverData[K]) =>
    setData((d) => (d ? { ...d, [key]: value } : d));
  const setCheck = (group: 'before' | 'after', key: string, value: string) =>
    setData((d) => (d ? { ...d, [group]: { ...d[group], [key]: value } } : d));

  const fullName = [contract.firstName, contract.lastName].filter((x) => x.trim()).join(' ');

  async function persist() {
    await save.mutateAsync({ id: record.data!.id, handover: data! });
  }

  async function run(kind: 'pdf' | 'stampa') {
    setError(null);
    setBusy(kind);
    try {
      await persist();
      const html = handoverHtml(data!, contract!, record.data!.number);
      if (kind === 'pdf') await sharePdf(html, `Verbale ${record.data!.number} ${fullName}`);
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

  const outcomes: { value: Exclude<DepositOutcome, null>; label: string }[] = [
    { value: 'integrale', label: 'Restituito tutto' },
    { value: 'parziale', label: 'Restituito in parte' },
    { value: 'dopo', label: 'Dopo verifica' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Indietro</Text>
        </Pressable>
        <Pressable onPress={saveOnly} disabled={save.isPending} style={styles.back} hitSlop={8}>
          <Text style={[styles.backText, styles.right]}>Salva</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={type.label}>Allegato A · accordo n. {record.data.number}</Text>
            <Text style={type.title}>Verbale della sala</Text>
            <Text style={type.caption}>{fullName || 'Richiedente non ancora indicato nel contratto'}</Text>
          </View>

          <View style={styles.segment}>
            {(
              [
                { value: 'consegna', label: 'A · Consegna' },
                { value: 'riconsegna', label: 'B · Riconsegna' },
              ] as const
            ).map((s) => (
              <Pressable
                key={s.value}
                onPress={() => setStep(s.value)}
                accessibilityRole="tab"
                accessibilityState={{ selected: step === s.value }}
                style={[styles.segmentItem, step === s.value && styles.segmentItemActive]}
              >
                <Text style={[styles.segmentText, step === s.value && styles.segmentTextActive]}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {step === 'consegna' ? (
            <>
              <Section title="Consegna dei locali">
                <View style={styles.card}>
                  <TimeField
                    label="Ore della consegna"
                    value={data.deliveryTime}
                    onChange={(v) => set('deliveryTime', v)}
                  />
                </View>
              </Section>

              <Section
                title="Stato dei locali alla consegna"
                hint="Lascia vuoto quello che è in ordine o che compilerai a penna."
              >
                {CHECK_BEFORE.map((r) => (
                  <CheckRow
                    key={r.key}
                    label={r.label}
                    value={data.before[r.key] ?? ''}
                    onChange={(v) => setCheck('before', r.key, v)}
                  />
                ))}
              </Section>

              <YesNo
                label="Fotografie iniziali"
                value={data.photosBefore}
                onChange={(v) => set('photosBefore', v)}
              />
              <Field
                label="Note"
                value={data.notesBefore}
                onChangeText={(v) => set('notesBefore', v)}
                multiline
              />
            </>
          ) : (
            <>
              <Section title="Riconsegna dei locali">
                <View style={styles.card}>
                  <TimeField
                    label="Ore della riconsegna"
                    value={data.returnTime}
                    onChange={(v) => set('returnTime', v)}
                  />
                </View>
              </Section>

              <Section title="Stato dei locali alla riconsegna">
                {CHECK_AFTER.map((r) => (
                  <CheckRow
                    key={r.key}
                    label={r.label}
                    value={data.after[r.key] ?? ''}
                    onChange={(v) => setCheck('after', r.key, v)}
                  />
                ))}
              </Section>

              <YesNo
                label="Fotografie finali"
                value={data.photosAfter}
                onChange={(v) => set('photosAfter', v)}
              />
              <Field
                label="Note e descrizione di eventuali danni o interventi necessari"
                value={data.notesAfter}
                onChangeText={(v) => set('notesAfter', v)}
                multiline
              />

              <Section title="Deposito cauzionale">
                <View style={styles.card}>
                  <View style={styles.pad}>
                    <MoneyField
                      label="Importo del deposito"
                      value={data.deposit}
                      onChangeText={(v) => set('deposit', v)}
                    />
                  </View>
                </View>
                <View style={styles.chips}>
                  {outcomes.map((o) => (
                    <Chip
                      key={o.value}
                      label={o.label}
                      variant="accent"
                      active={data.depositOutcome === o.value}
                      onPress={() => set('depositOutcome', data.depositOutcome === o.value ? null : o.value)}
                    />
                  ))}
                </View>
                {data.depositOutcome === 'parziale' && (
                  <View style={styles.card}>
                    <View style={styles.pad}>
                      <MoneyField
                        label="Importo restituito"
                        value={data.partialAmount}
                        onChangeText={(v) => set('partialAmount', v)}
                      />
                    </View>
                  </View>
                )}
                <Field
                  label="Motivazione e importi eventualmente trattenuti"
                  value={data.reasons}
                  onChangeText={(v) => set('reasons', v)}
                  multiline
                />
              </Section>

              <DateTimeField
                date={data.date}
                time={null}
                onChangeDate={(d) => set('date', d)}
                withTime={false}
                label="Data"
              />
            </>
          )}

          <View style={[styles.card, styles.switchRow]}>
            <View style={styles.flex}>
              <Text style={type.body}>Firma del presidente</Text>
              <Text style={type.caption}>Come referente dell’Associazione</Text>
            </View>
            <Switch
              value={data.presidentSignature}
              onValueChange={(v) => set('presidentSignature', v)}
              trackColor={{ true: colors.accent, false: colors.segment }}
              thumbColor={colors.onAccent}
            />
          </View>

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

function CheckRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.check}>
      <Text style={styles.checkLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Stato / annotazioni"
        placeholderTextColor={colors.placeholder}
        multiline
        style={styles.checkInput}
      />
    </View>
  );
}

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  const styles = useStyles();
  const { type } = useTheme();
  return (
    <View style={styles.yesNo}>
      <Text style={[type.body, styles.flex]}>{label}</Text>
      <Chip
        label="Sì"
        variant="accent"
        active={value === true}
        onPress={() => onChange(value === true ? null : true)}
      />
      <Chip
        label="No"
        variant="accent"
        active={value === false}
        onPress={() => onChange(value === false ? null : false)}
      />
    </View>
  );
}
