export const colors = {
  bg: '#F3F5FA',
  surface: '#FFFFFF',
  text: '#141A2A',
  muted: '#5A6275',
  border: '#D6DBE6',
  divider: '#EDF0F6',
  segment: '#E4E8F2',
  accent: '#2350B8',
  accentSoft: '#E8EEFB',
  warn: '#B35400',
  warnSoft: '#FBEBDD',
  ok: '#0F6B4F',
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 20,
} as const;

/** Spaziatura a passi di 4 px: space(4) = 16 */
export const space = (n: number) => n * 4;

export const font = {
  medium: 'Manrope_500Medium',
  bold: 'Manrope_700Bold',
  black: 'Manrope_800ExtraBold',
} as const;

export const type = {
  title: { fontFamily: font.black, fontSize: 30, letterSpacing: -0.6, color: colors.text },
  heading: { fontFamily: font.black, fontSize: 17, color: colors.text },
  body: { fontFamily: font.bold, fontSize: 16, color: colors.text },
  label: { fontFamily: font.bold, fontSize: 14, color: colors.muted },
  caption: { fontFamily: font.medium, fontSize: 13, color: colors.muted },
  number: { fontFamily: font.black, fontSize: 20, color: colors.text },
} as const;

/** Area minima toccabile */
export const touch = 44;
