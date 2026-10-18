import { StyleSheet } from 'react-native';
import { colors, font, radius, space, touch } from '@/theme/tokens';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: space(5), justifyContent: 'center', gap: space(4) },
  header: { gap: space(4), marginBottom: space(4), alignItems: 'center' },
  logo: { width: '100%', maxWidth: 320, aspectRatio: 900 / 317 },
  subtitle: { fontFamily: font.medium, fontSize: 16, color: colors.muted, lineHeight: 22, textAlign: 'center' },
  field: { gap: space(1.5) },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space(4),
    fontFamily: font.bold,
    fontSize: 16,
    color: colors.text,
  },
  codeInput: { fontFamily: font.black, fontSize: 22, letterSpacing: 6 },
  error: { fontFamily: font.bold, fontSize: 14, color: colors.warn },
  button: {
    height: 54,
    minHeight: touch,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.85 },
  buttonText: { fontFamily: font.black, fontSize: 16, color: colors.onAccent },
  linkButton: { minHeight: touch, alignItems: 'center', justifyContent: 'center' },
  link: { fontFamily: font.bold, fontSize: 15, color: colors.accent },
});
