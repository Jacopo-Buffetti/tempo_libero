export const palette = {
  pine: '#036930',
  pineDeep: '#024A22',
  leaf: '#34A94C',
  leafSoft: '#E2F1E5',
  sun: '#FFC61A',
  sunSoft: '#FFF4D1',
  cream: '#FFFDF6',
  ink: '#1E2B22',
  stone: '#5F6B62',
} as const;

export const colors = {
  bg: '#F4F6EF',
  surface: '#FFFFFF',
  text: palette.ink,
  muted: palette.stone,
  placeholder: '#97A196',
  border: '#D5DDCC',
  divider: '#ECF0E6',
  segment: '#E5EBDC',
  pressed: '#F1F5EB',

  accent: palette.pine,
  accentSoft: palette.leafSoft,
  accentInk: palette.pineDeep,
  leaf: palette.leaf,

  sun: palette.sun,
  sunSoft: palette.sunSoft,
  highlight: '#FFE7A0',

  warn: '#B25E09',
  warnSoft: '#FCEFD8',
  warnInk: '#6E3A05',

  ok: '#1F7A3A',
  okSoft: '#E3F2E6',

  onAccent: '#FFFFFF',
  checkBorder: '#B7C2B3',
  overlay: 'rgba(12, 20, 14, 0.92)',
  shadow: palette.ink,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 20,
} as const;

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

export const touch = 44;
