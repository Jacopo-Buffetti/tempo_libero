import { ActivityIndicator, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useList } from '@/lib/spesa';
import { ListaAperta } from '@/components/spesa/ListaAperta';
import { ListaChiusa } from '@/components/spesa/ListaChiusa';
import { useTheme } from '@/theme/tokens';
import { useStyles } from '@/styles/screens/spesa/lista';

export default function Lista() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const list = useList(id);

  if (list.isLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (!list.data) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={type.heading}>Lista non trovata</Text>
        <Text style={type.caption}>Potrebbe essere stata eliminata.</Text>
        <Pressable onPress={() => router.back()} style={styles.link}>
          <Text style={styles.linkText}>Torna alle liste</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return list.data.status === 'aperta' ? <ListaAperta list={list.data} /> : <ListaChiusa list={list.data} />;
}
