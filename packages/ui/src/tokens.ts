/**
 * LunchBox design tokens: "Chalk & Turmeric".
 *
 * The palette comes from the two places a LunchBox travels between. Chalkboard green (the school blackboard, and the
 * banana leaf a home meal is served on) carries the brand and the main actions. Turmeric is the one warm thing that
 * means "now": the tiffin tier the lunchbox is in, a count to look at. Steel greys are the tiffin itself, so surfaces
 * are cool and quiet, never cream. Status colours are kept clear of the brand green: sprout for delivered, chilli for
 * a problem, uniform blue for information.
 *
 * Text pairs meet WCAG AA (4.5:1) on their intended backgrounds in both modes. `textFaint` is only for disabled
 * text and decoration, never for information.
 */
export const palette = {
  char900: '#16201D',
  char700: '#2C3834',
  char500: '#56625D',
  char300: '#8E9A95',

  chalk800: '#153C36',
  chalk700: '#1D4F47',
  chalk100: '#DCEBE6',
  chalk50: '#EEF5F2',

  turmeric500: '#F2A93B',
  turmeric800: '#6B4405',
  turmeric100: '#FDF0D8',

  sprout700: '#2F8F4E',
  sprout900: '#1D5E32',
  sprout100: '#DFF2E4',

  chilli600: '#C8412D',
  chilli800: '#7F2416',
  chilli100: '#FBE4DF',

  uniform700: '#2F6FA8',
  uniform900: '#1C4B75',
  uniform100: '#E2EDF8',

  steel: '#F3F5F4',
  steelDeep: '#E6EBE9',
  card: '#FFFFFF',
  line: '#DCE2DF',
  lineStrong: '#C2CBC7',

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
 * Khand is a condensed face cut from the hand-painted signboards of Indian streets (and the codes painted on tiffin
 * lids): it sets titles, ETAs and box marks. Hind is a calm Indian Type Foundry text face for everything people read.
 * Both carry Devanagari, so Hindi is set in the same voice. One family per weight: Android ignores `fontWeight` for
 * custom fonts, so components never set both.
 */
export const fonts = {
  display: 'Khand_600SemiBold',
  displayBold: 'Khand_700Bold',
  regular: 'Hind_400Regular',
  medium: 'Hind_500Medium',
  semibold: 'Hind_600SemiBold',
  bold: 'Hind_700Bold',
} as const;

const shared = {
  spacing: (n: number) => n * 4,
  // Radius follows hierarchy: chips are pills, controls are tight, cards are soft, sheets are softest.
  radius: { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 },
  font: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 30, display: 38 },
  fonts,
  motion: { fast: 140, base: 220, slow: 360 },
};

export const lightTheme: Theme = {
  ...shared,
  dark: false,
  colors: {
    background: palette.steel,
    sunken: palette.steelDeep,
    surface: palette.card,
    text: palette.char900,
    textMuted: palette.char500,
    textFaint: palette.char300,
    border: palette.line,
    borderStrong: palette.lineStrong,
    primary: palette.chalk700,
    primaryPressed: palette.chalk800,
    onPrimary: palette.white,
    primarySoft: palette.chalk100,
    onPrimarySoft: palette.chalk800,
    accent: palette.turmeric500,
    onAccent: '#2A1A02',
    accentSoft: palette.turmeric100,
    onAccentSoft: palette.turmeric800,
    success: palette.sprout700,
    successSoft: palette.sprout100,
    onSuccessSoft: palette.sprout900,
    danger: palette.chilli600,
    onDanger: palette.white,
    dangerSoft: palette.chilli100,
    onDangerSoft: palette.chilli800,
    info: palette.uniform700,
    infoSoft: palette.uniform100,
    onInfoSoft: palette.uniform900,
    scrim: 'rgba(22, 32, 29, 0.5)',
    shadow: '#16201D',
    inkSurface: palette.char900,
    onInkSurface: '#F3F5F4',
  },
};

export const darkTheme: Theme = {
  ...shared,
  dark: true,
  colors: {
    background: '#0E1513',
    sunken: '#09100E',
    surface: '#17211E',
    text: '#EDF2F0',
    textMuted: '#A3B0AB',
    textFaint: '#66726D',
    border: '#24302C',
    borderStrong: '#34423D',
    primary: '#7FD3BE',
    primaryPressed: '#9BDECD',
    onPrimary: '#0A2620',
    primarySoft: '#1B332D',
    onPrimarySoft: '#BDEBDF',
    accent: '#FFC064',
    onAccent: '#2A1A02',
    accentSoft: '#3A2A0E',
    onAccentSoft: '#FFDCA0',
    success: '#6FD48F',
    successSoft: '#13321E',
    onSuccessSoft: '#B2EDC3',
    danger: '#FF8A78',
    onDanger: '#2C0802',
    dangerSoft: '#3D1710',
    onDangerSoft: '#FFC0B5',
    info: '#7DB4EA',
    infoSoft: '#12283D',
    onInfoSoft: '#BFDBF6',
    scrim: 'rgba(0, 0, 0, 0.6)',
    shadow: '#000000',
    inkSurface: '#22302B',
    onInkSurface: '#EDF2F0',
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
