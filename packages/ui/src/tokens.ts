/**
 * Design tokens shared by the parent and partner apps. Colour pairs meet WCAG AA (4.5:1) for body text on their
 * intended backgrounds.
 */
export const palette = {
  green700: '#0F6B45',
  green600: '#14875A',
  green100: '#DDF3E8',
  saffron500: '#F5A623',
  saffron100: '#FFF3DC',
  red600: '#C62828',
  red100: '#FDE7E7',
  blue600: '#1E5BB8',
  blue100: '#E3EDFB',
  grey900: '#1A1D21',
  grey700: '#454B54',
  grey500: '#6B7280',
  grey300: '#C9CED6',
  grey100: '#F2F4F7',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export interface Theme {
  colors: {
    background: string;
    surface: string;
    text: string;
    textMuted: string;
    border: string;
    primary: string;
    onPrimary: string;
    primarySoft: string;
    accent: string;
    accentSoft: string;
    danger: string;
    dangerSoft: string;
    info: string;
    infoSoft: string;
  };
  spacing: (n: number) => number;
  radius: { sm: number; md: number; lg: number; pill: number };
  font: { xs: number; sm: number; md: number; lg: number; xl: number; xxl: number };
}

export const lightTheme: Theme = {
  colors: {
    background: palette.grey100,
    surface: palette.white,
    text: palette.grey900,
    textMuted: palette.grey700,
    border: palette.grey300,
    primary: palette.green600,
    onPrimary: palette.white,
    primarySoft: palette.green100,
    accent: palette.saffron500,
    accentSoft: palette.saffron100,
    danger: palette.red600,
    dangerSoft: palette.red100,
    info: palette.blue600,
    infoSoft: palette.blue100,
  },
  spacing: (n) => n * 4,
  radius: { sm: 6, md: 10, lg: 16, pill: 999 },
  font: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28 },
};

export const darkTheme: Theme = {
  ...lightTheme,
  colors: {
    background: '#0E1114',
    surface: '#171B20',
    text: '#F2F4F7',
    textMuted: '#B4BAC3',
    border: '#2C333B',
    primary: '#3CC48A',
    onPrimary: '#06241A',
    primarySoft: '#123526',
    accent: palette.saffron500,
    accentSoft: '#3A2B0E',
    danger: '#FF6B6B',
    dangerSoft: '#3A1414',
    info: '#7FB0FF',
    infoSoft: '#132743',
  },
};
