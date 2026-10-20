import { font, radius, space, themed, touch } from '@/theme/tokens';

export const useStyles = themed((colors) => ({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space(2),
    paddingVertical: space(1),
  },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: touch, width: 96 },
  backText: { fontFamily: font.bold, fontSize: 15, color: colors.accent },
  content: { padding: space(5), gap: space(5) },
  field: { gap: space(2.5) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space(4), gap: space(2.5) },
  rule: { flexDirection: 'row', alignItems: 'flex-start', gap: space(2.5) },
  ruleText: { flex: 1, fontFamily: font.medium, fontSize: 14, color: colors.text, lineHeight: 20 },
  warn: { fontFamily: font.bold, fontSize: 14, color: colors.warn },
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
