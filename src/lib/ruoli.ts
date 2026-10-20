import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth, useMembership } from '@/providers/AuthProvider';

export type Role = 'admin' | 'consigliere' | 'volontario';

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Amministratore',
  consigliere: 'Consigliere',
  volontario: 'Volontario',
};

export function useRole() {
  const { session } = useAuth();
  const membership = useMembership();
  const role = (membership.data?.role ?? null) as Role | null;
  return {
    userId: session?.user.id ?? null,
    orgId: membership.data?.org_id as string | undefined,
    role,
    isAdmin: role === 'admin',
    isConsigliere: role === 'admin' || role === 'consigliere',
    isVolontario: role === 'volontario',
    loading: membership.isLoading,
  };
}

export function useMyShiftPerson(orgId?: string, userId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ['ruoli', 'turni', orgId, userId],
    enabled: enabled && !!orgId && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shift_people')
        .select('id, name, nickname')
        .eq('org_id', orgId!)
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type Member = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: Role;
  created_by: string | null;
  shift_person_id: string | null;
};

export function useMembers(orgId?: string, enabled = true) {
  return useQuery({
    queryKey: ['ruoli', 'membri', orgId],
    enabled: enabled && !!orgId,
    queryFn: async () => {
      const [{ data: members, error }, { data: links }] = await Promise.all([
        supabase
          .from('members')
          .select('user_id, display_name, email, role, created_by')
          .eq('org_id', orgId!)
          .order('display_name'),
        supabase.from('shift_people').select('id, user_id').eq('org_id', orgId!).not('user_id', 'is', null),
      ]);
      if (error) throw error;
      const byUser = new Map((links ?? []).map((l) => [l.user_id as string, l.id as string]));
      return (members ?? []).map((m) => ({
        ...m,
        shift_person_id: byUser.get(m.user_id) ?? null,
      })) as Member[];
    },
  });
}

const STATUS_HINTS: Record<number, string> = {
  401: 'accesso non valido: esci dall’account e rientra',
  403: 'serve un account da amministratore',
  404: 'la funzione gestisci-membri non è pubblicata su Supabase',
  500: 'errore nella funzione: guarda i log su Supabase',
};

async function readFunctionError(error: unknown) {
  const e = error as { message?: string; context?: Response };
  const response = e.context;
  if (response && typeof response.status === 'number') {
    let detail = '';
    try {
      const body = await response.clone().json();
      detail = body?.error ?? body?.message ?? body?.msg ?? '';
    } catch {
      detail = await response
        .clone()
        .text()
        .catch(() => '');
    }
    const text = detail || STATUS_HINTS[response.status] || 'errore sconosciuto';
    return `${text} (codice ${response.status})`;
  }
  if (/fetch|network/i.test(e.message ?? '')) return 'Funzione non raggiungibile: è stata pubblicata?';
  return e.message ?? 'Operazione non riuscita';
}

export type MemberInput =
  | { action: 'crea'; email: string; display_name: string; role: Role; shift_person_id: string | null }
  | { action: 'modifica'; user_id: string; display_name: string; role: Role; shift_person_id: string | null }
  | { action: 'elimina'; user_id: string };

export function useManageMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MemberInput) => {
      const { error } = await supabase.functions.invoke('gestisci-membri', { body: input });
      if (error) throw new Error(await readFunctionError(error));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ruoli'] });
      queryClient.invalidateQueries({ queryKey: ['turni'] });
    },
  });
}
