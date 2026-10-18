import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import {
  ITEM_COLUMNS,
  LOCATIONS,
  available,
  formatQty,
  isLow,
  locationLabel,
  needsRepair,
  type Item,
  type Kind,
  type Location,
} from '@/lib/items';
import { localIsoDate } from '@/lib/spesa';
import { quantityLabel } from '@/lib/condividiLista';
import { LOGO_PROLOCO_DATA_URI } from '@/lib/logoProloco';
import { colors, palette } from '@/theme/tokens';

export type ExportScope = Location | 'tutto';
export type ExportFormat = 'pdf' | 'csv' | 'txt';

const ORG_NAME = 'Pro Loco Tempo Libero Vigne';
const CSV_HEADER = ['nome', 'luogo', 'tipo', 'unita', 'quantita', 'scorta_minima', 'da_riparare'];

export async function fetchInventory(orgId: string, scope: ExportScope) {
  let query = supabase.from('items').select(ITEM_COLUMNS).eq('org_id', orgId).order('name');
  if (scope !== 'tutto') query = query.eq('location', scope);
  const { data, error } = await query;
  if (error) throw error;
  return data as Item[];
}

const byLocation = (items: Item[]) =>
  LOCATIONS.map((l) => ({ ...l, items: items.filter((i) => i.location === l.value) })).filter(
    (g) => g.items.length > 0,
  );

const todayLong = () =>
  new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

function status(i: Item) {
  if (isLow(i)) return `sotto scorta (minimo ${formatQty(i.min_qty)})`;
  if (needsRepair(i)) return `${i.broken_qty} da riparare, ${available(i)} disponibili`;
  return 'ok';
}

const decimal = (n: number | null | undefined) => (n == null ? '' : formatQty(n));

