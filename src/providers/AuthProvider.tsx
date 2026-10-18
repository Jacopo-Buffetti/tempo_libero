import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  ready: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, ready: false });

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ session: null, ready: false });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState({ session: data.session, ready: true });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, ready: true });
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function useMembership() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['membership', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('members')
        .select('org_id, role, display_name, organizations(name)')
        .eq('user_id', userId!)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
