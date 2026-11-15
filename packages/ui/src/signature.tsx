import { ChevronsRight, Check } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, PanResponder, Text as RNText, View } from 'react-native';
import { haptic } from './haptics';
import { Icon } from './icons';
import { useTheme } from './theme';

const SIZES = {
  sm: { h: 26, font: 15, pad: 7, gap: 5, radius: 6 },
  md: { h: 38, font: 22, pad: 10, gap: 7, radius: 8 },
  lg: { h: 64, font: 40, pad: 16, gap: 12, radius: 12 },
} as const;

/**
 * The box mark: the code a family writes on their child's lunchbox lid (two letters, two digits), shown the way a
 * dabbawala paints it: ink on a mango lid, letters and numbers split by a stroke. The same mark appears in the parent
 * app, at pickup and at the school gate, so a box is matched by sight and never swapped.
 */
export function BoxMark({ code, size = 'md', testID }: { code: string; size?: keyof typeof SIZES; testID?: string }) {
  const t = useTheme();
  const s = SIZES[size];
  const letters = code.slice(0, 2);
  const digits = code.slice(2);
  const text = {
    fontFamily: t.fonts.displayBold,
    fontSize: s.font,
    lineHeight: s.font * 1.15,
    color: t.colors.onAccent,
    includeFontPadding: false,
    letterSpacing: s.font * 0.06,
    fontVariant: ['tabular-nums' as const],
  };
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Box mark ${code.split('').join(' ')}`}
      testID={testID}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: s.gap,
        height: s.h,
        paddingHorizontal: s.pad,
        borderRadius: s.radius,
        backgroundColor: t.colors.accent,
        // A darker rim reads as a painted lid edge rather than a flat sticker.
        borderWidth: size === 'lg' ? 3 : 1.5,
        borderColor: 'rgba(28,20,4,0.22)',
      }}
    >
      <RNText style={text}>{letters}</RNText>
      <View style={{ width: size === 'lg' ? 3 : 2, height: s.font * 0.72, borderRadius: 2, backgroundColor: t.colors.onAccent,
        opacity: 0.75 }} />
      <RNText style={text}>{digits}</RNText>
    </View>
  );
}

/**
 * Drag the thumb to the end to confirm. Used for the rider's irreversible, outdoor actions (confirm pickup, hand
 * over at school), where a stray tap from a pocket or a glove must not count. Screen readers get a plain "activate"
 * action instead of the drag.
 */
export function SlideToConfirm({
  label,
  onConfirm,
  disabled,
  loading,
  tone = 'primary',
  testID,
}: {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'primary' | 'success';
  testID?: string;
}) {
  const t = useTheme();
  const c = t.colors;
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const fired = useRef(false);
  const THUMB = 56;
  const PAD = 4;
  const travel = Math.max(0, width - THUMB - PAD * 2);
  const fill = tone === 'success' ? c.success : c.primary;
  const onFill = tone === 'success' ? (t.dark ? c.background : c.onPrimary) : c.onPrimary;
  const inactive = disabled || loading;

  useEffect(() => {
    if (!loading) {
      fired.current = false;
      Animated.spring(x, { toValue: 0, useNativeDriver: false, speed: 18, bounciness: 6 }).start();
    }
  }, [loading, x]);

  const confirm = () => {
    if (fired.current) return;
    fired.current = true;
    haptic.success();
    onConfirm();
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => haptic.tap(),
      onPanResponderMove: (_, g) => x.setValue(Math.min(Math.max(0, g.dx), travelRef.current)),
      onPanResponderRelease: (_, g) => {
        if (g.dx >= travelRef.current * 0.86 && travelRef.current > 0) {
          Animated.timing(x, { toValue: travelRef.current, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: false })
            .start(() => confirmRef.current());
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: false, speed: 18, bounciness: 8 }).start();
        }
      },
    }),
  ).current;
  // The responder is created once; read the latest layout and callback through refs.
  const travelRef = useRef(travel);
  travelRef.current = travel;
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;

  const labelOpacity = travel > 0 ? x.interpolate({ inputRange: [0, travel * 0.6], outputRange: [1, 0], extrapolate: 'clamp' }) : 1;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Slide to the right to confirm"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate' && !inactive) confirm();
      }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        height: THUMB + PAD * 2,
        borderRadius: (THUMB + PAD * 2) / 2,
        backgroundColor: inactive ? c.sunken : fill,
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* The trail behind the thumb darkens as it travels, so progress is visible without reading. */}
      {!inactive && travel > 0 ? (
        <Animated.View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.16)',
          width: Animated.add(x, THUMB + PAD * 2) }} />
      ) : null}
      <Animated.View style={{ position: 'absolute', left: THUMB + PAD * 2, right: PAD * 4, alignItems: 'center',
        opacity: labelOpacity }} pointerEvents="none">
        <RNText numberOfLines={1} style={{ fontFamily: t.fonts.bold, fontSize: 17, includeFontPadding: false,
          color: inactive ? c.textMuted : onFill }}>
          {label}
        </RNText>
      </Animated.View>
      <Animated.View
        {...(inactive ? {} : responder.panHandlers)}
        style={{
          position: 'absolute',
          left: PAD,
          width: THUMB,
          height: THUMB,
          borderRadius: THUMB / 2,
          backgroundColor: inactive ? c.surface : onFill,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ translateX: x }],
        }}
      >
        {loading ? (
          <ActivityIndicator color={fill} />
        ) : (
          <Icon as={fired.current ? Check : ChevronsRight} size={26} color={inactive ? c.textFaint : fill} strokeWidth={2.4} />
        )}
      </Animated.View>
    </View>
  );
}
