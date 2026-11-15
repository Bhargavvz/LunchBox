/**
 * LunchBox design tokens: "Ink & Mango".
 *
 * The palette comes from a school morning in India. Royal fountain-pen ink (the blue of every school notebook)
 * carries the brand and the main actions. Mango, the colour of the box mark painted on a lid, is the one thing on a
 * screen that must be noticed; it is only ever a fill under ink-coloured text. Leaf green means delivered and sindoor
 * red means a problem. Surfaces are cool notebook paper, not cream.
 *
 * Text pairs meet WCAG AA (4.5:1) on their intended backgrounds in both modes. `textFaint` is only for disabled
 * text and decoration, never for information.
 */
export const palette = {
  ink900: '#141B2D',
  ink700: '#2E3850',
  ink500: '#4E5870',
  ink300: '#8A93A8',

  royal800: '#1A31A0',
  royal700: '#2340C9',
  royal100: '#E4E9FD',
  royal50: '#F2F4FE',

  mango500: '#FFB020',
  mango800: '#7A4B00',
  mango100: '#FFF1D1',

  leaf700: '#12805A',
  leaf900: '#0B5A3F',
  leaf100: '#DDF3E8',

  sindoor600: '#D1293D',
  sindoor800: '#8E1424',
  sindoor100: '#FCE3E6',

  teal700: '#0F6E7C',
  teal900: '#0A4E58',
  teal100: '#DBF1F3',

  paper: '#F1F3F6',
  paperDeep: '#E5E9EF',
  card: '#FFFFFF',
  line: '#DDE2EA',
  lineStrong: '#C3CAD6',

  white: '#FFFFFF',
  black: '#000000',
} as const;

export interface ThemeColors {
  /** Page background (notebook paper). */
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
  success: string;
  successSoft: string;
  onSuccessSoft: string;
  danger: string;
  onDanger: string;
  dangerSoft: string;
  onDangerSoft: string;
  info: string;
  infoSoft: string;
  onInfoSoft: string;
  scrim: string;
  shadow: string;
  /** The always-dark capsule used by toasts and the camera overlays, in both modes. */
  inkSurface: string;
  onInkSurface: string;
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
 * Both families come from Ek Type (Mumbai) and carry Devanagari, so the Hindi interface is set in the same voice as
 * the English one. Baloo 2 is for titles, the wordmark and the box mark; Mukta for everything people read.
 * One family per weight: Android ignores `fontWeight` for custom fonts, so components never set both.
 */
export const fonts = {
  display: 'Baloo2_600SemiBold',
  displayBold: 'Baloo2_800ExtraBold',
  regular: 'Mukta_400Regular',
  medium: 'Mukta_500Medium',
  semibold: 'Mukta_600SemiBold',
  bold: 'Mukta_700Bold',
} as const;

const shared = {
  spacing: (n: number) => n * 4,
  // Radius follows hierarchy: chips are pills, controls are tight, cards are soft, sheets are softest.
  radius: { xs: 6, sm: 10, md: 12, lg: 18, xl: 26, pill: 999 },
  font: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28, display: 34 },
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
    primary: palette.royal700,
    primaryPressed: palette.royal800,
    onPrimary: palette.white,
    primarySoft: palette.royal100,
    onPrimarySoft: palette.royal800,
    accent: palette.mango500,
    onAccent: '#1C1404',
    accentSoft: palette.mango100,
    onAccentSoft: palette.mango800,
    success: palette.leaf700,
    successSoft: palette.leaf100,
    onSuccessSoft: palette.leaf900,
    danger: palette.sindoor600,
    onDanger: palette.white,
    dangerSoft: palette.sindoor100,
    onDangerSoft: palette.sindoor800,
    info: palette.teal700,
    infoSoft: palette.teal100,
    onInfoSoft: palette.teal900,
    scrim: 'rgba(20, 27, 45, 0.5)',
    shadow: '#1B2440',
    inkSurface: palette.ink900,
    onInkSurface: '#F1F3F6',
  },
};

export const darkTheme: Theme = {
  ...shared,
  dark: true,
  colors: {
    background: '#0D1220',
    sunken: '#080C16',
    surface: '#161D2E',
    text: '#EEF1F8',
    textMuted: '#A3ACC2',
    textFaint: '#636D85',
    border: '#242C40',
    borderStrong: '#343E56',
    primary: '#8FA5FF',
    primaryPressed: '#A9BAFF',
    onPrimary: '#0A1240',
    primarySoft: '#1C2550',
    onPrimarySoft: '#C3CFFF',
    accent: '#FFC14D',
    onAccent: '#1C1404',
    accentSoft: '#3A2A0B',
    onAccentSoft: '#FFD98A',
    success: '#4FD1A0',
    successSoft: '#0F3328',
    onSuccessSoft: '#9CEBCB',
    danger: '#FF7A86',
    onDanger: '#2A0509',
    dangerSoft: '#3D1219',
    onDangerSoft: '#FFB3BA',
    info: '#5FD0DE',
    infoSoft: '#0D2F35',
    onInfoSoft: '#A8E9F1',
    scrim: 'rgba(0, 0, 0, 0.6)',
    shadow: '#000000',
    inkSurface: '#222B40',
    onInkSurface: '#EEF1F8',
  },
};

/**
 * Two quiet levels and one for floating things (toasts, sheets). Shadows are tinted with ink, never neutral grey;
 * on dark surfaces depth comes from the lighter surface colour instead.
 */
export function elevation(theme: Theme, level: 1 | 2 | 3) {
  if (theme.dark) return {};
  const y = { 1: 1, 2: 3, 3: 10 }[level];
  return {
    shadowColor: theme.colors.shadow,
    shadowOpacity: { 1: 0.05, 2: 0.07, 3: 0.14 }[level],
    shadowRadius: { 1: 2, 2: 8, 3: 22 }[level],
    shadowOffset: { width: 0, height: y },
    elevation: { 1: 1, 2: 2, 3: 8 }[level],
  };
}
