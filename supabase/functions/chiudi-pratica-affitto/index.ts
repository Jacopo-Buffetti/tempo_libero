import { createClient } from 'jsr:@supabase/supabase-js@2';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });

function serviceKey(): string | undefined {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    const key = keys.default ?? Object.values(keys)[0];
    if (typeof key === 'string' && key) return key;
  } catch { /* Fallback alla chiave legacy. */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? undefined;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return respond({ error: 'Metodo non consentito' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY');
  const secret = serviceKey();
  if (!url || !publicKey || !secret) return respond({ error: 'Servizio non configurato' }, 500);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return respond({ error: 'Accesso richiesto' }, 401);
  const admin = createClient(url, secret, { auth: { persistSession: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return respond({ error: 'Sessione non valida' }, 401);
  let rentalId: string;
  try {
    const body = await req.json();
    rentalId = body?.rentalId;
    if (typeof rentalId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(rentalId)) {
      return respond({ error: 'Identificativo affitto non valido' }, 400);
    }
  } catch { return respond({ error: 'Richiesta non valida' }, 400); }

  // RPC con JWT utente: i permessi e la data sono controllati nel database
  // PRIMA di effettuare operazioni irreversibili su Storage.
  const user = createClient(url, publicKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: prepared, error: prepareError } = await user.rpc('begin_rental_closure', {
    p_rental_id: rentalId,
  });
  if (prepareError || !prepared) {
    console.error('begin_rental_closure', prepareError?.message);
    return respond({ error: prepareError?.message ?? 'Impossibile verificare la pratica' }, 403);
  }
  if (prepared.already_closed === true) return respond({ ok: true, already_closed: true });

  const paths = prepared.paths;
  const orgId = prepared.org_id;
  if (!Array.isArray(paths) || typeof orgId !== 'string' ||
      !paths.every((p) => typeof p === 'string' && p.startsWith(`${orgId}/${rentalId}/`))) {
    console.error('Percorsi documenti inattesi', rentalId);
    return respond({ error: 'Percorsi dei documenti non validi: chiusura sospesa' }, 500);
  }

  // Se Storage fallisce, NON finalizziamo la pratica. La richiesta può essere ripetuta:
  // la cancellazione dei file è idempotente e la pratica resta in stato closing_at.
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { data: removed, error: storageError } = await admin.storage.from('documenti').remove(batch);
    if (storageError || !removed) {
      console.error('Storage remove failed', rentalId, storageError?.message);
      return respond({ error: 'Eliminazione documenti non completata. Riprova la chiusura.' }, 503);
    }
  }

  // Solo il server con service role può finalizzare, dopo il successo di Storage.
  const { data: finished, error: finishError } = await admin.rpc('finish_rental_closure', {
    p_rental_id: rentalId,
  });
  if (finishError || finished !== true) {
    console.error('finish_rental_closure', rentalId, finishError?.message);
    return respond({ error: 'Documenti rimossi, ma chiusura non completata. Riprova.' }, 503);
  }
  return respond({ ok: true });
});
