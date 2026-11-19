import { useTheme } from '@lunchbox/ui';
import { memo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, Pattern, Rect } from 'react-native-svg';

const TILE = 180;

/**
 * Soft, hand-drawn school things (bag, lunchbox, book, pencil, apple, stars) tiled behind the parent screens. Line art
 * at very low opacity in the theme's own colours, so cards, text and buttons stay fully readable in light and dark
 * mode; the pattern tiles, so it fills any screen size without scaling artefacts.
 */
export const SchoolDoodles = memo(function SchoolDoodles() {
  const theme = useTheme();
  const ink = theme.colors.primary;
  const warm = theme.colors.accent;
  const opacity = theme.dark ? 0.09 : 0.075;
  const line = { stroke: ink, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const warmLine = { ...line, stroke: warm };

  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" accessible={false} importantForAccessibility="no-hide-descendants">
      <Defs>
        <Pattern id="school" patternUnits="userSpaceOnUse" width={TILE} height={TILE}>
          <G opacity={opacity}>
            {/* School bag */}
            <G transform="translate(14 18) rotate(-8 22 26)">
              <Rect x={4} y={10} width={38} height={44} rx={9} {...line} />
              <Path d="M14 10 V6 a9 9 0 0 1 18 0 v4" {...line} />
              <Path d="M4 26 H42" {...line} />
              <Rect x={16} y={32} width={14} height={10} rx={3} {...line} />
            </G>
            {/* Tiffin / lunchbox */}
            <G transform="translate(104 12) rotate(6 28 26)">
              <Rect x={6} y={14} width={44} height={12} rx={4} {...warmLine} />
              <Rect x={6} y={28} width={44} height={12} rx={4} {...warmLine} />
              <Rect x={6} y={42} width={44} height={10} rx={4} {...warmLine} />
              <Path d="M18 14 V8 a10 7 0 0 1 20 0 v6" {...warmLine} />
            </G>
            {/* Open book */}
            <G transform="translate(18 104) rotate(4 28 20)">
              <Path d="M28 8 C20 2 10 2 2 6 V40 C10 36 20 36 28 42 Z" {...line} />
              <Path d="M28 8 C36 2 46 2 54 6 V40 C46 36 36 36 28 42" {...line} />
              <Line x1={10} y1={16} x2={22} y2={18} {...line} />
              <Line x1={36} y1={18} x2={48} y2={16} {...line} />
            </G>
            {/* Pencil */}
            <G transform="translate(108 104) rotate(-35 30 10)">
              <Rect x={6} y={4} width={40} height={12} rx={2} {...warmLine} />
              <Path d="M46 4 L58 10 L46 16" {...warmLine} />
              <Line x1={14} y1={4} x2={14} y2={16} {...warmLine} />
            </G>
            {/* Apple */}
            <G transform="translate(74 70)">
              <Path d="M14 6 C6 2 0 9 2 17 C4 25 9 28 14 26 C19 28 24 25 26 17 C28 9 22 2 14 6 Z" {...line} />
              <Path d="M14 6 C14 2 16 0 19 0" {...line} />
            </G>
            {/* Stars */}
            <Path d="M160 74 l2.5 5 5.5 .8 -4 3.9 1 5.5 -5 -2.6 -5 2.6 1 -5.5 -4 -3.9 5.5 -.8 Z" {...warmLine} />
            <Circle cx={70} cy={160} r={3} {...line} />
            <Circle cx={168} cy={168} r={2.5} {...warmLine} />
          </G>
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill="url(#school)" />
    </Svg>
  );
});
