import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, space, type } from '@/theme/tokens';

export default function Spesa() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={type.title}>Spesa</Text>
      <Text style={type.caption}>Arriva nel passo 4: lista condivisa, prezzi e storico.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, padding: space(5), gap: space(2) },
});
