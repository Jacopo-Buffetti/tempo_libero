import { font, radius, space, themed, touch } from '@/theme/tokens';

export const useStyles = themed((colors) => ({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space(5), paddingTop: space(3), gap: space(4) },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2.5),
    height: 48,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    paddingHorizontal: space(3),
  },
  input: { flex: 1, fontFamily: font.bold, fontSize: 16, color: colors.text, padding: 0 },
  close: { minHeight: touch, justifyContent: 'center', paddingHorizontal: space(1) },
  closeText: { fontFamily: font.bold, fontSize: 15, color: colors.accent },
  group: { gap: space(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  list: { padding: space(5), paddingBottom: space(10) },
  count: { marginBottom: space(2) },
  hint: { textAlign: 'center', marginTop: space(10), paddingHorizontal: space(8) },
}));
