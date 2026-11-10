
import { supabase } from '@/lib/supabase';
import { useStyles } from '@/styles/screens/login';
import { useTheme } from '@/theme/tokens';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Step = 'email' | 'code';
type LoginMode = 'otp' | 'password';

export default function Login() {
  const styles = useStyles();
  const { colors, type } = useTheme();

  const [mode, setMode] = useState<LoginMode>('otp');
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanEmail = email.trim().toLowerCase();

  function changeMode(nextMode: LoginMode) {
    if (busy) return;

    setMode(nextMode);
    setStep('email');
    setCode('');
    setPassword('');
    setError(null);
  }

  async function sendCode() {
    if (!canSend) return;

    setBusy(true);
    setError(null);

    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { shouldCreateUser: false },
      });

      if (authError) {
        setError(
          authError.status === 429
            ? 'Troppi tentativi. Aspetta un minuto e riprova.'
            : 'Impossibile inviare il codice. Verifica l’indirizzo email o contatta un amministratore.',
        );
        return;
      }

      setStep('code');
    } catch {
      setError('Errore di connessione. Riprova.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (!canVerify) return;

    setBusy(true);
    setError(null);

    try {
      const { error: authError } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: code.trim(),
        type: 'email',
      });

      if (authError) {
        setError('Codice non valido o scaduto. Richiedine uno nuovo.');
      }
    } catch {
      setError('Errore di connessione. Riprova.');
    } finally {
      setBusy(false);
    }
  }

  async function signInWithPassword() {
    if (!canSignIn) return;

    setBusy(true);
    setError(null);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (authError) {
        setError(
          authError.status === 429
            ? 'Troppi tentativi. Riprova più tardi.'
            : 'Email o password non corretti.',
        );
      }
    } catch {
      setError('Errore di connessione. Riprova.');
    } finally {
      setBusy(false);
    }
  }

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
  const canSend = validEmail && !busy;
  const canVerify = code.trim().length >= 6 && !busy;
  const canSignIn = validEmail && password.length > 0 && !busy;

  const isCodeStep = mode === 'otp' && step === 'code';

  const canSubmit =
    mode === 'password'
      ? canSignIn
      : isCodeStep
        ? canVerify
        : canSend;

  function submit() {
    if (mode === 'password') {
      void signInWithPassword();
    } else if (isCodeStep) {
      void verifyCode();
    } else {
      void sendCode();
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Image
              source={require('@/assets/images/logo-proloco.png')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Pro Loco Tempo Libero Vigne"
            />

            <Text style={styles.subtitle}>
              {mode === 'password'
                ? 'Accedi con la tua email e password.'
                : isCodeStep
                  ? `Abbiamo mandato un codice a ${cleanEmail}.`
                  : 'Accedi con la tua email: ti mandiamo un codice.'}
            </Text>
          </View>

          {!isCodeStep && (
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
                returnKeyType={mode === 'password' ? 'next' : 'send'}
                onSubmitEditing={() => {
                  if (mode === 'otp' && canSend) void sendCode();
                }}
                style={styles.input}
              />
            </View>
          )}

          {isCodeStep && (
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
                onSubmitEditing={() => {
                  if (canVerify) void verifyCode();
                }}
                style={[styles.input, styles.codeInput]}
              />
            </View>
          )}

          {mode === 'password' && (
            <View style={styles.field}>
              <Text style={type.label}>Password</Text>

              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Inserisci la password"
                placeholderTextColor={colors.muted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (canSignIn) void signInWithPassword();
                }}
                style={styles.input}
              />
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.button,
              !canSubmit && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.buttonText}>
                {mode === 'password'
                  ? 'Accedi'
                  : isCodeStep
                    ? 'Verifica codice'
                    : 'Mandami il codice'}
              </Text>
            )}
          </Pressable>

          {isCodeStep && (
            <Pressable
              onPress={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
              disabled={busy}
              style={styles.linkButton}
            >
              <Text style={styles.link}>Cambia email</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => changeMode(mode === 'otp' ? 'password' : 'otp')}
            disabled={busy}
            style={styles.linkButton}
          >
            <Text style={styles.link}>
              {mode === 'otp'
                ? 'Accedi con password'
                : 'Accedi con codice email'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
