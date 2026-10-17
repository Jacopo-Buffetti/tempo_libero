import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { colors, font, radius, space, touch, type } from '@/theme/tokens';

type Step = 'email' | 'code';

export default function Login() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanEmail = email.trim().toLowerCase();

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { shouldCreateUser: false }, // solo utenti invitati
    });
    setBusy(false);

    if (error) {
      setError(
        error.status === 429
          ? 'Troppi tentativi. Aspetta un minuto e riprova.'
          : 'Questa email non risulta tra i volontari. Chiedi a un amministratore di invitarti.',
      );
      return;
    }
    setStep('code');
  }

  async function verifyCode() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);

    // Se va a buon fine, la sessione cambia e il layout porta all'app da solo
    if (error) setError('Codice non valido o scaduto. Richiedine uno nuovo.');
  }

  const canSend = cleanEmail.includes('@') && !busy;
  const canVerify = code.trim().length >= 6 && !busy;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={type.title}>Pro Loco</Text>
          <Text style={styles.subtitle}>
            {step === 'email'
              ? 'Accedi con la tua email: ti mandiamo un codice.'
              : `Abbiamo mandato un codice a ${cleanEmail}.`}
          </Text>
        </View>

        {step === 'email' ? (
          <View style={styles.field}>
            <Text style={type.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="nome@esempio.it"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={() => canSend && sendCode()}
              style={styles.input}
            />
          </View>
        ) : (
          <View style={styles.field}>
            <Text style={type.label}>Codice</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={10}
              returnKeyType="done"
              onSubmitEditing={() => canVerify && verifyCode()}
              style={[styles.input, styles.codeInput]}
            />
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          onPress={step === 'email' ? sendCode : verifyCode}
          disabled={step === 'email' ? !canSend : !canVerify}
          style={({ pressed }) => [
            styles.button,
            (step === 'email' ? !canSend : !canVerify) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>{step === 'email' ? 'Mandami il codice' : 'Accedi'}</Text>
          )}
        </Pressable>

        {step === 'code' && (
          <Pressable
            onPress={() => {
              setStep('email');
              setCode('');
              setError(null);
            }}
            style={styles.linkButton}
          >
            <Text style={styles.link}>Cambia email</Text>
          </Pressable>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: space(5), justifyContent: 'center', gap: space(4) },
  header: { gap: space(2), marginBottom: space(4) },
  subtitle: { fontFamily: font.medium, fontSize: 16, color: colors.muted, lineHeight: 22 },
  field: { gap: space(1.5) },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space(4),
    fontFamily: font.bold,
    fontSize: 16,
    color: colors.text,
  },
  codeInput: { fontFamily: font.black, fontSize: 22, letterSpacing: 6 },
  error: { fontFamily: font.bold, fontSize: 14, color: colors.warn },
  button: {
    height: 54,
    minHeight: touch,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.85 },
  buttonText: { fontFamily: font.black, fontSize: 16, color: '#FFFFFF' },
  linkButton: { minHeight: touch, alignItems: 'center', justifyContent: 'center' },
  link: { fontFamily: font.bold, fontSize: 15, color: colors.accent },
});
