import { useEffect } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { addMonths, dateOf, isoOf, monthTitle, todayIso } from '@/lib/calendario';
import { syncShiftsToCalendar } from '@/lib/calendarioTelefono';
import { clientName, paymentState, spaceLabel, timeRange, type Rental } from '@/lib/affitti';
import { formatEuro } from '@/lib/spesa';
import { readNotificationPreferences, type NotificationPreferences } from '@/lib/preferenze';
import { useMyShiftPerson, useRole } from '@/lib/ruoli';

const CHANNEL = 'promemoria';
const MAX_SCHEDULED = 60;
const DAYS_AHEAD = 45;

type NativeNotifications = typeof import('@/lib/notificheNative');

let loaded: NativeNotifications | null | undefined;

function native(): NativeNotifications | null {
  if (loaded !== undefined) return loaded;
  try {
    loaded = require('@/lib/notificheNative') as NativeNotifications;
    loaded.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    loaded = null;
  }
  return loaded;
}

export const notificationsAvailable = () => native() !== null;

let channelReady: boolean | null = null;

async function channel(Notifications: NativeNotifications) {
  if (Platform.OS !== 'android') return {};
  if (channelReady === null) {
    try {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Promemoria',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
      channelReady = true;
    } catch {
      channelReady = false;
    }
  }
  return channelReady ? { channelId: CHANNEL } : {};
}

export type PermissionState = 'concesso' | 'negato' | 'da-chiedere';

export async function permissionState(): Promise<PermissionState> {
  const Notifications = native();
  if (!Notifications) return 'negato';
  const status = await Notifications.getPermissionsAsync();
  if (status.granted) return 'concesso';
  return status.canAskAgain ? 'da-chiedere' : 'negato';
}

export async function askPermission(): Promise<PermissionState> {
  const Notifications = native();
  if (!Notifications) return 'negato';
  await channel(Notifications);
  const status = await Notifications.requestPermissionsAsync();
  if (status.granted) return 'concesso';
  return status.canAskAgain ? 'da-chiedere' : 'negato';
}

export const openSystemSettings = () => Linking.openSettings();

const at = (iso: string, hour: number, minute = 0) => {
  const d = dateOf(iso);
  d.setHours(hour, minute, 0, 0);
  return d;
};

const dayBefore = (iso: string) => isoOf(new Date(dateOf(iso).getTime() - 86_400_000));
const dayAfter = (iso: string) => isoOf(new Date(dateOf(iso).getTime() + 86_400_000));

type Planned = { when: Date; title: string; body: string; url: string };

export type ReminderContext = { orgId: string; personId: string | null; isConsigliere: boolean };

async function plannedShifts(ctx: ReminderContext, prefs: NotificationPreferences): Promise<Planned[]> {
  if (!prefs.shifts || !ctx.personId) return [];
  const from = todayIso();
  const to = isoOf(new Date(Date.now() + (DAYS_AHEAD + 1) * 86_400_000));
  const { data, error } = await supabase
    .from('shifts')
    .select('shift_date')
    .eq('org_id', ctx.orgId)
    .eq('person_id', ctx.personId)
    .gte('shift_date', from)
    .lte('shift_date', to);
  if (error) throw error;
  return (data ?? []).map((s) => {
    const evening = prefs.shiftWhen === 'sera';
    const day = dateOf(s.shift_date).toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return {
      when: evening ? at(dayBefore(s.shift_date), 18) : at(s.shift_date, 9),
      title: evening ? 'Domani sei di turno al circolo' : 'Oggi sei di turno al circolo',
      body: `Turno di ${day}.`,
      url: '/calendario',
    };
  });
}

