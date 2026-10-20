import { font, radius, space, themed, touch } from '@/theme/tokens';

export const useStyles = themed((colors) => ({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space(2),
    paddingVertical: space(1),
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: touch, paddingHorizontal: 4 },
  backText: { fontFamily: font.bold, fontSize: 15, color: colors.accent },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  whatsapp: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.leaf,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whatsappPressed: { backgroundColor: colors.accent },

  content: { padding: space(5), paddingTop: space(1), gap: space(4), paddingBottom: space(10) },
  hero: { gap: space(1) },
  totalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space(4),
    gap: space(3),
  },
  total: { fontFamily: font.black, fontSize: 30, letterSpacing: -0.6, color: colors.text },
  warnText: { color: colors.warn },
  runs: { gap: space(3) },
}));
