import { font, themed } from '@/theme/tokens';

export const useStyles = themed((colors) => ({
  chip: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idle: { backgroundColor: colors.surface, borderColor: colors.border },
  pressed: { backgroundColor: colors.segment },
  label: { fontFamily: font.bold, fontSize: 13, color: colors.text },
}));
