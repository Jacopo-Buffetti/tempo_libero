import { StyleSheet } from 'react-native';
import { colors, font, radius, space, touch } from '@/theme/tokens';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  topBar: { paddingHorizontal: space(2), paddingVertical: space(1) },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: touch, alignSelf: 'flex-start' },
  backText: { fontFamily: font.bold, fontSize: 15, color: colors.accent },
  content: { padding: space(5), paddingTop: space(1), gap: space(4), paddingBottom: space(10) },
  hero: { gap: space(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  all: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    padding: space(4),
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
  },
  allPressed: { backgroundColor: colors.accentInk },
  allTitle: { fontFamily: font.black, fontSize: 16, color: colors.onAccent },
  allCaption: { fontFamily: font.medium, fontSize: 13, color: colors.accentSoft },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    minHeight: 58,
    paddingHorizontal: space(4),
    paddingVertical: space(2),
  },
  rowPressed: { backgroundColor: colors.pressed },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  warn: { fontFamily: font.bold, fontSize: 14, color: colors.warn },
});
