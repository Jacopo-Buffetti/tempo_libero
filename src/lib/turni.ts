import { Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { addMonths, dateOf, isoOf, monthRange, monthTitle } from '@/lib/calendario';

export type Person = {
  id: string;
  name: string;
  nickname: string | null;
  active: boolean;
  position: number;
};

export type ShiftRow = { id: string; shift_date: string; person_id: string };

export const turniKeys = {
  all: ['turni'] as const,
  people: (orgId?: string) => ['turni', 'people', orgId] as const,
  range: (orgId?: string, from?: string, to?: string) => ['turni', 'range', orgId, from, to] as const,
};

export const personLabel = (p?: Pick<Person, 'name' | 'nickname'> | null) =>
  p ? (p.nickname ? `${p.name} (${p.nickname})` : p.name) : '—';
export const personShort = (p?: Pick<Person, 'name' | 'nickname'> | null) =>
  p ? (p.nickname ?? p.name) : '—';

export const isClosedDay = (iso: string) => dateOf(iso).getDay() === 6;
export const isHardDay = (iso: string) => [0, 5].includes(dateOf(iso).getDay());

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((dateOf(b).getTime() - dateOf(a).getTime()) / DAY);

function openDaysInMonth(iso: string) {
  const { from, to } = monthRange(iso.slice(0, 7));
  let n = 0;
  for (let d = dateOf(from); isoOf(d) <= to; d = new Date(d.getTime() + DAY)) if (!isClosedDay(isoOf(d))) n++;
  return n;
}

type Tally = {
  year: number;
  total: number;
  hard: number;
  fri: number;
  sun: number;
  lastAny: string | null;
  lastHard: string | null;
};

export function planShifts(people: Person[], from: string, to: string, history: ShiftRow[]) {
  const tally = new Map<string, Tally>();
  const reset = (year: number) =>
    people.forEach((p) => {
      const t = tally.get(p.id);
      tally.set(p.id, {
        year,
        total: 0,
        hard: 0,
        fri: 0,
        sun: 0,
        lastAny: t?.lastAny ?? null,
        lastHard: t?.lastHard ?? null,
      });
    });

  const startYear = dateOf(from).getFullYear();
  reset(startYear);

  const count = (s: { shift_date: string; person_id: string }, sameYear: boolean) => {
    const t = tally.get(s.person_id);
    if (!t) return;
    if (sameYear) {
      t.total++;
      if (isHardDay(s.shift_date)) {
        t.hard++;
        if (dateOf(s.shift_date).getDay() === 5) t.fri++;
        else t.sun++;
      }
    }
    if (!t.lastAny || s.shift_date > t.lastAny) t.lastAny = s.shift_date;
    if (isHardDay(s.shift_date) && (!t.lastHard || s.shift_date > t.lastHard)) t.lastHard = s.shift_date;
  };

  const past = history
    .filter((s) => s.shift_date < from)
    .sort((a, b) => a.shift_date.localeCompare(b.shift_date));
  past.forEach((s) => count(s, dateOf(s.shift_date).getFullYear() === startYear));

  const planned: { shift_date: string; person_id: string }[] = [];
  const monthCount = new Map<string, number>();
  let currentMonth = '';
  let currentYear = startYear;
  let previous: { shift_date: string; person_id: string } | null = past[past.length - 1] ?? null;

  for (let d = dateOf(from); isoOf(d) <= to; d = new Date(d.getTime() + DAY)) {
    const iso = isoOf(d);
    if (isClosedDay(iso)) continue;
    if (d.getFullYear() !== currentYear) {
      currentYear = d.getFullYear();
      reset(currentYear);
    }

    const month = iso.slice(0, 7);
    if (month !== currentMonth) {
      currentMonth = month;
      monthCount.clear();
      past
        .filter((s) => s.shift_date.startsWith(month))
        .forEach((s) => monthCount.set(s.person_id, (monthCount.get(s.person_id) ?? 0) + 1));
    }

    const cap = Math.ceil(openDaysInMonth(iso) / people.length);
    const hard = isHardDay(iso);
    const friday = d.getDay() === 5;
    const yesterday = previous && daysBetween(previous.shift_date, iso) === 1 ? previous.person_id : null;

    let pool = people.filter((p) => p.id !== yesterday);
    const underCap = pool.filter((p) => (monthCount.get(p.id) ?? 0) < cap);
    if (underCap.length) pool = underCap;
    if (!pool.length) pool = people;

    const since = (last: string | null) => (last ? daysBetween(last, iso) : 10_000);
    const key = (p: Person) => {
      const t = tally.get(p.id)!;
      const m = monthCount.get(p.id) ?? 0;
      return hard
        ? [t.hard, friday ? t.fri : t.sun, m, t.total, -since(t.lastHard), -since(t.lastAny), p.position]
        : [m, t.total, -since(t.lastAny), p.position];
    };
    const chosen = pool
      .map((p) => ({ p, k: key(p) }))
      .sort((a, b) => {
        for (let i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i];
        return 0;
      })[0].p;

    const shift = { shift_date: iso, person_id: chosen.id };
    planned.push(shift);
    count(shift, true);
    monthCount.set(chosen.id, (monthCount.get(chosen.id) ?? 0) + 1);
    previous = shift;
  }
  return planned;
}

export function usePeople(orgId?: string) {
  return useQuery({
    queryKey: turniKeys.people(orgId),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shift_people')
        .select('id, name, nickname, active, position')
        .eq('org_id', orgId!)
        .order('position');
      if (error) throw error;
      return data as Person[];
    },
  });
}

