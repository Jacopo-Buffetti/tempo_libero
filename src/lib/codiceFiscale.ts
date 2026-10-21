import { COMUNI_DATA } from '@/lib/comuniData';

export type Sex = 'M' | 'F';

export type Place = { code: string; province: string; name: string; active: boolean; key: string };

export type PlaceMatch =
  | { status: 'empty' }
  | { status: 'found'; place: Place }
  | { status: 'ambiguous'; options: Place[] }
  | { status: 'unknown'; options: Place[] };

export type TaxCodeInput = {
  firstName: string;
  lastName: string;
  sex: Sex | null;
  birthDate: string | null;
  birthPlace: string;
};

export type TaxCodeResult =
  | { status: 'ok'; code: string; place: Place }
  | { status: 'incomplete'; missing: string[] }
  | { status: 'place'; match: PlaceMatch };

const MONTHS = 'ABCDEHLMPRST';
const OMOCODIA = 'LMNPQRSTUV';
const NUMERIC_POSITIONS = [6, 7, 9, 10, 12, 13, 14];
const ODD = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];
const FORMAT = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;

const PLAIN: Record<string, string> = {
  À: 'A', Á: 'A', Â: 'A', Ä: 'A', È: 'E', É: 'E', Ê: 'E', Ë: 'E', Ì: 'I', Í: 'I', Î: 'I', Ï: 'I',
  Ò: 'O', Ó: 'O', Ô: 'O', Ö: 'O', Ù: 'U', Ú: 'U', Û: 'U', Ü: 'U', Ç: 'C', Ñ: 'N',
};

export const placeKey = (text: string) =>
  text
    .toUpperCase()
    .replace(/[ÀÁÂÄÈÉÊËÌÍÎÏÒÓÔÖÙÚÛÜÇÑ]/g, (char) => PLAIN[char])
    .replace(/[^A-Z]/g, '');

let places: Place[] | null = null;

export function allPlaces(): Place[] {
  if (!places) {
    places = COMUNI_DATA.split(';').map((row) => {
      const [code, province, name, active] = row.split('|');
      return { code, province, name, active: active === '1', key: placeKey(name) };
    });
  }
  return places;
}

