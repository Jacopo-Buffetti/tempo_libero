import { StyleSheet } from 'react-native';
import { colors, font, radius, space } from '@/theme/tokens';

export const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    minHeight: 52,
    paddingHorizontal: space(4),
  },
  label: { flex: 1, fontFamily: font.bold, fontSize: 16, color: colors.text },
  button: {
    minWidth: 84,
    height: 40,
    paddingHorizontal: space(3),
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { backgroundColor: colors.accentSoft },
  value: { fontFamily: font.black, fontSize: 16, color: colors.text },
  placeholder: { fontFamily: font.bold, color: colors.accent },
});
