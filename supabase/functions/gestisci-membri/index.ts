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
  const body = await req.json().catch(() => ({}));

  const requestedOrgId = String(body.org_id ?? '');

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedOrgId)) {
    return json({ error: 'Associazione non valida' }, 400);
  }

  const me = memberships.find((m) => m.org_id === requestedOrgId && m.role === 'admin');

  if (!me) {
    return json({ error: 'Non sei amministratore dell’associazione richiesta' }, 403);
  }

  const orgId = me.org_id as string;

  const action = body.action as string;

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
      const email = String(body.email ?? '')
        .trim()
        .toLowerCase();
      const name = String(body.display_name ?? '').trim();
      const role = String(body.role ?? 'volontario');
      if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Email non valida' }, 400);
      if (!name) return json({ error: 'Scrivi il nome' }, 400);
      if (!ROLES.includes(role)) return json({ error: 'Ruolo non valido' }, 400);

      let userId: string | null = null;
      const { data: existing, error: lookupError } = await admin.rpc('user_id_by_email', {
        p_email: email,
      });

      if (lookupError) {
        console.error('Errore durante la verifica dell’email:', lookupError.message);
        return json({ error: 'Impossibile verificare l’indirizzo email' }, 500);
      }
      if (existing) {
        return json(
          {
            error:
              'Questo indirizzo email è già associato a un account. Non è possibile aggiungerlo automaticamente a un’altra associazione.',
          },
          409,
        );
      } else {
        const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
        if (error || !created.user) {
          return json(
            { error: `Non riesco a creare l’account: ${error?.message ?? 'errore sconosciuto'}` },
            500,
          );
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

      const { error: memberError } = await admin.rpc('save_member_with_shift', {
        p_org_id: orgId,
        p_user_id: userId,
        p_role: role,
        p_display_name: name,
        p_email: email,
        p_created_by: callerId,
        p_shift_person_id: body.shift_person_id || null,
        p_is_new: true,
      });

      if (memberError) {
        const { error: cleanupError } = await admin.auth.admin.deleteUser(userId);

        if (cleanupError) {
          console.error('Impossibile eliminare l’account appena creato:', {
            userId,
            error: cleanupError.message,
          });
        }

        return json(
          {
            error: cleanupError
              ? 'Creazione non completata. Contatta l’amministratore prima di riprovare.'
              : `Non riesco ad aggiungere l'account: ${memberError.message}`,
          },
          500,
        );
      }

      return json({ ok: true });
    }

    if (action === 'modifica') {
      const userId = String(body.user_id ?? '');
      await ownTarget(userId);
      const role = String(body.role ?? '');
      if (!ROLES.includes(role)) return json({ error: 'Ruolo non valido' }, 400);

      const { error } = await admin.rpc('save_member_with_shift', {
        p_org_id: orgId,
        p_user_id: userId,
        p_role: role,
        p_display_name: typeof body.display_name === 'string' ? body.display_name.trim() : null,
        p_email: null,
        p_created_by: callerId,
        p_shift_person_id: body.shift_person_id || null,
        p_is_new: false,
      });

      if (error) {
        return json({ error: `Modifica non riuscita: ${error.message}` }, 500);
      }

      return json({ ok: true });
    }

    if (action === 'elimina') {
      const userId = String(body.user_id ?? '');
      if (userId === callerId) return json({ error: 'Non puoi eliminare il tuo account' }, 400);
      await ownTarget(userId);

      const { error } = await admin.rpc('delete_member_with_shift', {
        p_org_id: orgId,
        p_user_id: userId,
        p_created_by: callerId,
      });

      if (error) {
        return json({ error: `Eliminazione non riuscita: ${error.message}` }, 500);
      }

      const { count, error: countError } = await admin
        .from('members')
        .select('user_id', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (count === null) {
        return json({ error: 'Impossibile verificare le associazioni residue dell’account' }, 500);
      }

      if (count === 0) {
        const { error: authError } = await admin.auth.admin.deleteUser(userId);

        if (authError) {
          console.error('Errore eliminazione utente Supabase Auth:', {
            userId,
            error: authError.message,
          });

          return json(
            {
              error:
                'Il membro è stato rimosso dall’associazione, ma non è stato possibile eliminare il suo account di accesso.',
            },
            500,
          );
        }
      }

      return json({ ok: true });
    }

    return json({ error: 'Azione sconosciuta' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Errore' }, 400);
  }
});
