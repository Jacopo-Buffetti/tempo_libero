const pad = (n: number) => String(n).padStart(2, '0');

export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dateOf = (iso: string) => new Date(`${iso}T12:00:00`);
export const todayIso = () => isoOf(new Date());
export const monthOf = (iso: string) => iso.slice(0, 7);

export function addMonths(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${pad(last)}` };
}

export function monthTitle(month: string) {
  const s = dateOf(`${month}-01`).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function dayTitle(iso: string) {
  const s = dateOf(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const weekdayShort = (iso: string) =>
  dateOf(iso).toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '');

export function monthGrid(month: string) {
  const { from, to } = monthRange(month);
  const first = dateOf(from);
  const offset = (first.getDay() + 6) % 7;
  const days: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let d = first; isoOf(d) <= to; d = new Date(d.getTime() + 86_400_000)) days.push(isoOf(d));
  while (days.length % 7) days.push(null);
  return days;
}

export const WEEKDAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
