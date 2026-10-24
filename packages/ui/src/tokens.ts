/**
 * LunchBox design tokens — "Tiffin".
 *
 * The palette comes from the things the product is about: curry-leaf green (the brand), turmeric (attention, never
 * body text), chilli (problems), block-print indigo (information), on warm paper instead of clinical grey. Text pairs
 * meet WCAG AA (4.5:1) on their intended backgrounds; turmeric is only ever a fill under ink-coloured text.
 */
export const palette = {
  leaf900: '#0F3326',
  leaf800: '#164634',
  leaf700: '#1E5A43',
  leaf500: '#3B8A68',
  leaf300: '#8EC2A7',
  leaf100: '#E2EEE6',
  leaf50: '#F1F7F3',

  turmeric700: '#7A4A0B',
  turmeric600: '#B9761C',
  turmeric500: '#E3A03A',
  turmeric100: '#FBEBD0',

  chilli700: '#8A2B19',
  chilli600: '#B23A24',
  chilli100: '#F7E1DA',

  indigo700: '#22385F',
  indigo600: '#2E4A7D',
  indigo100: '#E2E8F3',

  ink900: '#1C1A17',
  ink700: '#46413A',
  ink500: '#6E675D',
  ink300: '#B8B0A3',

  paper: '#F6F2EA',
  paperDeep: '#EDE6D9',
  card: '#FFFDF8',
  line: '#E5DDCF',
  lineStrong: '#D3C8B6',

  white: '#FFFFFF',
  black: '#000000',
} as const;

export interface ThemeColors {
  /** Page background (warm paper). */
  background: string;
  /** Recessed areas: inputs, segmented tracks, skeletons. */
  sunken: string;
  /** Cards and sheets. */
  surface: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  borderStrong: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  primarySoft: string;
  onPrimarySoft: string;
  accent: string;
  onAccent: string;
  accentSoft: string;
  onAccentSoft: string;
  danger: string;
  onDanger: string;
  dangerSoft: string;
  onDangerSoft: string;
  info: string;
  infoSoft: string;
  onInfoSoft: string;
  scrim: string;
  shadow: string;
}

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
  spacing: (n: number) => number;
  radius: { xs: number; sm: number; md: number; lg: number; xl: number; pill: number };
  font: { xs: number; sm: number; md: number; lg: number; xl: number; xxl: number; display: number };
  fonts: typeof fonts;
  motion: { fast: number; base: number; slow: number };
}

/**
 * Families are loaded by each app with expo-font (see `fontAssets` in the app root layout). One family per weight:
 * Android ignores `fontWeight` for custom fonts, so components never set it alongside these.
 */
export const fonts = {
  display: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  regular: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
} as const;

const shared = {
  spacing: (n: number) => n * 4,
  radius: { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 },
  font: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28, display: 36 },
  fonts,
  motion: { fast: 140, base: 220, slow: 360 },
};

export const lightTheme: Theme = {
  ...shared,
  dark: false,
  colors: {
    background: palette.paper,
    sunken: palette.paperDeep,
    surface: palette.card,
    text: palette.ink900,
    textMuted: palette.ink500,
    textFaint: palette.ink300,
    border: palette.line,
    borderStrong: palette.lineStrong,
    primary: palette.leaf700,
    primaryPressed: palette.leaf800,
    onPrimary: palette.white,
    primarySoft: palette.leaf100,
    onPrimarySoft: palette.leaf800,
    accent: palette.turmeric500,
    onAccent: palette.ink900,
    accentSoft: palette.turmeric100,
    onAccentSoft: palette.turmeric700,
    danger: palette.chilli600,
    onDanger: palette.white,
    dangerSoft: palette.chilli100,
    onDangerSoft: palette.chilli700,
    info: palette.indigo600,
    infoSoft: palette.indigo100,
    onInfoSoft: palette.indigo700,
    scrim: 'rgba(28, 26, 23, 0.45)',
    shadow: '#3A2A12',
  },
};

export const darkTheme: Theme = {
  ...shared,
  dark: true,
  colors: {
    background: '#141311',
    sunken: '#0E0D0C',
    surface: '#1E1C19',
    text: '#F3EEE5',
    textMuted: '#A99F91',
    textFaint: '#6B6358',
    border: '#2F2B26',
    borderStrong: '#423D35',
    primary: '#79C7A2',
    primaryPressed: '#5FB58C',
    onPrimary: '#0B2419',
    primarySoft: '#173328',
    onPrimarySoft: '#A9DDC3',
    accent: '#EDB257',
    onAccent: '#1C1A17',
    accentSoft: '#3A2C14',
    onAccentSoft: '#F3CD8E',
    danger: '#F08A72',
    onDanger: '#2A0E07',
    dangerSoft: '#3B1D16',
    onDangerSoft: '#F7B7A6',
    info: '#9DB5E3',
    infoSoft: '#1C2638',
    onInfoSoft: '#C3D2F0',
    scrim: 'rgba(0, 0, 0, 0.6)',
    shadow: '#000000',
  },
};

/** Warm, low-contrast shadows; on dark surfaces depth comes from the border instead. */
export function elevation(theme: Theme, level: 1 | 2 | 3) {
  if (theme.dark) return {};
  const y = { 1: 1, 2: 4, 3: 10 }[level];
  return {
    shadowColor: theme.colors.shadow,
    shadowOpacity: { 1: 0.06, 2: 0.08, 3: 0.12 }[level],
    shadowRadius: { 1: 2, 2: 10, 3: 24 }[level],
    shadowOffset: { width: 0, height: y },
    elevation: { 1: 1, 2: 3, 3: 8 }[level],
  };
}
