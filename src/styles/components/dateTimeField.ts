import { font, radius, space, themed, touch } from '@/theme/tokens';

export const useStyles = themed((colors) => ({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    minHeight: 56,
    paddingHorizontal: space(4),
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  pressed: { backgroundColor: colors.pressed },
  label: { flex: 1, fontFamily: font.bold, fontSize: 16, color: colors.text },
  value: { flex: 1, fontFamily: font.bold, fontSize: 16, color: colors.text },
  prefix: { minWidth: 44, fontFamily: font.bold, fontSize: 14, color: colors.muted },
  placeholder: { color: colors.muted, fontFamily: font.medium },
  timePress: { flex: 1, minHeight: touch, justifyContent: 'center' },
  addTime: {
    minHeight: 36,
    paddingHorizontal: space(3),
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    justifyContent: 'center',
  },
  addTimeText: { fontFamily: font.bold, fontSize: 14, color: colors.accent },
}));
