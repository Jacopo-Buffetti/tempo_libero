import { StyleSheet } from 'react-native';
import { colors, font, space, touch } from '@/theme/tokens';

export const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
    padding: space(8),
  },
  link: { minHeight: touch, justifyContent: 'center' },
  linkText: { fontFamily: font.bold, fontSize: 15, color: colors.accent },
});