const ACCENTS: Record<string, string> = { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù' };
const LOWER_WORDS = new Set(['di', 'del', 'della', 'dello', 'dei', 'degli', 'delle', 'de', 'in', 'sul', 'sulla', 'sullo', 'al', 'alla', 'allo', 'e', 'ed', 'con', 'da', 'dal', 'nel', 'nei', 'sopra', 'sotto']);

export function placeLabel(place: Place) {
  const name = place.name
    .toLowerCase()
    .replace(/([aeiou])'(?=$|\s)/g, (_, vowel: string) => ACCENTS[vowel])
    .split(' ')
    .map((word, index) =>
      index > 0 && LOWER_WORDS.has(word)
        ? word
        : word.replace(/(^|['-])([a-zàèéìòù])/g, (_, before: string, letter: string) => before + letter.toUpperCase()),
    )
    .join(' ')
    .replace(/ (Nell|Dell|Sull|All|Dall|Coll|D)'/g, (match) => match.toLowerCase());
  return place.province === 'EE' ? name : `${name} (${place.province})`;
}

const distinct = (list: Place[]) => {
  const seen = new Set<string>();
  return list.filter((p) => {
    const id = `${p.code}|${p.province}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const preferActive = (list: Place[]) => {
  const active = list.filter((p) => p.active);
  return active.length ? active : list;
};

export function findPlace(text: string): PlaceMatch {
  const trimmed = text.trim();
  if (!trimmed) return { status: 'empty' };

  const withProvince = /^(.*?)\s*\(\s*([A-Za-z]{2})\s*\)\s*$/.exec(trimmed);
  const key = placeKey(withProvince ? withProvince[1] : trimmed);
  const province = withProvince?.[2].toUpperCase();
  if (!key) return { status: 'empty' };

  const exact = allPlaces().filter((p) => p.key === key && (!province || p.province === province));
  const candidates = preferActive(exact);
  const codes = new Set(candidates.map((p) => p.code));

  if (codes.size === 1) return { status: 'found', place: candidates[0] };
  if (codes.size > 1) return { status: 'ambiguous', options: distinct(candidates).slice(0, 8) };

  const words = (withProvince ? withProvince[1] : trimmed).split(/[\s'’-]+/).map(placeKey).filter(Boolean);
  const similar = allPlaces()
    .filter(
      (p) =>
        (p.key.startsWith(key) || words.every((word) => p.key.includes(word))) &&
        (!province || p.province === province),
    )
    .sort((a, b) => Number(b.active) - Number(a.active) || a.key.length - b.key.length);
  return { status: 'unknown', options: distinct(similar).slice(0, 6) };
}

const letters = (text: string) => placeKey(text);
const consonants = (text: string) => letters(text).replace(/[AEIOU]/g, '');
const vowels = (text: string) => letters(text).replace(/[^AEIOU]/g, '');

const surnameCode = (surname: string) => (consonants(surname) + vowels(surname) + 'XXX').slice(0, 3);

function nameCode(name: string) {
  const c = consonants(name);
  if (c.length >= 4) return c[0] + c[2] + c[3];
  return (c + vowels(name) + 'XXX').slice(0, 3);
}

function charValue(char: string, odd: boolean) {
  const n = /\d/.test(char) ? Number(char) : char.charCodeAt(0) - 65;
  return odd ? ODD[n] : n;
}

export function checkChar(first15: string) {
  let sum = 0;
  for (let i = 0; i < 15; i++) sum += charValue(first15[i], i % 2 === 0);
  return String.fromCharCode(65 + (sum % 26));
}

export function computeTaxCode(input: TaxCodeInput): TaxCodeResult {
  const missing: string[] = [];
  if (!letters(input.lastName)) missing.push('cognome');
  if (!letters(input.firstName)) missing.push('nome');
  if (!input.sex) missing.push('sesso');
  if (!input.birthDate) missing.push('data di nascita');
  if (!input.birthPlace.trim()) missing.push('luogo di nascita');
  if (missing.length) return { status: 'incomplete', missing };

  const match = findPlace(input.birthPlace);
  if (match.status !== 'found') return { status: 'place', match };

  const [year, month, day] = input.birthDate!.split('-').map(Number);
  const dayCode = String(day + (input.sex === 'F' ? 40 : 0)).padStart(2, '0');
  const first15 =
    surnameCode(input.lastName) +
    nameCode(input.firstName) +
    String(year % 100).padStart(2, '0') +
    MONTHS[month - 1] +
    dayCode +
    match.place.code;
  return { status: 'ok', code: first15 + checkChar(first15), place: match.place };
}

export const normalizeTaxCode = (code: string) => code.replace(/\s/g, '').toUpperCase();

function withoutOmocodia(code: string) {
  const chars = code.split('');
  for (const i of NUMERIC_POSITIONS) {
    const n = OMOCODIA.indexOf(chars[i]);
    if (n >= 0) chars[i] = String(n);
  }
  return chars.join('');
}

const PARTS: { from: number; to: number; label: string }[] = [
  { from: 0, to: 3, label: 'cognome' },
  { from: 3, to: 6, label: 'nome' },
  { from: 6, to: 9, label: 'anno o mese di nascita' },
  { from: 9, to: 11, label: 'giorno di nascita o sesso' },
  { from: 11, to: 15, label: 'luogo di nascita' },
];

export function taxCodeProblem(code: string, expected: string | null): string | null {
  const value = normalizeTaxCode(code);
  if (!value) return null;
  if (value.length !== 16 || !FORMAT.test(value)) return 'Il codice fiscale non ha un formato valido';
  if (checkChar(value.slice(0, 15)) !== value[15]) {
    return 'L’ultimo carattere non torna: probabilmente c’è un errore di battitura';
  }
  if (!expected) return null;
  const given = withoutOmocodia(value).slice(0, 15);
  const wanted = expected.slice(0, 15);
  if (given === wanted) return null;
  const wrong = PARTS.filter((p) => given.slice(p.from, p.to) !== wanted.slice(p.from, p.to)).map((p) => p.label);
  return `Non corrisponde a ${wrong.join(', ')}: con i dati inseriti risulterebbe ${expected}`;
}
