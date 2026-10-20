import { Appearance, StyleSheet } from 'react-native';

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

const light = {
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
  inverse: palette.ink,
  inverseText: '#FFFFFF',
  checkBorder: '#B7C2B3',
  overlay: 'rgba(12, 20, 14, 0.92)',
  shadow: palette.ink,
};

export type ThemeColors = { [K in keyof typeof light]: string };

export const printColors: ThemeColors = light;

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

export const touch = 44;

Appearance.setColorScheme('light');

const typeFor = (c: ThemeColors) =>
  ({
    title: { fontFamily: font.black, fontSize: 30, letterSpacing: -0.6, color: c.text },
    heading: { fontFamily: font.black, fontSize: 17, color: c.text },
    body: { fontFamily: font.bold, fontSize: 16, color: c.text },
    label: { fontFamily: font.bold, fontSize: 14, color: c.muted },
    caption: { fontFamily: font.medium, fontSize: 13, color: c.muted },
    number: { fontFamily: font.black, fontSize: 20, color: c.text },
  }) as const;

export type Typography = ReturnType<typeof typeFor>;

const theme = { colors: light as ThemeColors, type: typeFor(light) };

export function useTheme() {
  return theme;
}

export function themed<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
) {
  let sheet: T | null = null;
  return function useStyles(): T {
    return (sheet ??= StyleSheet.create(factory(light)));
  };
}
