import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { colors, type } from '@/theme/tokens';
import { styles } from '@/styles/screens/login';

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
      options: { shouldCreateUser: false },
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

    if (error) setError('Codice non valido o scaduto. Richiedine uno nuovo.');
  }

  const canSend = cleanEmail.includes('@') && !busy;
  const canVerify = code.trim().length >= 6 && !busy;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Image
            source={require('@/assets/images/logo-proloco.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Pro Loco Tempo Libero Vigne"
          />
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
            <ActivityIndicator color={colors.onAccent} />
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