export function useShifts(orgId?: string, from?: string, to?: string) {
  return useQuery({
    queryKey: turniKeys.range(orgId, from, to),
    enabled: !!orgId && !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shifts')
        .select('id, shift_date, person_id')
        .eq('org_id', orgId!)
        .gte('shift_date', from!)
        .lte('shift_date', to!)
        .order('shift_date');
      if (error) throw error;
      return data as ShiftRow[];
    },
  });
}

function useInvalidateTurni() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: turniKeys.all });
}

export function useGenerateShifts(orgId?: string) {
  const invalidate = useInvalidateTurni();
  return useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      const { data: people, error: e1 } = await supabase
        .from('shift_people')
        .select('id, name, nickname, active, position')
        .eq('org_id', orgId!)
        .eq('active', true)
        .order('position');
      if (e1) throw e1;
      if (!people?.length) throw new Error('Aggiungi almeno un consigliere attivo.');

      const yearStart = `${dateOf(from).getFullYear()}-01-01`;
      const { data: history, error: e2 } = await supabase
        .from('shifts')
        .select('id, shift_date, person_id')
        .eq('org_id', orgId!)
        .gte('shift_date', yearStart)
        .lt('shift_date', from)
        .order('shift_date');
      if (e2) throw e2;

      const plan = planShifts(people as Person[], from, to, (history ?? []) as ShiftRow[]);

      const { error: e3 } = await supabase
        .from('shifts')
        .delete()
        .eq('org_id', orgId!)
        .gte('shift_date', from)
        .lte('shift_date', to);
      if (e3) throw e3;

      if (plan.length) {
        const { error: e4 } = await supabase
          .from('shifts')
          .insert(plan.map((s) => ({ ...s, org_id: orgId! })));
        if (e4) throw e4;
      }
      return plan.length;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
    },
  });
}

