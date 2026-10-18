import { Linking, Share } from 'react-native';
import { formatQty, locationLabel, type Location } from '@/lib/items';
import { dateFromIso, dishNames, formatEuro, type ListItem } from '@/lib/spesa';

const RULE = '━━━━━━━━━━━━━━━━';
const SIGNATURE = '🌞 _Pro Loco Tempo Libero Vigne_';
const TABLE_WIDTH = 30;

const UNIT_FORMS: Record<string, [string, string]> = {
  pezzi: ['pezzo', 'pezzi'],
  confezioni: ['confezione', 'confezioni'],
  bottiglie: ['bottiglia', 'bottiglie'],
  rotoli: ['rotolo', 'rotoli'],
  casse: ['cassa', 'casse'],
  litri: ['litro', 'litri'],
};

export function quantityLabel(qty: number, unit: string) {
  const forms = UNIT_FORMS[unit];
  const word = forms ? (Number(qty) === 1 ? forms[0] : forms[1]) : unit;
  return `${formatQty(qty)} ${word}`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const longDate = (iso: string, withYear = false) =>
  dateFromIso(iso).toLocaleDateString('it-IT', {
    weekday: withYear ? undefined : 'long',
    day: 'numeric',
    month: 'long',
    year: withYear ? 'numeric' : undefined,
  });

function todoBlock(i: ListItem) {
  const rows = [`▫️ *${i.name.trim()}* — ${quantityLabel(i.qty, i.unit)}`];
  if (i.note) rows.push(`      ↳ _${i.note}_`);
  if (dishNames(i)) rows.push(`      ↳ _per ${dishNames(i)}_`);
  return rows.join('\n');
}

function doneLine(i: ListItem) {
  return `~${i.name.trim()} — ${quantityLabel(i.qty, i.unit)}~`;
}

export function openListText(
  list: { name: string; location: Location; created_at?: string | null },
  items: ListItem[],
) {
  const todo = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);
  const created = list.created_at ? capitalize(longDate(list.created_at.slice(0, 10))) : null;

  const parts = [
    `🛒 *${list.name.trim().toUpperCase()}*`,
    [`📍 ${locationLabel(list.location)}`, created && `🗓️ ${created}`].filter(Boolean).join('   '),
    RULE,
    '',
  ];

  if (todo.length) {
    parts.push(`*DA PRENDERE* (${todo.length})`, '', ...todo.map(todoBlock));
  } else {
    parts.push('🎉 *Tutto preso!*');
  }

  if (done.length) {
    parts.push('', `✅ *GIÀ PRESI* (${done.length})`, ...done.map(doneLine));
  }

  parts.push('', RULE, SIGNATURE);
  return parts.join('\n');
}

function tableRow(left: string, right: string) {
  const room = TABLE_WIDTH - right.length - 1;
  const name = left.length > room ? `${left.slice(0, room - 1)}…` : left;
  return `${name.padEnd(room, ' ')} ${right}`;
}

export function closedListText(
  list: { name: string; location: Location; shop: string | null; closed_on: string | null },
  items: ListItem[],
  payer: string,
) {
  const bought = items.filter((i) => i.checked);
  const total = bought.reduce((sum, i) => sum + (i.price_cents ?? 0), 0);
  const missing = bought.filter((i) => i.price_cents == null).length;

  const table = bought.map((i) =>
    tableRow(
      `${i.name.trim()} ${quantityLabel(i.qty, i.unit)}`,
      i.price_cents != null ? formatEuro(i.price_cents) : '—',
    ),
  );

  const parts = [
    '🧾 *RESOCONTO SPESA*',
    `*${list.name.trim()}*`,
    [
      list.closed_on && `🗓️ ${longDate(list.closed_on, true)}`,
      list.shop && `🏪 ${list.shop}`,
      `📍 ${locationLabel(list.location)}`,
    ]
      .filter(Boolean)
      .join('   '),
    RULE,
    '```',
    ...table,
    '```',
    RULE,
    `💶 *Totale ${formatEuro(total)}*`,
  ];

  if (missing) parts.push(`⚠️ _${missing === 1 ? 'Manca 1 prezzo' : `Mancano ${missing} prezzi`}_`);
  parts.push(`👤 ${capitalize(payer)}`, '', SIGNATURE);
  return parts.join('\n');
}

export async function shareOnWhatsApp(text: string) {
  try {
    await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(text)}`);
  } catch {
    await Share.share({ message: text });
  }
}

export async function shareAnywhere(text: string) {
  await Share.share({ message: text });
}
