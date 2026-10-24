import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from './theme';
import type { ThemeColors } from './tokens';

export type { LucideIcon } from 'lucide-react-native';

/** Icons are decorative by default; the control that holds one carries the accessible name. */
export function Icon({
  as: Glyph,
  size = 20,
  color = 'text',
  strokeWidth = 1.75,
}: {
  as: LucideIcon;
  size?: number;
  color?: keyof ThemeColors | (string & {});
  strokeWidth?: number;
}) {
  const t = useTheme();
  const resolved = color in t.colors ? t.colors[color as keyof ThemeColors] : color;
  return <Glyph size={size} color={resolved} strokeWidth={strokeWidth} accessible={false} />;
}
