import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar/legacy';
import Storage from 'expo-sqlite/kv-store';
import { supabase } from '@/lib/supabase';
import { dateOf, isoOf } from '@/lib/calendario';
import { palette } from '@/theme/tokens';

const CALENDAR_KEY = 'calendario.turni.id';
const CALENDAR_TITLE = 'Turni circolo';
const DAYS_BACK = 7;
const DAYS_AHEAD = 120;

export type CalendarPermission = 'concesso' | 'negato' | 'da-chiedere';

const supported = Platform.OS !== 'web';

export async function calendarPermission(): Promise<CalendarPermission> {
  if (!supported) return 'negato';
  const status = await Calendar.getCalendarPermissionsAsync();
  if (status.granted) return 'concesso';
  return status.canAskAgain ? 'da-chiedere' : 'negato';
}

export async function askCalendarPermission(): Promise<CalendarPermission> {
  if (!supported) return 'negato';
  const status = await Calendar.requestCalendarPermissionsAsync();
  if (status.granted) return 'concesso';
  return status.canAskAgain ? 'da-chiedere' : 'negato';
}

async function sourceFor() {
  if (Platform.OS === 'ios') {
    const calendar = await Calendar.getDefaultCalendarAsync();
    return { sourceId: calendar.source.id, source: calendar.source };
  }
  return {
    source: { isLocalAccount: true, name: 'Tempo Libero', type: Calendar.SourceType.LOCAL },
  };
}

async function ensureCalendar() {
  const saved = Storage.getItemSync(CALENDAR_KEY);
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing = calendars.find((c) => c.id === saved) ?? calendars.find((c) => c.title === CALENDAR_TITLE);
  if (existing) {
    Storage.setItemSync(CALENDAR_KEY, existing.id);
    return existing.id;
  }
  const id = await Calendar.createCalendarAsync({
    title: CALENDAR_TITLE,
    name: 'turni-circolo',
    color: palette.pine,
    entityType: Calendar.EntityTypes.EVENT,
    ownerAccount: 'Tempo Libero',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
    ...(await sourceFor()),
  });
  Storage.setItemSync(CALENDAR_KEY, id);
  return id;
}

const utcMidnight = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

export async function syncShiftsToCalendar(orgId: string, personId: string) {
  if (!supported) return null;
  if ((await calendarPermission()) !== 'concesso') return null;
  const calendarId = await ensureCalendar();

  const from = isoOf(new Date(Date.now() - DAYS_BACK * 86_400_000));
  const to = isoOf(new Date(Date.now() + DAYS_AHEAD * 86_400_000));
  const { data, error } = await supabase
    .from('shifts')
    .select('shift_date')
    .eq('org_id', orgId)
    .eq('person_id', personId)
    .gte('shift_date', from)
    .lte('shift_date', to)
    .order('shift_date');
  if (error) throw error;

  const existing = await Calendar.getEventsAsync(
    [calendarId],
    utcMidnight(from),
    new Date(utcMidnight(to).getTime() + 86_400_000),
  );
  for (const event of existing) {
    await Calendar.deleteEventAsync(event.id);
  }

  for (const s of data ?? []) {
    const start = utcMidnight(s.shift_date);
    await Calendar.createEventAsync(calendarId, {
      title: 'Turno al circolo',
      startDate: start,
      endDate: new Date(start.getTime() + 86_400_000),
      allDay: true,
      timeZone: 'UTC',
      notes: `Turno di ${dateOf(s.shift_date).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}. Pro Loco Tempo Libero Vigne.`,
    });
  }
  return (data ?? []).length;
}

export async function removeShiftsCalendar() {
  if (!supported) return;
  const saved = Storage.getItemSync(CALENDAR_KEY);
  if (!saved) return;
  try {
    await Calendar.deleteCalendarAsync(saved);
  } finally {
    Storage.removeItemSync(CALENDAR_KEY);
  }
}
