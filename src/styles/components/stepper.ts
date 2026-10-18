import { StyleSheet } from 'react-native';
import { colors, font, touch } from '@/theme/tokens';

export const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  button: {
    width: touch,
    height: touch,
    borderRadius: 12,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.35 },
  pressed: { backgroundColor: colors.segment },
  buttonText: { fontFamily: font.bold, fontSize: 20, color: colors.text },
  input: {
    minWidth: 64,
    height: touch,
    textAlign: 'center',
    fontFamily: font.black,
    fontSize: 20,
    color: colors.text,
    padding: 0,
  },
});
