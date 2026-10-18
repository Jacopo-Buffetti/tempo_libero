import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { parseReceipt } from './parse.ts';

const OCR_URL = 'https://api.ocr.space/parse/image';
const MAX_BYTES = 1024 * 1024;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function publicKey() {
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (anon) return anon;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
    return (keys.default ?? Object.values(keys)[0]) as string | undefined;
  } catch {
    return undefined;
  }
}

async function recognize(bytes: Uint8Array, mime: string, apiKey: string) {
  const form = new FormData();
  form.append('base64Image', `data:${mime};base64,${encodeBase64(bytes)}`);
  form.append('language', 'ita');
  form.append('OCREngine', '2');
  form.append('isTable', 'true');
  form.append('scale', 'true');
  form.append('detectOrientation', 'true');

  const response = await fetch(OCR_URL, { method: 'POST', headers: { apikey: apiKey }, body: form });
  if (!response.ok) throw new Error(`OCR non disponibile (${response.status})`);
  const data = await response.json();
  if (data.IsErroredOnProcessing) {
    const message = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join(' ') : data.ErrorMessage;
    throw new Error(message || 'OCR non riuscito');
  }
  return (data.ParsedResults ?? []).map((r: { ParsedText?: string }) => r.ParsedText ?? '').join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Metodo non consentito' }, 405);

  const apiKey = Deno.env.get('OCR_SPACE_API_KEY');
  if (!apiKey) return json({ error: 'Manca il segreto OCR_SPACE_API_KEY su Supabase' }, 500);

  const key = publicKey();
  if (!key) return json({ error: 'Chiave pubblica di Supabase non disponibile' }, 500);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, key, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

  const { receipt_id } = await req.json().catch(() => ({}));
  if (!receipt_id) return json({ error: 'Scontrino mancante' }, 400);

  const { data: receipt } = await supabase
    .from('shopping_receipts')
    .select('id, path')
    .eq('id', receipt_id)
    .maybeSingle();
  if (!receipt) return json({ error: 'Scontrino non trovato' }, 404);

  const { data: file } = await supabase.storage.from('scontrini').download(receipt.path);
  if (!file) return json({ error: 'Foto non trovata' }, 404);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const markUnreadable = (error: string) =>
    supabase.from('shopping_receipts').update({ status: 'illeggibile', error }).eq('id', receipt_id);

  if (bytes.byteLength > MAX_BYTES) {
    const message = `Foto troppo grande per la lettura (${Math.round(bytes.byteLength / 1024)} KB)`;
    await markUnreadable(message);
    return json({ error: message }, 413);
  }

  let text: string;
  try {
    text = await recognize(bytes, file.type || 'image/jpeg', apiKey);
  } catch (e) {
    const message = `OCR.space: ${e instanceof Error ? e.message : 'lettura non riuscita'}`;
    await markUnreadable(message);
    return json({ error: message }, 502);
  }

  const parsed = parseReceipt(text);
  const update =
    parsed.total_cents != null
      ? { ...parsed, status: 'letto', error: null }
      : {
          status: 'illeggibile',
          shop: parsed.shop,
          receipt_date: parsed.receipt_date,
          error: text.trim()
            ? 'Testo letto, ma il totale non si trova'
            : 'Nessun testo riconosciuto nella foto',
        };

  const { error } = await supabase.from('shopping_receipts').update(update).eq('id', receipt_id);
  if (error) return json({ error: 'Non riesco a salvare il risultato' }, 500);

  return json(update);
});
