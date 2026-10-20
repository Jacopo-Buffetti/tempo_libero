import { Linking, Share } from 'react-native';
import { LOCATIONS, locationLabel, qtyWithUnit, type Location } from '@/lib/items';
import { dateFromIso, dishNames, formatEuro, locationsLabel, type ListItem, type Run } from '@/lib/spesa';

const RULE = '━━━━━━━━━━━━━━━━';
const SIGNATURE = '🌞 _Pro Loco Tempo Libero Vigne_';
const TABLE_WIDTH = 30;

export const quantityLabel = (qty: number, unit: string) => qtyWithUnit(qty, unit);

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
  list: { name: string; locations: Location[]; created_at?: string | null },
  items: ListItem[],
) {
  const todo = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);
  const created = list.created_at ? capitalize(longDate(list.created_at.slice(0, 10))) : null;

  const parts = [
    `🛒 *${list.name.trim().toUpperCase()}*`,
    [`📍 ${locationsLabel(list.locations)}`, created && `🗓️ ${created}`].filter(Boolean).join('   '),
    RULE,
    '',
  ];

  if (todo.length) {
    parts.push(`*DA PRENDERE* (${todo.length})`);
    const keys: (Location | 'libero')[] = [...LOCATIONS.map((l) => l.value), 'libero'];
    const groups = keys
      .map((key) => ({
        key,
        items: todo.filter((i) => (i.items?.location ?? 'libero') === key),
      }))
      .filter((g) => g.items.length > 0);
    if (groups.length > 1) {
      groups.forEach((g) => {
        parts.push('', `_${g.key === 'libero' ? 'Altro' : locationLabel(g.key)}_`, ...g.items.map(todoBlock));
      });
    } else {
      parts.push('', ...todo.map(todoBlock));
    }
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
  list: { name: string; locations: Location[] },
  runs: { run: Run; payer: string; items: ListItem[] }[],
) {
  const total = runs.reduce((sum, r) => sum + r.run.total_cents, 0);
  const toRefund = runs
    .filter((r) => r.run.paid_by === 'volontario' && !r.run.reimbursed)
    .reduce((sum, r) => sum + r.run.total_cents, 0);
  const missing = runs.filter((r) => r.run.amount_missing).length;

  const parts = [
    '🧾 *RESOCONTO SPESA*',
    `*${list.name.trim()}*`,
    `📍 ${locationsLabel(list.locations)}   🛍️ ${runs.length} ${runs.length === 1 ? 'pagamento' : 'pagamenti'}`,
    RULE,
  ];

  runs.forEach(({ run, payer, items }, index) => {
    const head = [`*${index + 1} · ${longDate(run.run_date)}*`, run.shop].filter(Boolean).join(' · ');
    parts.push('', `${head} — *${run.amount_missing ? 'importo da inserire' : formatEuro(run.total_cents)}*`);
    if (items.length) {
      parts.push(
        '```',
        ...items.map((i) =>
          tableRow(
            `${i.name.trim()} ${quantityLabel(i.qty, i.unit)}`,
            i.price_cents != null ? formatEuro(i.price_cents) : run.receipts_count ? '' : '—',
          ).trimEnd(),
        ),
        '```',
      );
    }
    const receipts = run.receipts_count
      ? ` · ${run.receipts_count} ${run.receipts_count === 1 ? 'scontrino' : 'scontrini'}`
      : '';
    const refund =
      run.paid_by === 'volontario' ? (run.reimbursed ? ' · rimborsato' : ' · da rimborsare') : '';
    parts.push(`👤 ${payer}${refund}${receipts}`);
  });

  parts.push('', RULE, `💶 *Totale ${formatEuro(total)}*`);
  if (toRefund) parts.push(`↩️ _Da rimborsare ai volontari: ${formatEuro(toRefund)}_`);
  if (missing) parts.push(`⚠️ _Alcuni importi sono ancora da inserire_`);
  parts.push('', SIGNATURE);
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
