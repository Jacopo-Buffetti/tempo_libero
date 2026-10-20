import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ROLE_LABEL, useManageMember, useMembers, useRole, type Role } from '@/lib/ruoli';
import { personLabel, usePeople } from '@/lib/turni';
import { Chip } from '@/components/Chip';
import { Field, Section } from '@/components/FormField';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/screens/membro';

const ROLES: Role[] = ['volontario', 'consigliere', 'admin'];

export default function Membro() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'nuovo';
  const { orgId, isAdmin } = useRole();
  const members = useMembers(orgId, isAdmin);
  const people = usePeople(orgId);
  const manage = useManageMember();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('volontario');
  const [personId, setPersonId] = useState<string | null>(null);
  const [ready, setReady] = useState(isNew);
  const [error, setError] = useState<string | null>(null);

  const current = (members.data ?? []).find((m) => m.user_id === id);

  useEffect(() => {
    if (ready || !current) return;
    setName(current.display_name ?? '');
    setEmail(current.email ?? '');
    setRole(current.role);
    setPersonId(current.shift_person_id);
    setReady(true);
  }, [ready, current]);

  const takenBy = new Map(
    (members.data ?? [])
      .filter((m) => m.shift_person_id && m.user_id !== id)
      .map((m) => [m.shift_person_id!, m]),
  );
  const freePeople = (people.data ?? []).filter((p) => p.active && !takenBy.has(p.id));
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const canSave = name.trim().length > 0 && (!isNew || emailOk) && !manage.isPending;

  async function save() {
    setError(null);
    try {
      if (isNew) {
        await manage.mutateAsync({
          action: 'crea',
          email: email.trim(),
          display_name: name.trim(),
          role,
          shift_person_id: role === 'volontario' ? null : personId,
        });
        Alert.alert(
          'Account creato',
          `${name.trim()} può accedere con ${email.trim()}: riceverà il codice via email.`,
        );
      } else {
        await manage.mutateAsync({
          action: 'modifica',
          user_id: id,
          display_name: name.trim(),
          role,
          shift_person_id: role === 'volontario' ? null : personId,
        });
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operazione non riuscita');
    }
  }

  function confirmDelete() {
    Alert.alert('Eliminare l’account?', `${name} non potrà più accedere all’app.`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: () =>
          manage.mutate(
            { action: 'elimina', user_id: id },
            {
              onSuccess: () => router.back(),
              onError: (e) => setError(e instanceof Error ? e.message : 'Eliminazione non riuscita'),
            },
          ),
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
          <Text style={styles.backText}>Account</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={type.title}>{isNew ? 'Nuovo account' : name}</Text>

          <Section title="Persona">
            <Field
              label="Nome"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              placeholder="Es. Marco Rossi"
            />
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              editable={isNew}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              hint={
                isNew ? 'Con questa email riceverà il codice per entrare.' : 'L’email non si può cambiare.'
              }
              warn={isNew && email.trim() && !emailOk ? 'Email non valida' : null}
            />
          </Section>

          <Section title="Ruolo">
            <View style={styles.chips}>
              {ROLES.map((r) => (
                <Chip
                  key={r}
                  label={ROLE_LABEL[r]}
                  variant="accent"
                  active={role === r}
                  onPress={() => setRole(r)}
                />
              ))}
            </View>
            <Text style={type.caption}>
              {role === 'volontario'
                ? 'Vede l’inventario senza modificarlo, crea e modifica liste e menù, elimina solo quelli creati da lui. Non vede il calendario.'
                : role === 'consigliere'
                  ? 'Può fare tutto: inventario, liste, menù, turni, affitti e contratti.'
                  : 'Come un consigliere, e in più crea e gestisce gli account.'}
            </Text>
          </Section>

          {role !== 'volontario' && (
            <Section
              title="Nome nei turni"
              hint="Così i suoi turni gli arrivano in automatico nel calendario e nei promemoria."
            >
              <View style={styles.chips}>
                <Chip label="Nessuno" variant="accent" active={!personId} onPress={() => setPersonId(null)} />
                {freePeople.map((p) => (
                  <Chip
                    key={p.id}
                    label={personLabel(p)}
                    variant="accent"
                    active={personId === p.id}
                    onPress={() => setPersonId(p.id)}
                  />
                ))}
              </View>
            </Section>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          {!isNew && (
            <Pressable onPress={confirmDelete} style={styles.deleteButton}>
              <Ionicons name="trash-outline" size={18} color={colors.warn} />
              <Text style={styles.deleteText}>Elimina l’account</Text>
            </Pressable>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={save}
            disabled={!canSave}
            style={({ pressed }) => [
              styles.primary,
              !canSave && styles.disabled,
              pressed && styles.primaryPressed,
            ]}
          >
            {manage.isPending ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.primaryText}>{isNew ? 'Crea l’account' : 'Salva'}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
