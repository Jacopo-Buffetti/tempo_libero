import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const ROLES = ['admin', 'consigliere', 'volontario'];

function serviceKey() {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    const secret = (keys.default ?? Object.values(keys)[0]) as string | undefined;
    if (secret) return secret;
  } catch {
    return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Metodo non consentito' }, 405);

  const key = serviceKey();
  if (!key) return json({ error: 'Chiave di servizio non disponibile' }, 500);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: caller } = await admin.auth.getUser(token);
  if (!caller?.user) return json({ error: 'Accesso non valido' }, 401);
  const callerId = caller.user.id;

  const { data: memberships, error: membershipError } = await admin
    .from('members')
    .select('org_id, role')
    .eq('user_id', callerId);
  if (membershipError) {
    return json({ error: `Non riesco a leggere i membri: ${membershipError.message}` }, 500);
  }
  if (!memberships?.length) {
    return json({ error: 'Il tuo account non risulta iscritto a nessuna associazione' }, 403);
  }
  const me = memberships.find((m) => m.role === 'admin');
  if (!me) {
    return json(
      { error: `Solo un amministratore può gestire gli account (il tuo ruolo è: ${memberships[0].role})` },
      403,
    );
  }
  const orgId = me.org_id as string;

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  const linkShift = async (userId: string, personId: string | null | undefined, role: string) => {
    await admin.from('shift_people').update({ user_id: null }).eq('org_id', orgId).eq('user_id', userId);
    if (role !== 'volontario' && personId) {
      const { error } = await admin
        .from('shift_people')
        .update({ user_id: userId })
        .eq('org_id', orgId)
        .eq('id', personId);
      if (error) throw new Error('Questo consigliere è già collegato a un altro account');
    }
  };

  const ownTarget = async (userId: string) => {
    const { data } = await admin
      .from('members')
      .select('user_id, created_by, role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) throw new Error('Account non trovato');
    if (data.created_by !== callerId) throw new Error('Puoi modificare solo gli account che hai creato tu');
    return data;
  };

  try {
    if (action === 'crea') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const name = String(body.display_name ?? '').trim();
      const role = String(body.role ?? 'volontario');
      if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Email non valida' }, 400);
      if (!name) return json({ error: 'Scrivi il nome' }, 400);
      if (!ROLES.includes(role)) return json({ error: 'Ruolo non valido' }, 400);

      let userId: string | null = null;
      const { data: existing } = await admin.rpc('user_id_by_email', { p_email: email });
      if (existing) {
        userId = existing as string;
      } else {
        const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
        if (error || !created.user) {
          return json({ error: `Non riesco a creare l’account: ${error?.message ?? 'errore sconosciuto'}` }, 500);
        }
        userId = created.user.id;
      }

      const { data: already } = await admin
        .from('members')
        .select('user_id')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .maybeSingle();
      if (already) return json({ error: 'Questa persona fa già parte dell’associazione' }, 409);

      const { error: memberError } = await admin
        .from('members')
        .insert({ org_id: orgId, user_id: userId, role, display_name: name, email, created_by: callerId });
      if (memberError) {
        return json({ error: `Non riesco ad aggiungerlo all’associazione: ${memberError.message}` }, 500);
      }

      await linkShift(userId, body.shift_person_id, role);
      return json({ ok: true });
    }

    if (action === 'modifica') {
      const userId = String(body.user_id ?? '');
      await ownTarget(userId);
      const role = String(body.role ?? '');
      if (!ROLES.includes(role)) return json({ error: 'Ruolo non valido' }, 400);
      const changes: Record<string, string> = { role };
      if (typeof body.display_name === 'string' && body.display_name.trim()) changes.display_name = body.display_name.trim();
      const { error } = await admin.from('members').update(changes).eq('org_id', orgId).eq('user_id', userId);
      if (error) return json({ error: 'Modifica non riuscita' }, 500);
      await linkShift(userId, body.shift_person_id, role);
      return json({ ok: true });
    }

    if (action === 'elimina') {
      const userId = String(body.user_id ?? '');
      if (userId === callerId) return json({ error: 'Non puoi eliminare il tuo account' }, 400);
      await ownTarget(userId);
      await admin.from('shift_people').update({ user_id: null }).eq('org_id', orgId).eq('user_id', userId);
      const { error } = await admin.from('members').delete().eq('org_id', orgId).eq('user_id', userId);
      if (error) return json({ error: 'Eliminazione non riuscita' }, 500);
      const { count } = await admin
        .from('members')
        .select('user_id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (!count) await admin.auth.admin.deleteUser(userId);
      return json({ ok: true });
    }

    return json({ error: 'Azione sconosciuta' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Errore' }, 400);
  }
});
