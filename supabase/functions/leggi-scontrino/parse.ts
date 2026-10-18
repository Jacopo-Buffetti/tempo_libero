export type ParsedReceipt = {
  total_cents: number | null;
  shop: string | null;
  receipt_date: string | null;
};

const AMOUNT = /(\d{1,3}(?:[.\s]\d{3})*|\d+)\s?[,.]\s?(\d{2})(?!\d)/g;

const EXCLUDED =
  /SUB\s?-?\s?TOT|IVA|IMPONIBILE|RESTO|CONTANT|SCONTO|RISPARMI|PUNTI|BUONO|NON\s+RISCOSSO|DI\s+CUI|RESO|ARROTONDAMENTO|SALDO\s+PUNTI|AMMONTARE/;

const TOTAL_RULES: { pattern: RegExp; weight: number }[] = [
  { pattern: /TOTALE\s+CO[MN]{1,2}PLESS/, weight: 100 },
  { pattern: /TOTALE\s+(EURO|EUR|€)/, weight: 90 },
  { pattern: /TOTALE\s+DOCUMENTO/, weight: 85 },
  { pattern: /IMPORTO\s+PAGATO/, weight: 80 },
  { pattern: /TOTALE/, weight: 70 },
  { pattern: /\bTOT\b\.?/, weight: 60 },
  { pattern: /PAGAMENTO\s+(ELETTRONICO|CARTA|BANCOMAT|POS)/, weight: 50 },
  { pattern: /\b(BANCOMAT|CARTA\s+DI\s+CREDITO|POS)\b/, weight: 40 },
];

const SHOP_NOISE =
  /DOCUMENTO|COMMERCIALE|VENDITA|PRESTAZIONE|DESCRIZIONE|SCONTRINO|FISCALE|P\.?\s?IVA|PARTITA|C\.?\s?F\.?|TEL|VIA\s|PIAZZA|V\.LE|VIALE|CORSO|WWW|HTTP|@|CASSA|OPERATORE|\d{5}/;

function amountsIn(line: string) {
  const found: number[] = [];
  for (const m of line.matchAll(AMOUNT)) {
    const euros = Number(m[1].replace(/[.\s]/g, ''));
    const cents = Number(m[2]);
    if (Number.isFinite(euros)) found.push(euros * 100 + cents);
  }
  return found;
}

function normalizeLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/\t+/g, '  ')
        .replace(/[ ]{2,}/g, '  ')
        .trim(),
    )
    .filter(Boolean);
}

function findTotal(lines: string[]) {
  let best: { cents: number; weight: number; index: number } | null = null;

  lines.forEach((raw, index) => {
    const line = raw.toUpperCase();
    if (EXCLUDED.test(line)) return;
    const rule = TOTAL_RULES.find((r) => r.pattern.test(line));
    if (!rule) return;

    let amounts = amountsIn(raw);
    if (amounts.length === 0) {
      const loose = raw.match(/(\d{1,4})\s(\d{2})\s*$/);
      if (loose) amounts = [Number(loose[1]) * 100 + Number(loose[2])];
    }
    if (amounts.length === 0 && lines[index + 1] && !EXCLUDED.test(lines[index + 1].toUpperCase())) {
      amounts = amountsIn(lines[index + 1]);
    }
    if (amounts.length === 0) return;

    const cents = amounts[amounts.length - 1];
    if (cents <= 0) return;
    if (!best || rule.weight > best.weight || (rule.weight === best.weight && index > best.index)) {
      best = { cents, weight: rule.weight, index };
    }
  });

  if (best) return (best as { cents: number }).cents;

  const candidates = lines
    .filter((l) => !EXCLUDED.test(l.toUpperCase()))
    .flatMap((l) => amountsIn(l))
    .filter((c) => c > 0 && c < 1_000_000);
  return candidates.length ? Math.max(...candidates) : null;
}

function findShop(lines: string[]) {
  for (const raw of lines.slice(0, 6)) {
    const line = raw.toUpperCase();
    const letters = raw.replace(/[^A-Za-zÀ-ÿ]/g, '');
    const visible = raw.replace(/\s/g, '');
    if (letters.length < 3 || letters.length / visible.length < 0.6) continue;
    if (SHOP_NOISE.test(line) || amountsIn(raw).length) continue;
    const clean = raw
      .replace(/\s{2,}/g, ' ')
      .replace(/[*_=#~]+/g, '')
      .trim();
    if (!clean) continue;
    return clean
      .toLowerCase()
      .replace(/(^|[\s'’.-])([a-zà-ÿ])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
      .slice(0, 60);
  }
  return null;
}

function findDate(text: string) {
  const m = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseReceipt(text: string): ParsedReceipt {
  const lines = normalizeLines(text);
  return {
    total_cents: findTotal(lines),
    shop: findShop(lines),
    receipt_date: findDate(text),
  };
}
