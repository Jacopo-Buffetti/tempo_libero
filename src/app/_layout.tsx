import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useFonts,
  Manrope_500Medium,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function RootNavigator() {
  const { colors } = useTheme();
  const { session, ready } = useAuth();
  const [fontsLoaded] = useFonts({ Manrope_500Medium, Manrope_700Bold, Manrope_800ExtraBold });

  useEffect(() => {
    if (ready && fontsLoaded) SplashScreen.hideAsync();
  }, [ready, fontsLoaded]);

  if (!ready || !fontsLoaded) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(app)" />
          <Stack.Screen name="nuovo-oggetto" options={{ presentation: 'modal' }} />
          <Stack.Screen name="ricerca" options={{ animation: 'fade' }} />
          <Stack.Screen name="oggetto/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="inventario/dati" options={{ presentation: 'modal' }} />
          <Stack.Screen name="spesa/nuova" options={{ presentation: 'modal' }} />
          <Stack.Screen name="spesa/[id]" />
          <Stack.Screen name="spesa/chiudi/[id]" />
          <Stack.Screen name="spesa/pagamento" />
          <Stack.Screen name="spesa/rimborsi" />
          <Stack.Screen name="spesa/voce" options={{ presentation: 'modal' }} />
          <Stack.Screen name="spesa/modifica/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="menu/nuovo" options={{ presentation: 'modal' }} />
          <Stack.Screen name="menu/[id]" />
          <Stack.Screen name="menu/piatto" options={{ presentation: 'modal' }} />
          <Stack.Screen name="menu/modifica/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="calendario/turno/[date]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="calendario/genera" options={{ presentation: 'modal' }} />
          <Stack.Screen name="calendario/esporta" options={{ presentation: 'modal' }} />
          <Stack.Screen name="calendario/consiglieri" />
          <Stack.Screen name="calendario/affitto" options={{ presentation: 'modal' }} />
          <Stack.Screen name="calendario/contratto" />
          <Stack.Screen name="calendario/contratto-parco" />
          <Stack.Screen name="calendario/verbale" />
          <Stack.Screen name="calendario/clienti" />
          <Stack.Screen name="calendario/cliente/[id]" />
          <Stack.Screen name="membri/index" />
          <Stack.Screen name="membri/[id]" options={{ presentation: 'modal' }} />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </QueryClientProvider>
  );
}