async function plannedRentals(ctx: ReminderContext, prefs: NotificationPreferences): Promise<Planned[]> {
  if (!ctx.isConsigliere || (!prefs.rentals && !prefs.balances)) return [];
  const from = isoOf(new Date(Date.now() - 30 * 86_400_000));
  const to = isoOf(new Date(Date.now() + (DAYS_AHEAD + 1) * 86_400_000));
  const { data, error } = await supabase
    .from('rentals')
    .select(
      'id, space, client_id, rent_date, end_date, start_time, end_time, price_cents, deposit_cents, deposit_paid, balance_paid, notes, clients(id, first_name, last_name, phone)',
    )
    .eq('org_id', ctx.orgId)
    .lte('rent_date', to)
    .gte('end_date', from);
  if (error) throw error;

  const out: Planned[] = [];
  (data as unknown as Rental[]).forEach((r) => {
    const who = clientName(r.clients);
    if (prefs.rentals) {
      out.push({
        when: at(dayBefore(r.rent_date), 18),
        title: `Domani: ${spaceLabel(r.space)}`,
        body: `Affittata a ${who} · ${timeRange(r)}. Ricordati le chiavi e il verbale di consegna.`,
        url: `/calendario/affitto?id=${r.id}`,
      });
    }
    const due = paymentState(r).due;
    if (prefs.balances && due > 0) {
      out.push({
        when: at(dayAfter(r.end_date), 10),
        title: 'Saldo da incassare',
        body: `${who} deve ancora ${formatEuro(due)} per ${spaceLabel(r.space)}.`,
        url: `/calendario/affitto?id=${r.id}`,
      });
    }
  });
  return out;
}

function plannedMonthlyShare(ctx: ReminderContext, prefs: NotificationPreferences): Planned[] {
  if (!ctx.isConsigliere || !prefs.monthlyShare) return [];
  const thisMonth = todayIso().slice(0, 7);
  return [0, 1, 2].map((offset) => {
    const month = addMonths(thisMonth, offset);
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const day = Math.min(30, lastDay);
    const next = addMonths(month, 1);
    return {
      when: at(`${month}-${String(day).padStart(2, '0')}`, 18),
      title: `Manda i turni di ${monthTitle(next).split(' ')[0].toLowerCase()}`,
      body: 'Tocca qui: il file è pronto da condividere nel gruppo dei consiglieri.',
      url: `/calendario/esporta?month=${next}`,
    };
  });
}

export async function rescheduleReminders(ctx: ReminderContext, prefs: NotificationPreferences) {
  const Notifications = native();
  if (!Notifications || (await permissionState()) !== 'concesso') return 0;
  await channel(Notifications);

  const [shifts, rentals] = await Promise.all([plannedShifts(ctx, prefs), plannedRentals(ctx, prefs)]);
  const now = Date.now();
  const upcoming = [...plannedMonthlyShare(ctx, prefs), ...shifts, ...rentals]
    .filter((p) => p.when.getTime() > now + 60_000)
    .sort((a, b) => a.when.getTime() - b.when.getTime())
    .slice(0, MAX_SCHEDULED);

  const target = await channel(Notifications);
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const p of upcoming) {
    await Notifications.scheduleNotificationAsync({
      content: { title: p.title, body: p.body, data: { url: p.url } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.when, ...target },
    });
  }
  return upcoming.length;
}

export async function sendTestNotification() {
  const Notifications = native();
  if (!Notifications) return false;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Le notifiche funzionano',
        body: 'Riceverai qui i promemoria di Tempo Libero.',
        data: { url: '/impostazioni' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 3,
        ...(await channel(Notifications)),
      },
    });
    return true;
  } catch {
    return false;
  }
}

export function onNotificationOpened(navigate: (url: string) => void) {
  const Notifications = native();
  if (!Notifications) return () => undefined;
  const handle = (response: import('@/lib/notificheNative').NotificationResponse | null) => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url === 'string') navigate(url);
  };
  handle(Notifications.getLastNotificationResponse());
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  return () => subscription.remove();
}

export function useReminders() {
  const { orgId, userId, isConsigliere } = useRole();
  const person = useMyShiftPerson(orgId, userId, isConsigliere);
  const personId = person.data?.id ?? null;

  useEffect(() => {
    if (!orgId) return;
    const ctx = { orgId, personId, isConsigliere };
    const sync = () => {
      const prefs = readNotificationPreferences();
      rescheduleReminders(ctx, prefs).catch(() => undefined);
      if (prefs.calendarSync && personId) {
        syncShiftsToCalendar(orgId, personId).catch(() => undefined);
      }
    };
    sync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => subscription.remove();
  }, [orgId, personId, isConsigliere]);

  useEffect(() => onNotificationOpened((url) => router.push(url as never)), []);
}
