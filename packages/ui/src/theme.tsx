import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type Theme } from './tokens';

const ThemeContext = createContext<Theme>(lightTheme);

/** Follows the device appearance unless `scheme` pins it (tests, previews). */
export function ThemeProvider({ children, scheme }: { children: ReactNode; scheme?: 'light' | 'dark' }) {
  const device = useColorScheme();
  const resolved = scheme ?? device;
  return <ThemeContext.Provider value={resolved === 'dark' ? darkTheme : lightTheme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
