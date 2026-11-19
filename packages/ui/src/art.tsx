import { Text as RNText, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { useTheme } from './theme';

/**
 * The LunchBox mark: a three-tier tiffin carrier, drawn rather than sourced so it recolours with the theme. Chalk-green
 * tiers, a charcoal lid and clamps, and a turmeric middle tier where a family paints their box mark. `mood` retints
 * that middle tier (muted keeps it soft for empty states, danger turns it chilli red); `onPrimary` redraws the box to
 * sit on a chalk-green panel.
 */
export function TiffinArt({ size = 96, mood = 'brand', steam = false }: {
  size?: number;
  mood?: 'brand' | 'accent' | 'muted' | 'danger' | 'onPrimary';
  steam?: boolean;
}) {
  const t = useTheme();
  const c = t.colors;
  const onBrand = mood === 'onPrimary';
  const tier = onBrand ? 'rgba(255,255,255,0.94)' : c.primary;
  const frame = onBrand ? c.primaryPressed : t.dark ? c.onPrimarySoft : c.text;
  const band = { brand: c.accent, accent: c.accent, muted: t.dark ? c.accent : '#F6C877', danger: c.danger, onPrimary: c.accent }[mood];
  const mark = t.dark ? c.onAccent : c.text;
  return (
    <Svg width={size} height={size * (150 / 120)} viewBox="0 0 120 150" accessible={false}>
      {steam ? (
        <G stroke={onBrand ? 'rgba(255,255,255,0.7)' : c.textFaint} strokeWidth={3} strokeLinecap="round" fill="none">
          <Path d="M48 22 C42 15, 54 11, 48 3" />
          <Path d="M72 22 C66 15, 78 11, 72 3" />
        </G>
      ) : null}
      {/* Carry handle */}
      <Path d="M40 40 C40 15, 80 15, 80 40" stroke={frame} strokeWidth={6} strokeLinecap="round" fill="none" />
      {/* Side clamps */}
      <Rect x={26} y={36} width={6} height={102} rx={3} fill={frame} />
      <Rect x={88} y={36} width={6} height={102} rx={3} fill={frame} />
      {/* Lid */}
      <Rect x={30} y={36} width={60} height={9} rx={4.5} fill={frame} />
      {[48, 80, 112].map((y) => (
        <G key={y}>
          <Rect x={20} y={y} width={80} height={28} rx={8} fill={y === 80 ? band : tier} />
          {/* The rim: a darker lip along the bottom of every tier, like the pressed edge of a steel dabba. */}
          <Rect x={20} y={y + 21} width={80} height={7} rx={3.5} fill="#000" opacity={onBrand ? 0.08 : 0.16} />
          <Rect x={30} y={y + 6} width={5} height={12} rx={2.5} fill="#fff" opacity={0.45} />
        </G>
      ))}
      {/* The painted mark on the middle tier */}
      <Rect x={50} y={88} width={20} height={8} rx={2} fill={onBrand ? c.primaryPressed : mark} opacity={0.85} />
      <Circle cx={60} cy={40.5} r={2.6} fill={band} />
    </Svg>
  );
}

/** Wordmark: a compact tiffin glyph beside "LunchBox" set in Khand Bold. */
export function Wordmark({ size = 26, tone = 'default' }: { size?: number; tone?: 'default' | 'onPrimary' }) {
  const t = useTheme();
  const ink = tone === 'onPrimary' ? t.colors.onPrimary : t.colors.text;
  const steel = tone === 'onPrimary' ? 'rgba(255,255,255,0.9)' : t.colors.primary;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="LunchBox"
          style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.3 }}>
      <Svg width={size * 0.8} height={size} viewBox="16 10 88 132" accessible={false}>
        <Path d="M40 40 C40 14, 80 14, 80 40" stroke={ink} strokeWidth={9} strokeLinecap="round" fill="none" />
        <Rect x={20} y={48} width={80} height={28} rx={8} fill={steel} />
        <Rect x={20} y={80} width={80} height={28} rx={8} fill={t.colors.accent} />
        <Rect x={20} y={112} width={80} height={28} rx={8} fill={steel} />
      </Svg>
      <RNText style={{ fontFamily: t.fonts.displayBold, fontSize: size, lineHeight: size * 1.25, color: ink,
        includeFontPadding: false }}>
        LunchBox
      </RNText>
    </View>
  );
}
