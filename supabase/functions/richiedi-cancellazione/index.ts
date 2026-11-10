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
  } catch {
    /* Use legacy key below. */
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? undefined;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return respond({ error: 'Metodo non consentito' }, 405);

  const service = serviceKey();
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!service || !supabaseUrl) return respond({ error: 'Servizio non configurato' }, 500);
  const admin = createClient(supabaseUrl, service, { auth: { persistSession: false } });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user?.email) return respond({ error: 'Accesso non valido' }, 401);

  const { data: member, error: memberError } = await admin
    .from('members')
    .select('org_id, display_name')
    .eq('user_id', auth.user.id)
    .limit(1)
    .maybeSingle();
  if (memberError) return respond({ error: 'Impossibile verificare l’account' }, 500);
  if (!member) return respond({ error: 'Account non associato a un’associazione' }, 403);

  const { data: recent, error: lookupError } = await admin
    .from('account_deletion_requests')
    .select('id, status, requested_at')
    .eq('user_id', auth.user.id)
    .eq('org_id', member.org_id)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lookupError) return respond({ error: 'Impossibile verificare la richiesta' }, 500);

  if (recent?.status === 'notified') return respond({ ok: true, already_requested: true });

  let requestId = recent?.id as string | undefined;
  if (!requestId) {
    const { data: inserted, error: insertError } = await admin
      .from('account_deletion_requests')
      .insert({
        user_id: auth.user.id,
        org_id: member.org_id,
        user_email: auth.user.email,
        display_name: member.display_name,
      })
      .select('id')
      .single();
    if (insertError || !inserted) return respond({ error: 'Impossibile registrare la richiesta' }, 500);
    requestId = inserted.id;
  }

  // Email inviata dal server: la chiave Resend non è mai inclusa nell'app.
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('DELETION_EMAIL_FROM');
  if (!resendKey || !from) {
    console.error('Configurare RESEND_API_KEY e DELETION_EMAIL_FROM');
    return respond(
      { error: 'Richiesta registrata, notifica email non configurata. Contatta l’associazione.' },
      503,
    );
  }

  const email = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: ['jacopobuffetti@gmail.com'],
      subject: 'Tempo Libero Vigne - richiesta cancellazione account',
      text: [
        'È stata richiesta la cancellazione di un account.',
        `Utente: ${member.display_name ?? 'Non indicato'}`,
        `Email: ${auth.user.email}`,
        `ID utente: ${auth.user.id}`,
        `ID associazione: ${member.org_id}`,
        `ID richiesta: ${requestId}`,
        'La cancellazione deve essere effettuata dall’amministratore.',
      ].join('\n'),
    }),
  }).catch(() => null);
  if (!email?.ok) {
    console.error('Invio email non riuscito', email?.status);
    return respond(
      { error: 'Richiesta registrata, ma notifica email non inviata. Contatta l’associazione.' },
      503,
    );
  }
  const { error: updateError } = await admin
    .from('account_deletion_requests')
    .update({ status: 'notified', notified_at: new Date().toISOString() })
    .eq('id', requestId);
  if (updateError) {
    console.error('Email inviata, ma stato notifica non aggiornato', updateError.message);
    return respond({ ok: true, warning: 'Email inviata, stato da verificare' });
  }
  return respond({ ok: true });
});