export function useAssignShift(orgId?: string) {
  const invalidate = useInvalidateTurni();
  return useMutation({
    mutationFn: async ({ date, personId }: { date: string; personId: string }) => {
      const { error } = await supabase
        .from('shifts')
        .upsert(
          { org_id: orgId!, shift_date: date, person_id: personId, updated_at: new Date().toISOString() },
          { onConflict: 'org_id,shift_date' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.selectionAsync();
      invalidate();
    },
  });
}

export function useSwapShifts() {
  const invalidate = useInvalidateTurni();
  return useMutation({
    mutationFn: async ({ first, second }: { first: string; second: string }) => {
      const { error } = await supabase.rpc('swap_shifts', { p_first: first, p_second: second });
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
    },
  });
}

export function useSavePerson(orgId?: string) {
  const invalidate = useInvalidateTurni();
  return useMutation({
    mutationFn: async (v: {
      id?: string;
      name?: string;
      nickname?: string | null;
      active?: boolean;
      position?: number;
    }) => {
      if (v.id) {
        const { id, ...changes } = v;
        const { error } = await supabase.from('shift_people').update(changes).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('shift_people').insert({
          org_id: orgId!,
          name: v.name!.trim(),
          nickname: v.nickname?.trim() || null,
          position: v.position ?? 99,
        });
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });
}

export async function shareMonth(month: string, shifts: ShiftRow[], people: Person[]) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const lines = [`📅 *TURNI DEL CIRCOLO*`, `*${monthTitle(month)}*`, '━━━━━━━━━━━━━━━━', ''];
  shifts.forEach((s) => {
    const d = dateOf(s.shift_date);
    const day = d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' }).replace('.', '');
    const name = personShort(byId.get(s.person_id));
    lines.push(isHardDay(s.shift_date) ? `*${day}* — *${name}*` : `${day} — ${name}`);
  });
  lines.push('', '_Il sabato il circolo è chiuso_', '', '🌞 _Pro Loco Tempo Libero Vigne_');
  await Share.share({ message: lines.join('\n') });
}

const ORG = 'Pro Loco Tempo Libero Vigne';

const icsText = (text: string) =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

const icsDate = (iso: string) => iso.replace(/-/g, '');

function foldLine(line: string) {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    parts.push(rest.slice(0, 73));
    rest = ` ${rest.slice(73)}`;
  }
  parts.push(rest);
  return parts.join('\r\n');
}

export function buildIcs(shifts: ShiftRow[], people: Person[], personId?: string) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const stamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const mine = personId ? shifts.filter((s) => s.person_id === personId) : shifts;
  const owner = personId ? byId.get(personId) : undefined;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${ORG}//Turni del circolo//IT`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(owner ? `Turni circolo · ${personShort(owner)}` : 'Turni del circolo')}`,
    'X-WR-TIMEZONE:Europe/Rome',
  ];

  mine.forEach((s) => {
    const next = isoOf(new Date(dateOf(s.shift_date).getTime() + DAY));
    const who = personLabel(byId.get(s.person_id));
    lines.push(
      'BEGIN:VEVENT',
      `UID:turno-${s.shift_date}${personId ? `-${personId}` : ''}@tempolibero-vigne`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(s.shift_date)}`,
      `DTEND;VALUE=DATE:${icsDate(next)}`,
      `SUMMARY:${icsText(personId ? 'Turno al circolo' : `Turno circolo · ${personShort(byId.get(s.person_id))}`)}`,
      `DESCRIPTION:${icsText(`Di turno: ${who}\n${ORG}`)}`,
      'TRANSP:TRANSPARENT',
    );
    if (personId) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${icsText('Domani sei di turno al circolo')}`,
        'TRIGGER:-PT6H',
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

const fileSafe = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

export async function shareIcs(
  month: string,
  months: number,
  shifts: ShiftRow[],
  people: Person[],
  personId?: string,
) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('Condivisione non disponibile su questo dispositivo');
  const owner = personId ? people.find((p) => p.id === personId) : undefined;
  const last = addMonths(month, months - 1);
  const name = [
    'turni',
    owner ? fileSafe(personShort(owner)) : 'circolo',
    months === 1 ? month : `${month}_${last}`,
  ].join('-');
  const file = new File(Paths.cache, `${name}.ics`);
  if (file.exists) file.delete();
  file.create();
  file.write(buildIcs(shifts, people, personId));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/calendar',
    UTI: 'com.apple.ical.ics',
    dialogTitle: owner ? `Turni di ${personShort(owner)}` : 'Turni del circolo',
  });
}
