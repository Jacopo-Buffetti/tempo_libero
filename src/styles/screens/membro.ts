import { font, radius, space, themed, touch } from '@/theme/tokens';

export const useStyles = themed((colors) => ({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  topBar: { paddingHorizontal: space(2), paddingVertical: space(1) },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: touch, alignSelf: 'flex-start' },
  backText: { fontFamily: font.bold, fontSize: 15, color: colors.accent },
  content: { padding: space(5), paddingTop: space(1), gap: space(6), paddingBottom: space(8) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  error: { fontFamily: font.bold, fontSize: 14, color: colors.warn, textAlign: 'center' },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
    minHeight: touch,
  },
  deleteText: { fontFamily: font.bold, fontSize: 15, color: colors.warn },
  footer: { paddingHorizontal: space(5), paddingVertical: space(3) },
  primary: {
    height: 54,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryPressed: { backgroundColor: colors.accentInk },
  primaryText: { fontFamily: font.black, fontSize: 16, color: colors.onAccent },
  disabled: { opacity: 0.45 },
}));
