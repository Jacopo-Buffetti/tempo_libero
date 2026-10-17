import { Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { colors, font, radius, space, touch, type } from '@/theme/tokens';

export default function Menu() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={type.title}>Menù</Text>
      <Text style={type.caption}>Arriva nel passo 5: menù, locandine e storico.</Text>

      {/* Provvisorio, utile durante lo sviluppo per provare il login */}
      <Pressable onPress={() => supabase.auth.signOut()} style={styles.logout}>
        <Text style={styles.logoutText}>Esci</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, padding: space(5), gap: space(2) },
  logout: {
    marginTop: space(6),
    minHeight: touch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { fontFamily: font.bold, fontSize: 15, color: colors.text },
});
