import { StyleSheet } from 'react-native';
import { colors, font, radius, space } from '@/theme/tokens';

export const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: space(2) },
  tile: {
    flex: 1,
    height: 88,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(1.5),
  },
  tileActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tileText: { fontFamily: font.bold, fontSize: 14, color: colors.text },
  tileTextActive: { color: colors.onAccent },
  check: {
    position: 'absolute',
    top: space(2),
    right: space(2),
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.onAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
