const UNITS = [
  '',
  'uno',
  'due',
  'tre',
  'quattro',
  'cinque',
  'sei',
  'sette',
  'otto',
  'nove',
  'dieci',
  'undici',
  'dodici',
  'tredici',
  'quattordici',
  'quindici',
  'sedici',
  'diciassette',
  'diciotto',
  'diciannove',
];
const TENS = [
  '',
  '',
  'venti',
  'trenta',
  'quaranta',
  'cinquanta',
  'sessanta',
  'settanta',
  'ottanta',
  'novanta',
];

function belowHundred(n: number) {
  if (n < 20) return UNITS[n];
  const ten = TENS[Math.floor(n / 10)];
  const unit = n % 10;
  if (unit === 0) return ten;
  const base = unit === 1 || unit === 8 ? ten.slice(0, -1) : ten;
  return base + (unit === 3 ? 'tré' : UNITS[unit]);
}

function belowThousand(n: number) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds === 0 ? '' : hundreds === 1 ? 'cento' : `${UNITS[hundreds]}cento`;
  const tail = belowHundred(rest);
  if (head && tail.startsWith('ottant')) return head.slice(0, -1) + tail;
  return head + tail;
}

export function numberInWords(n: number): string {
  if (n === 0) return 'zero';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  let out = '';
  const inCompound = (words: string) => words.replace(/é$/, 'e');
  if (millions) out += millions === 1 ? 'unmilione' : `${inCompound(numberInWords(millions))}milioni`;
  if (thousands) out += thousands === 1 ? 'mille' : `${inCompound(belowThousand(thousands))}mila`;
  if (rest) out += belowThousand(rest);
  return out;
}

export function euroInWords(cents: number) {
  const euros = Math.floor(cents / 100);
  const decimals = String(cents % 100).padStart(2, '0');
  return `${numberInWords(euros)}/${decimals}`;
}
