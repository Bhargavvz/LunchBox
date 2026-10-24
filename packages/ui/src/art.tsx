import { Text as RNText, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { useTheme } from './theme';

/**
 * The LunchBox mark: a three-tier steel tiffin carrier, drawn rather than sourced so it can recolour with the theme.
 * `mood` tints the middle tier for empty states (accent = "nothing yet", danger = "something went wrong");
 * `onPrimary` redraws it to sit on a brand-coloured panel.
 */
export function TiffinArt({ size = 96, mood = 'brand', steam = false }: {
  size?: number;
  mood?: 'brand' | 'accent' | 'muted' | 'danger' | 'onPrimary';
  steam?: boolean;
}) {
  const t = useTheme();
  const c = t.colors;
  const onBrand = mood === 'onPrimary';
  const frame = onBrand ? (t.dark ? '#1B3A2C' : '#0F2A1F') : t.dark ? '#CFC6B8' : '#3A352E';
  const tierA = mood === 'muted' ? c.borderStrong : onBrand ? c.onPrimary : c.primary;
  const tierB = { brand: c.accent, accent: c.accent, muted: c.border, danger: c.danger, onPrimary: c.accent }[mood];
  const shine = t.dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.4)';
  return (
    <Svg width={size} height={size * (150 / 120)} viewBox="0 0 120 150" accessible={false}>
      {steam ? (
        <G stroke={onBrand ? c.onPrimary : c.textFaint} strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.8}>
          <Path d="M50 20 C44 14, 56 10, 50 3" />
          <Path d="M70 20 C64 14, 76 10, 70 3" />
        </G>
      ) : null}
      {/* Handle */}
      <Path d="M40 40 C40 14, 80 14, 80 40" stroke={frame} strokeWidth={6} strokeLinecap="round" fill="none" />
      {/* Side clamps */}
      <Rect x={27} y={36} width={6} height={100} rx={3} fill={frame} />
      <Rect x={87} y={36} width={6} height={100} rx={3} fill={frame} />
      {/* Lid */}
      <Rect x={30} y={36} width={60} height={10} rx={5} fill={frame} />
      {/* Tiers */}
      {[{ y: 48, fill: tierA }, { y: 80, fill: tierB }, { y: 112, fill: tierA }].map((tier) => (
        <G key={tier.y}>
          <Rect x={22} y={tier.y} width={76} height={28} rx={9} fill={tier.fill} />
          <Rect x={22} y={tier.y} width={76} height={6} rx={3} fill="#000" opacity={0.08} />
          <Rect x={31} y={tier.y + 9} width={6} height={13} rx={3} fill={shine} />
        </G>
      ))}
      {/* Latch */}
      <Circle cx={60} cy={41} r={3} fill={tierB} />
    </Svg>
  );
}

/** Wordmark: a compact tiffin glyph beside "LunchBox" in the display serif. */
export function Wordmark({ size = 26, tone = 'default' }: { size?: number; tone?: 'default' | 'onPrimary' }) {
  const t = useTheme();
  const ink = tone === 'onPrimary' ? t.colors.onPrimary : t.colors.text;
  const tier = tone === 'onPrimary' ? t.colors.onPrimary : t.colors.primary;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="LunchBox"
          style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.35 }}>
      <Svg width={size * 0.85} height={size} viewBox="16 10 88 132" accessible={false}>
        <Path d="M40 40 C40 14, 80 14, 80 40" stroke={ink} strokeWidth={9} strokeLinecap="round" fill="none" />
        <Rect x={22} y={48} width={76} height={28} rx={9} fill={tier} />
        <Rect x={22} y={80} width={76} height={28} rx={9} fill={t.colors.accent} />
        <Rect x={22} y={112} width={76} height={28} rx={9} fill={tier} />
      </Svg>
      <RNText style={{ fontFamily: t.fonts.display, fontSize: size, color: ink, letterSpacing: -0.5 }}>LunchBox</RNText>
    </View>
  );
}