function csvCell(value: string) {
  return /[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function inventoryCsv(items: Item[]) {
  const rows = items.map((i) =>
    [
      i.name,
      i.location,
      i.kind,
      i.unit,
      decimal(i.qty),
      i.kind === 'consumabile' ? decimal(i.min_qty) : '',
      i.kind === 'attrezzatura' ? String(i.broken_qty) : '',
    ]
      .map(csvCell)
      .join(';'),
  );
  return `\uFEFF${[CSV_HEADER.join(';'), ...rows].join('\r\n')}\r\n`;
}

export function templateCsv() {
  return inventoryCsv([
    {
      id: '1',
      name: 'Carta igienica',
      location: 'magazzino',
      kind: 'consumabile',
      unit: 'rotoli',
      qty: 18,
      min_qty: 24,
      broken_qty: 0,
    },
    {
      id: '2',
      name: 'Farina 00',
      location: 'cucina',
      kind: 'consumabile',
      unit: 'kg',
      qty: 2.5,
      min_qty: 5,
      broken_qty: 0,
    },
    {
      id: '3',
      name: 'Sedie',
      location: 'magazzino',
      kind: 'attrezzatura',
      unit: 'pezzi',
      qty: 312,
      min_qty: null,
      broken_qty: 8,
    },
  ]);
}

export function inventoryTxt(items: Item[]) {
  const width = Math.min(34, Math.max(12, ...items.map((i) => i.name.length + 2)));
  const lines = [`INVENTARIO · ${ORG_NAME.toUpperCase()}`, `Aggiornato al ${todayLong()}`, ''];
  byLocation(items).forEach((g) => {
    lines.push(`${g.label.toUpperCase()} (${g.items.length})`, '-'.repeat(width + 30));
    g.items.forEach((i) => {
      const name = i.name.length > width - 2 ? `${i.name.slice(0, width - 3)}…` : i.name;
      const note = status(i);
      lines.push(
        `${name.padEnd(width, '.')} ${quantityLabel(i.qty, i.unit).padEnd(16)}${note === 'ok' ? '' : ` ${note}`}`.trimEnd(),
      );
    });
    lines.push('');
  });
  const low = items.filter(isLow).length;
  const broken = items.filter(needsRepair).length;
  lines.push(`Totale: ${items.length} oggetti · ${low} sotto scorta · ${broken} con pezzi da riparare`);
  return `${lines.join('\n')}\n`;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function inventoryHtml(items: Item[], scope: ExportScope) {
  const low = items.filter(isLow).length;
  const broken = items.filter(needsRepair).length;
  const title = scope === 'tutto' ? 'Inventario' : `Inventario · ${locationLabel(scope)}`;

  const sections = byLocation(items)
    .map(
      (g) => `
      <section>
        <h2><span>${escapeHtml(g.label)}</span><small>${g.items.length} oggetti</small></h2>
        <table>
          <thead><tr><th>Oggetto</th><th class="num">Quantità</th><th class="num">Scorta minima</th><th>Stato</th></tr></thead>
          <tbody>
            ${g.items
              .map((i) => {
                const cls = isLow(i) ? 'warn' : needsRepair(i) ? 'repair' : '';
                return `<tr class="${cls}">
                  <td class="name">${escapeHtml(i.name)}<div class="kind">${i.kind === 'consumabile' ? 'Consumabile' : 'Attrezzatura'}</div></td>
                  <td class="num">${escapeHtml(quantityLabel(i.qty, i.unit))}</td>
                  <td class="num">${i.min_qty != null ? escapeHtml(quantityLabel(i.min_qty, i.unit)) : '—'}</td>
                  <td class="status">${escapeHtml(status(i) === 'ok' ? 'Ok' : status(i).charAt(0).toUpperCase() + status(i).slice(1))}</td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </section>`,
    )
    .join('');

  return `<!doctype html><html lang="it"><head><meta charset="utf-8">
  <style>
    @page { size: A4; margin: 14mm 12mm 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; color: ${palette.ink};
           -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 8mm;
             padding-bottom: 5mm; border-bottom: 1.2mm solid ${palette.pine}; }
    header img { width: 62mm; }
    header .title { text-align: right; }
    header h1 { margin: 0; font-family: Georgia, serif; font-size: 22pt; color: ${palette.pine}; }
    header p { margin: 1.5mm 0 0; font-size: 9pt; color: ${palette.stone}; letter-spacing: 1px; text-transform: uppercase; }
    .stripe { height: 1mm; background: ${palette.sun}; width: 28%; margin: 1.2mm 0 6mm auto; border-radius: 1mm; }
    .summary { display: flex; gap: 4mm; margin-bottom: 7mm; }
    .summary div { flex: 1; border-radius: 3mm; padding: 3.5mm 4mm; background: ${palette.leafSoft}; }
    .summary div.warn { background: ${palette.sunSoft}; }
    .summary b { display: block; font-size: 18pt; color: ${palette.pine}; }
    .summary span { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 1px; color: ${palette.stone}; }
    section { margin-bottom: 7mm; }
    h2 { display: flex; align-items: baseline; justify-content: space-between; margin: 0 0 2.5mm;
         font-size: 11pt; letter-spacing: 3px; text-transform: uppercase; color: ${palette.pine}; }
    h2 small { font-size: 8.5pt; letter-spacing: 0; text-transform: none; color: ${palette.stone}; font-weight: 400; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; table-layout: fixed; }
    th:nth-child(1) { width: 38%; } th:nth-child(2) { width: 18%; } th:nth-child(3) { width: 18%; } th:nth-child(4) { width: 26%; }
    thead { display: table-header-group; }
    th { text-align: left; font-size: 7.5pt; letter-spacing: 1px; text-transform: uppercase; color: ${palette.cream};
         background: ${palette.pine}; padding: 2mm 3mm; }
    td { padding: 2.2mm 3mm; border-bottom: 0.3mm solid ${colors.divider}; vertical-align: top; }
    tr { break-inside: avoid; }
    tbody tr:nth-child(even) td { background: ${colors.bg}; }
    .num { text-align: right; white-space: nowrap; }
    .name { font-weight: 700; }
    .kind { font-weight: 400; font-size: 7.5pt; color: ${palette.stone}; margin-top: 0.5mm; }
    .status { font-size: 8.5pt; color: ${palette.stone}; }
    tr.warn .status { color: ${colors.warn}; font-weight: 700; }
    tr.warn td:first-child { box-shadow: inset 1.2mm 0 0 ${palette.sun}; }
    tr.repair .status { color: ${colors.warn}; }
    footer { margin-top: 8mm; text-align: center; font-size: 8pt; letter-spacing: 2px; text-transform: uppercase; color: ${palette.pine}; }
  </style></head><body>
    <header>
      <img src="${LOGO_PROLOCO_DATA_URI}" alt="${ORG_NAME}" />
      <div class="title"><h1>${escapeHtml(title)}</h1><p>Aggiornato al ${escapeHtml(todayLong())}</p></div>
    </header>
    <div class="stripe"></div>
    <div class="summary">
      <div><b>${items.length}</b><span>Oggetti</span></div>
      <div class="${low ? 'warn' : ''}"><b>${low}</b><span>Sotto scorta</span></div>
      <div class="${broken ? 'warn' : ''}"><b>${broken}</b><span>Con pezzi da riparare</span></div>
    </div>
    ${sections || '<p>Nessun oggetto.</p>'}
    <footer>${ORG_NAME}</footer>
  </body></html>`;
}

function fileName(scope: ExportScope, ext: string) {
  const part = scope === 'tutto' ? '' : `-${scope}`;
  return `inventario${part}-${localIsoDate()}.${ext}`;
}

function writeCache(name: string, content: string) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  return file.uri;
}

const MIME: Record<ExportFormat, { mimeType: string; UTI: string }> = {
  pdf: { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' },
  csv: { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' },
  txt: { mimeType: 'text/plain', UTI: 'public.plain-text' },
};

async function share(uri: string, format: ExportFormat) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('Condivisione non disponibile su questo dispositivo');
  await Sharing.shareAsync(uri, { ...MIME[format], dialogTitle: 'Inventario' });
}

export async function exportInventory(orgId: string, scope: ExportScope, format: ExportFormat) {
  const items = await fetchInventory(orgId, scope);
  if (format === 'csv') return share(writeCache(fileName(scope, 'csv'), inventoryCsv(items)), 'csv');
  if (format === 'txt') return share(writeCache(fileName(scope, 'txt'), inventoryTxt(items)), 'txt');

  const { base64 } = await Print.printToFileAsync({
    html: inventoryHtml(items, scope),
    width: 595,
    height: 842,
    base64: true,
  });
  if (!base64) throw new Error('Non sono riuscito a creare il PDF. Riprova.');
  const file = new File(Paths.cache, fileName(scope, 'pdf'));
  if (file.exists) file.delete();
  file.create();
  file.write(new Uint8Array(decode(base64)));
  return share(file.uri, 'pdf');
}

export async function shareTemplate() {
  return share(writeCache('modello-inventario.csv', templateCsv()), 'csv');
}

export type ImportRow = {
  line: number;
  name: string;
  location: Location;
  kind: Kind;
  unit: string;
  qty: number;
  min_qty: number | null;
  broken_qty: number;
  action: 'nuovo' | 'aggiorna';
};

export type ImportProblem = { line: number; text: string };

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const HEADER_ALIASES: Record<string, string[]> = {
  name: ['nome', 'name', 'prodotto', 'oggetto', 'articolo', 'descrizione'],
  location: ['luogo', 'location', 'posizione', 'dove', 'reparto'],
  kind: ['tipo', 'kind', 'tipologia'],
  unit: ['unita', 'unit', 'um', 'unita_di_misura', 'misura'],
  qty: ['quantita', 'qta', 'qty', 'quantity', 'giacenza'],
  min_qty: ['scorta_minima', 'scorta', 'minimo', 'min', 'min_qty', 'soglia'],
  broken_qty: ['da_riparare', 'rotti', 'guasti', 'broken', 'broken_qty'],
};

const UNIT_ALIASES: Record<string, string> = {
  pz: 'pezzi',
  pezzo: 'pezzi',
  pezzi: 'pezzi',
  n: 'pezzi',
  nr: 'pezzi',
  conf: 'confezioni',
  confezione: 'confezioni',
  confezioni: 'confezioni',
  pacchi: 'confezioni',
  pacco: 'confezioni',
  bott: 'bottiglie',
  bottiglia: 'bottiglie',
  bottiglie: 'bottiglie',
  rotolo: 'rotoli',
  rotoli: 'rotoli',
  cassa: 'casse',
  casse: 'casse',
  kg: 'kg',
  chili: 'kg',
  chilo: 'kg',
  g: 'g',
  gr: 'g',
  grammi: 'g',
  l: 'litri',
  lt: 'litri',
  litro: 'litri',
  litri: 'litri',
  ml: 'ml',
};

function detectDelimiter(firstLine: string) {
  const counts = [';', ',', '\t'].map((d) => ({ d, n: firstLine.split(d).length }));
  return counts.sort((a, b) => b.n - a.n)[0].d;
}

export function parseCsv(text: string) {
  const clean = text.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(clean.split(/\r?\n/)[0] ?? '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const toNumber = (s: string | undefined) => {
  if (s == null || s.trim() === '') return null;
  const n = Number(
    s
      .trim()
      .replace(/\s/g, '')
      .replace(/\.(?=\d{3}(\D|$))/g, '')
      .replace(',', '.'),
  );
  return Number.isFinite(n) ? n : NaN;
};

export function readImport(text: string, existing: Item[]) {
  const rows = parseCsv(text);
  const problems: ImportProblem[] = [];
  if (rows.length === 0)
    return { rows: [] as ImportRow[], problems: [{ line: 0, text: 'Il file è vuoto.' }] };

  const header = rows[0].map(normalize);
  const col = Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([key, names]) => [key, header.findIndex((h) => names.includes(h))]),
  ) as Record<keyof typeof HEADER_ALIASES, number>;

  if (col.name < 0 || col.location < 0 || col.qty < 0) {
    return {
      rows: [] as ImportRow[],
      problems: [{ line: 1, text: 'Mancano le colonne obbligatorie: nome, luogo e quantita.' }],
    };
  }

  const known = new Set(existing.map((i) => `${i.location}|${i.name.trim().toLowerCase()}`));
  const seen = new Map<string, number>();
  const parsed: ImportRow[] = [];

  rows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const get = (key: keyof typeof HEADER_ALIASES) => (col[key] >= 0 ? (cells[col[key]] ?? '').trim() : '');

    const name = get('name');
    if (!name) {
      problems.push({ line, text: 'Nome mancante, riga saltata.' });
      return;
    }

    const loc = normalize(get('location'));
    const location = LOCATIONS.find((l) => l.value === loc || normalize(l.label) === loc)?.value;
    if (!location) {
      problems.push({
        line,
        text: `“${name}”: luogo “${get('location')}” non valido (usa magazzino, cucina o bar).`,
      });
      return;
    }

    const qty = toNumber(get('qty'));
    const min = toNumber(get('min_qty'));
    const broken = toNumber(get('broken_qty'));
    if (qty == null || Number.isNaN(qty) || qty < 0) {
      problems.push({ line, text: `“${name}”: quantità “${get('qty')}” non valida.` });
      return;
    }
    if (
      Number.isNaN(min) ||
      (min != null && min < 0) ||
      Number.isNaN(broken) ||
      (broken != null && broken < 0)
    ) {
      problems.push({ line, text: `“${name}”: scorta minima o pezzi da riparare non validi.` });
      return;
    }

    const kindText = normalize(get('kind'));
    const kind: Kind = kindText.startsWith('attrezz')
      ? 'attrezzatura'
      : kindText.startsWith('consum')
        ? 'consumabile'
        : (broken ?? 0) > 0
          ? 'attrezzatura'
          : 'consumabile';

    const unitText = normalize(get('unit'));
    const unit = UNIT_ALIASES[unitText] ?? (unitText || 'pezzi');

    const key = `${location}|${name.toLowerCase()}`;
    if (seen.has(key)) {
      problems.push({
        line: seen.get(key)!,
        text: `“${name}” compare più volte in ${locationLabel(location)}: vale l’ultima riga.`,
      });
      const previous = parsed.findIndex((p) => `${p.location}|${p.name.toLowerCase()}` === key);
      if (previous >= 0) parsed.splice(previous, 1);
    }
    seen.set(key, line);

    parsed.push({
      line,
      name,
      location,
      kind,
      unit,
      qty,
      min_qty: kind === 'consumabile' ? min : null,
      broken_qty: kind === 'attrezzatura' ? Math.min(Math.floor(broken ?? 0), Math.floor(qty)) : 0,
      action: known.has(key) ? 'aggiorna' : 'nuovo',
    });
  });

  return { rows: parsed, problems };
}

async function readText(file: File) {
  try {
    return await file.text();
  } catch (first) {
    try {
      return await readAsStringAsync(file.uri);
    } catch {
      throw first;
    }
  }
}

export async function pickCsv() {
  const picked = await File.pickFileAsync({ mimeTypes: '*/*' });
  if (picked.canceled || !picked.result) return null;
  const file = picked.result;
  const text = await readText(file);
  if (text.includes('\u0000')) {
    throw new Error('Il file scelto non è un CSV: scegline uno salvato in formato CSV.');
  }
  const name = /\.[a-z0-9]{2,4}$/i.test(file.name ?? '') ? file.name : 'File selezionato';
  return { name, text };
}

export async function importItems(orgId: string, rows: ImportRow[]) {
  const { data, error } = await supabase.rpc('import_items', {
    p_org_id: orgId,
    p_rows: rows.map(({ name, location, kind, unit, qty, min_qty, broken_qty }) => ({
      name,
      location,
      kind,
      unit,
      qty,
      min_qty,
      broken_qty,
    })),
  });
  if (error) throw error;
  return data as { created: number; updated: number };
}
