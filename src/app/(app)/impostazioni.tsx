import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import {
  readNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/preferenze';
import {
  askPermission,
  notificationsAvailable,
  openSystemSettings,
  permissionState,
  rescheduleReminders,
  sendTestNotification,
  type PermissionState,
} from '@/lib/notifiche';
import { askCalendarPermission, removeShiftsCalendar, syncShiftsToCalendar } from '@/lib/calendarioTelefono';
import { personLabel } from '@/lib/turni';
import { ROLE_LABEL, useMyShiftPerson, useRole } from '@/lib/ruoli';
import { useAuth, useMembership } from '@/providers/AuthProvider';
import { Chip } from '@/components/Chip';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/screens/impostazioni';

export default function Impostazioni() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const { session } = useAuth();
  const membership = useMembership();
  const { orgId, userId, role, isAdmin, isConsigliere } = useRole();
  const person = useMyShiftPerson(orgId, userId, isConsigliere);
  const personId = person.data?.id ?? null;

  const [prefs, setPrefs] = useState<NotificationPreferences>(readNotificationPreferences);
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [scheduled, setScheduled] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [remindersError, setRemindersError] = useState(false);
  const [calendarCount, setCalendarCount] = useState<number | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  useEffect(() => {
    permissionState().then(setPermission);
  }, []);

  async function apply(next: NotificationPreferences) {
    setPrefs(next);
    saveNotificationPreferences(next);
    if (!orgId) return;
    setSyncing(true);
    try {
      setScheduled(await rescheduleReminders({ orgId, personId, isConsigliere }, next));
      setRemindersError(false);
    } catch {
      setScheduled(null);
      setRemindersError(true);
    } finally {
      setSyncing(false);
    }
  }

  const update = <K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) =>
    apply({ ...prefs, [key]: value });

  async function toggleCalendar(value: boolean) {
    setCalendarError(null);
    if (!value) {
      await apply({ ...prefs, calendarSync: false });
      await removeShiftsCalendar().catch(() => undefined);
      setCalendarCount(null);
      return;
    }
    const state = await askCalendarPermission();
    if (state !== 'concesso') {
      setCalendarError(
        state === 'negato'
          ? 'Hai negato l’accesso al calendario: riattivalo dalle impostazioni del telefono.'
          : 'Serve il permesso per scrivere nel calendario.',
      );
      return;
    }
    await apply({ ...prefs, calendarSync: true });
    if (!orgId || !personId) return;
    try {
      setCalendarCount(await syncShiftsToCalendar(orgId, personId));
    } catch {
      setCalendarError('Non riesco a scrivere nel calendario del telefono. Riprova.');
    }
  }

  async function enable() {
    const state = await askPermission();
    setPermission(state);
    if (state === 'concesso') await apply(prefs);
  }

  async function testNotification() {
    const ok = await sendTestNotification();
    if (!ok) {
      Alert.alert(
        'Notifica non inviata',
        'In Expo Go questo telefono non permette di programmare le notifiche. Funzioneranno con l’app installata.',
      );
    }
  }

  function logout() {
    Alert.alert('Uscire dall’account?', 'Per rientrare ti servirà di nuovo il codice via email.', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Esci', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  const name = membership.data?.display_name || session?.user.email || '';
  const enabled = permission === 'concesso';
  const available = notificationsAvailable();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={type.title}>Impostazioni</Text>

        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(name[0] ?? '?').toUpperCase()}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={type.body} numberOfLines={1}>
              {name}
            </Text>
            <Text style={type.caption} numberOfLines={1}>
              {[session?.user.email !== name ? session?.user.email : null, role ? ROLE_LABEL[role] : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>

        {isConsigliere && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>I miei turni</Text>
            <View style={styles.card}>
              <View style={[styles.toggle, styles.divider]}>
                <View style={styles.toggleIcon}>
                  <Ionicons name="person-outline" size={18} color={colors.accent} />
                </View>
                <View style={styles.flex}>
                  <Text style={type.body}>
                    {person.isLoading
                      ? '…'
                      : person.data
                        ? personLabel(person.data)
                        : 'Nessun nome collegato'}
                  </Text>
                  <Text style={type.caption}>
                    {person.data
                      ? 'Il tuo nome nel calendario dei turni'
                      : 'Chiedi a chi ha creato il tuo account di collegarlo al tuo nome nei turni'}
                  </Text>
                </View>
              </View>
              <ToggleRow
                icon="calendar-outline"
                title="Calendario del telefono"
                caption={
                  !personId
                    ? 'Disponibile quando il tuo account è collegato'
                    : prefs.calendarSync && calendarCount != null
                      ? `${calendarCount} ${calendarCount === 1 ? 'turno' : 'turni'} nel calendario “Turni circolo”`
                      : 'I tuoi turni nel calendario, sempre aggiornati'
                }
                value={prefs.calendarSync && !!personId}
                onChange={toggleCalendar}
                disabled={!personId}
                last
              />
            </View>
            {calendarError && <Text style={styles.warnText}>{calendarError}</Text>}
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Notifiche</Text>
            {syncing && <ActivityIndicator size="small" color={colors.accent} />}
          </View>

          {!available && (
            <View style={styles.permission}>
              <Ionicons name="alert-circle-outline" size={22} color={colors.warn} />
              <View style={styles.flex}>
                <Text style={type.body}>Notifiche non disponibili</Text>
                <Text style={type.caption}>
                  In questa versione dell’app le notifiche non si sono caricate. Il resto funziona
                  normalmente.
                </Text>
              </View>
            </View>
          )}

          {available && permission && !enabled && (
            <View style={styles.permission}>
              <Ionicons name="notifications-off-outline" size={22} color={colors.warn} />
              <View style={styles.flex}>
                <Text style={type.body}>Le notifiche sono spente</Text>
                <Text style={type.caption}>
                  {permission === 'negato'
                    ? 'Le hai bloccate: riattivale dalle impostazioni del telefono.'
                    : 'Attivale per ricevere i promemoria che scegli qui sotto.'}
                </Text>
              </View>
              <Pressable
                onPress={permission === 'negato' ? openSystemSettings : enable}
                style={({ pressed }) => [styles.permissionButton, pressed && styles.pressed]}
              >
                <Text style={styles.permissionText}>{permission === 'negato' ? 'Apri' : 'Attiva'}</Text>
              </Pressable>
            </View>
          )}

          {isConsigliere && (
            <>
              <Text style={styles.groupTitle}>Promemoria</Text>
              <View style={[styles.card, !enabled && styles.dimmed]}>
                <ToggleRow
                  icon="person-outline"
                  title="Il mio turno al circolo"
                  caption={personId ? 'Ti ricorda quando tocca a te' : 'Serve il nome collegato nei turni'}
                  value={prefs.shifts}
                  onChange={(v) => update('shifts', v)}
                />
                {prefs.shifts && (
                  <View style={[styles.sub, styles.subFirst]}>
                    <Text style={styles.subLabel}>Quando</Text>
                    <View style={styles.chips}>
                      <Chip
                        label="La sera prima, alle 18"
                        variant="accent"
                        active={prefs.shiftWhen === 'sera'}
                        onPress={() => update('shiftWhen', 'sera')}
                      />
                      <Chip
                        label="La mattina, alle 9"
                        variant="accent"
                        active={prefs.shiftWhen === 'mattina'}
                        onPress={() => update('shiftWhen', 'mattina')}
                      />
                    </View>
                  </View>
                )}
                <ToggleRow
                  icon="share-social-outline"
                  title="Mandare i turni ai consiglieri"
                  caption="Il 30 del mese alle 18 (a febbraio l’ultimo giorno), con il file del mese dopo pronto"
                  value={prefs.monthlyShare}
                  onChange={(v) => update('monthlyShare', v)}
                />
                <ToggleRow
                  icon="key-outline"
                  title="Affitti di domani"
                  caption="La sera prima: chi arriva, a che ora, le chiavi"
                  value={prefs.rentals}
                  onChange={(v) => update('rentals', v)}
                />
                <ToggleRow
                  icon="cash-outline"
                  title="Saldi da incassare"
                  caption="Il giorno dopo un affitto non ancora saldato"
                  value={prefs.balances}
                  onChange={(v) => update('balances', v)}
                  last
                />
              </View>
              {enabled && remindersError && (
                <Text style={styles.warnText}>
                  Non riesco a programmare i promemoria su questo telefono con Expo Go: funzioneranno con
                  l’app installata.
                </Text>
              )}
              {enabled && scheduled != null && (
                <Text style={type.caption}>
                  {scheduled === 0
                    ? 'Nessun promemoria nei prossimi 45 giorni.'
                    : `${scheduled} ${scheduled === 1 ? 'promemoria programmato' : 'promemoria programmati'} nei prossimi 45 giorni.`}
                </Text>
              )}
            </>
          )}

          <View style={styles.groupHead}>
            <Text style={styles.groupTitle}>Avvisi dagli altri</Text>
            <Text style={styles.badge}>Con l’app installata</Text>
          </View>
          <View style={[styles.card, styles.dimmed]}>
            {isConsigliere && (
              <ToggleRow
                icon="alert-circle-outline"
                title="Prodotti sotto scorta"
                caption="Quando qualcosa scende sotto la scorta minima"
                value={prefs.lowStock}
                onChange={(v) => update('lowStock', v)}
              />
            )}
            <ToggleRow
              icon="cart-outline"
              title="Novità nelle liste"
              caption="Quando qualcuno aggiunge voci o registra una spesa"
              value={prefs.listChanges}
              onChange={(v) => update('listChanges', v)}
              last={!isConsigliere}
            />
            {isConsigliere && (
              <ToggleRow
                icon="wallet-outline"
                title="Rimborsi da fare"
                caption="Quando un volontario anticipa una spesa"
                value={prefs.refunds}
                onChange={(v) => update('refunds', v)}
                last
              />
            )}
          </View>
          <Text style={type.caption}>
            Questi avvisi arrivano dal server: le scelte vengono salvate e si attiveranno con la versione
            installata dell’app.
          </Text>

          {enabled && (
            <Pressable
              onPress={testNotification}
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            >
              <Ionicons name="notifications-outline" size={18} color={colors.accent} />
              <Text style={styles.secondaryText}>Prova una notifica</Text>
            </Pressable>
          )}
        </View>

        {isAdmin && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Associazione</Text>
            <Pressable
              onPress={() => router.push('/membri')}
              style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
            >
              <Ionicons name="people-outline" size={20} color={colors.accent} />
              <Text style={[styles.flex, styles.linkText]}>Account di consiglieri e volontari</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Pressable onPress={logout} style={({ pressed }) => [styles.logout, pressed && styles.pressed]}>
            <Ionicons name="log-out-outline" size={20} color={colors.warn} />
            <Text style={styles.logoutText}>Esci dall’account</Text>
          </Pressable>
        </View>

        <Text style={[type.caption, styles.footer]}>Tempo Libero · Pro Loco Tempo Libero Vigne APS</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({
  icon,
  title,
  caption,
  value,
  onChange,
  last,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  caption: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
  disabled?: boolean;
}) {
  const styles = useStyles();
  const { colors, type } = useTheme();
  return (
    <View style={[styles.toggle, !last && styles.divider]}>
      <View style={styles.toggleIcon}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <View style={styles.flex}>
        <Text style={type.body}>{title}</Text>
        <Text style={type.caption}>{caption}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.accent, false: colors.segment }}
        thumbColor={colors.onAccent}
      />
    </View>
  );
}
