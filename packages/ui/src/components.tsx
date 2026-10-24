import { AlertCircle, CheckCircle2, ChevronRight, Info, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text as RNText,
  TextInput,
  View,
  type AccessibilityRole,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from './haptics';
import { Icon } from './icons';
import { useTheme } from './theme';
import { elevation, type Theme, type ThemeColors } from './tokens';

// ---------------------------------------------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------------------------------------------

export type TextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'subheading'
  | 'body'
  | 'bodyStrong'
  | 'label'
  | 'caption'
  | 'overline'
  | 'numeral'
  | 'figure';

export type TextTone = 'default' | 'muted' | 'faint' | 'primary' | 'danger' | 'info' | 'accent' | 'onPrimary' | 'inverse';

function variantStyle(t: Theme, variant: TextVariant): TextStyle {
  const f = t.fonts;
  switch (variant) {
    case 'display':
      return { fontFamily: f.display, fontSize: t.font.display, lineHeight: 42, letterSpacing: -0.6 };
    case 'title':
      return { fontFamily: f.display, fontSize: t.font.xxl, lineHeight: 34, letterSpacing: -0.4 };
    case 'heading':
      return { fontFamily: f.bold, fontSize: t.font.lg, lineHeight: 24, letterSpacing: -0.1 };
    case 'subheading':
      return { fontFamily: f.semibold, fontSize: t.font.md, lineHeight: 22 };
    case 'bodyStrong':
      return { fontFamily: f.semibold, fontSize: t.font.md, lineHeight: 24 };
    case 'label':
      return { fontFamily: f.semibold, fontSize: t.font.sm, lineHeight: 20 };
    case 'caption':
      return { fontFamily: f.medium, fontSize: 13, lineHeight: 18 };
    case 'overline':
      return { fontFamily: f.bold, fontSize: 11, lineHeight: 14, letterSpacing: 1.1, textTransform: 'uppercase' };
    case 'numeral':
      return { fontFamily: f.semibold, fontSize: t.font.xl, lineHeight: 28, letterSpacing: -0.3 };
    case 'figure':
      // The one hero number per view (an ETA, a total): large sans with proportional figures.
      return { fontFamily: f.semibold, fontSize: 44, lineHeight: 52, letterSpacing: -1 };
    default:
      return { fontFamily: f.regular, fontSize: t.font.md, lineHeight: 24 };
  }
}

function toneColor(t: Theme, tone: TextTone): string {
  const c = t.colors;
  return {
    default: c.text,
    muted: c.textMuted,
    faint: c.textFaint,
    primary: c.primary,
    danger: c.danger,
    info: c.info,
    accent: c.onAccentSoft,
    onPrimary: c.onPrimary,
    inverse: c.background,
  }[tone];
}

export function Text({
  children,
  variant = 'body',
  tone = 'default',
  muted,
  center,
  style,
  numberOfLines,
  accessibilityRole,
  accessibilityLabel,
  selectable,
  testID,
}: {
  children: ReactNode;
  variant?: TextVariant;
  tone?: TextTone;
  /** Shorthand for tone="muted". */
  muted?: boolean;
  center?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  accessibilityRole?: 'header' | 'text';
  accessibilityLabel?: string;
  selectable?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const header = variant === 'display' || variant === 'title' || variant === 'heading';
  return (
    <RNText
      numberOfLines={numberOfLines}
      selectable={selectable}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole ?? (header ? 'header' : 'text')}
      maxFontSizeMultiplier={variant === 'display' ? 1.4 : 1.8}
      style={[
        variantStyle(t, variant),
        { color: toneColor(t, muted ? 'muted' : tone) },
        center ? { textAlign: 'center' } : null,
        style,
      ]}
    >
      {children}
    </RNText>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------------------------

export function Row({
  children,
  style,
  gap = 2,
  align = 'center',
  justify,
  wrap,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  wrap?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: align, justifyContent: justify, gap: t.spacing(gap),
      flexWrap: wrap ? 'wrap' : undefined }, style]}>
      {children}
    </View>
  );
}

export function Stack({ children, gap = 3, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ gap: t.spacing(gap) }, style]}>{children}</View>;
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border, marginLeft: inset }} />;
}

/**
 * Page container. Tab screens pass `safeTop` (they have no navigation header); `footer` pins the primary action
 * above the home indicator so it is always reachable with a thumb.
 */
export function Screen({
  children,
  scroll = true,
  padded = true,
  safeTop = false,
  refreshing,
  onRefresh,
  footer,
  keyboard = false,
  gap = 4,
  testID,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  safeTop?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
  keyboard?: boolean;
  gap?: number;
  testID?: string;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const pad = padded ? t.spacing(5) : 0;
  const content: ViewStyle = {
    paddingHorizontal: pad,
    paddingTop: (safeTop ? insets.top : 0) + (padded ? t.spacing(4) : 0),
    paddingBottom: footer ? t.spacing(4) : insets.bottom + t.spacing(8),
    gap: t.spacing(gap),
  };
  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.colors.primary}
                          colors={[t.colors.primary]} progressBackgroundColor={t.colors.surface} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, content]}>{children}</View>
  );
  const page = (
    <View style={{ flex: 1, backgroundColor: t.colors.background }} testID={testID}>
      {body}
      {footer ? (
        <View
          style={{
            paddingHorizontal: t.spacing(5),
            paddingTop: t.spacing(3),
            paddingBottom: Math.max(insets.bottom, t.spacing(3)),
            backgroundColor: t.colors.background,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: t.colors.border,
            gap: t.spacing(2),
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
  return keyboard ? (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                          keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
      {page}
    </KeyboardAvoidingView>
  ) : (
    page
  );
}

/** Large in-page title used by tab screens, with an optional eyebrow line and trailing action. */
export function PageTitle({ eyebrow, title, trailing, subtitle }: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  return (
    <Row justify="space-between" align="flex-end" style={{ marginBottom: 4 }}>
      <View style={{ flex: 1, gap: 2 }}>
        {eyebrow ? <Text variant="overline" tone="muted">{eyebrow}</Text> : null}
        <Text variant="title">{title}</Text>
        {subtitle ? <Text muted>{subtitle}</Text> : null}
      </View>
      {trailing}
    </Row>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Row justify="space-between" style={{ marginTop: 8, marginBottom: -4 }}>
      <Text variant="overline" tone="muted" accessibilityRole="header">{title}</Text>
      {action}
    </Row>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Press feedback
// ---------------------------------------------------------------------------------------------------------------

/** Pressable that settles down slightly under the finger — the only motion most controls need. */
export function PressableScale({
  children,
  onPress,
  disabled,
  style,
  scaleTo = 0.97,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  hitSlop,
  testID,
}: {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: { selected?: boolean; checked?: boolean; disabled?: boolean; busy?: boolean };
  hitSlop?: number;
  testID?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: v === 1 ? 6 : 0 }).start();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => to(scaleTo)}
      onPressOut={() => to(1)}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------------------------------------------

export type CardTone = 'plain' | 'raised' | 'sunken' | 'primary' | 'accent' | 'danger' | 'info' | 'brand';

function cardColours(t: Theme, tone: CardTone): { bg: string; border: string } {
  const c = t.colors;
  switch (tone) {
    case 'sunken':
      return { bg: c.sunken, border: 'transparent' };
    case 'primary':
      return { bg: c.primarySoft, border: 'transparent' };
    case 'accent':
      return { bg: c.accentSoft, border: 'transparent' };
    case 'danger':
      return { bg: c.dangerSoft, border: 'transparent' };
    case 'info':
      return { bg: c.infoSoft, border: 'transparent' };
    case 'brand':
      return { bg: c.primary, border: 'transparent' };
    default:
      return { bg: c.surface, border: c.border };
  }
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  tone = 'plain',
  padding = 4,
  gap = 2,
  selected,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  tone?: CardTone;
  padding?: number;
  gap?: number;
  selected?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const { bg, border } = cardColours(t, tone);
  const base: ViewStyle = {
    backgroundColor: bg,
    borderRadius: t.radius.lg,
    padding: t.spacing(padding),
    borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
    borderColor: selected ? t.colors.primary : border,
    gap: t.spacing(gap),
    ...(tone === 'raised' || tone === 'plain' ? elevation(t, tone === 'raised' ? 2 : 1) : {}),
  };
  if (onPress) {
    return (
      <PressableScale onPress={onPress} accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}
                      accessibilityState={selected === undefined ? undefined : { selected }} style={[base, style]}
                      scaleTo={0.985} testID={testID}>
        {children}
      </PressableScale>
    );
  }
  return <View style={[base, style]} testID={testID}>{children}</View>;
}

// ---------------------------------------------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dangerSoft' | 'accent';

function buttonColours(t: Theme, variant: ButtonVariant): { bg: string; fg: string; border: string } {
  const c = t.colors;
  return {
    primary: { bg: c.primary, fg: c.onPrimary, border: c.primary },
    secondary: { bg: c.primarySoft, fg: c.onPrimarySoft, border: c.primarySoft },
    outline: { bg: 'transparent', fg: c.text, border: c.borderStrong },
    ghost: { bg: 'transparent', fg: c.primary, border: 'transparent' },
    danger: { bg: c.danger, fg: c.onDanger, border: c.danger },
    dangerSoft: { bg: c.dangerSoft, fg: c.onDangerSoft, border: c.dangerSoft },
    accent: { bg: c.accent, fg: c.onAccent, border: c.accent },
  }[variant];
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  trailingIcon,
  loading,
  disabled,
  accessibilityHint,
  haptics = true,
  inline,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  trailingIcon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  haptics?: boolean;
  /** Size to content instead of stretching across the column. */
  inline?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const { bg, fg, border } = buttonColours(t, variant);
  const inactive = disabled || loading;
  const height = { sm: 38, md: 50, lg: 58 }[size];
  const fontSize = { sm: t.font.sm, md: t.font.md, lg: t.font.lg }[size];
  return (
    <PressableScale
      testID={testID}
      onPress={() => {
        if (haptics) haptic.press();
        onPress();
      }}
      disabled={inactive}
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: !!loading }}
      style={{
        minHeight: height,
        borderRadius: size === 'sm' ? t.radius.sm : t.radius.md,
        backgroundColor: bg,
        borderWidth: variant === 'outline' ? 1 : 0,
        borderColor: border,
        opacity: disabled && !loading ? 0.45 : 1,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: t.spacing(2),
        paddingHorizontal: t.spacing(size === 'sm' ? 3 : 5),
        alignSelf: inline ? 'flex-start' : 'stretch',
      }}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon as={icon} size={size === 'sm' ? 16 : 19} color={fg} strokeWidth={2} /> : null}
          <RNText style={{ color: fg, fontSize, fontFamily: t.fonts.semibold }} maxFontSizeMultiplier={1.5}>
            {title}
          </RNText>
          {trailingIcon ? <Icon as={trailingIcon} size={size === 'sm' ? 16 : 19} color={fg} strokeWidth={2} /> : null}
        </>
      )}
    </PressableScale>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  tone = 'plain',
  size = 44,
  badge,
  testID,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  tone?: 'plain' | 'primary' | 'danger' | 'ghost';
  size?: number;
  badge?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const c = t.colors;
  const [bg, fg] = {
    plain: [c.surface, c.text],
    primary: [c.primarySoft, c.onPrimarySoft],
    danger: [c.danger, c.onDanger],
    ghost: ['transparent', c.text],
  }[tone];
  return (
    <PressableScale onPress={() => { haptic.tap(); onPress(); }} accessibilityLabel={label} testID={testID} scaleTo={0.92}
                    style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center',
                      justifyContent: 'center', borderWidth: tone === 'plain' ? StyleSheet.hairlineWidth : 0,
                      borderColor: c.border }}>
      <Icon as={icon} size={Math.round(size * 0.45)} color={fg} strokeWidth={2} />
      {badge ? (
        <View style={{ position: 'absolute', top: size * 0.2, right: size * 0.2, width: 9, height: 9, borderRadius: 5,
          backgroundColor: c.accent, borderWidth: 2, borderColor: bg === 'transparent' ? c.background : bg }} />
      ) : null}
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------------------------------------------

export function TextField({
  label,
  error,
  hint,
  icon,
  prefix,
  trailing,
  counter,
  ...props
}: TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  icon?: LucideIcon;
  /** Fixed text before the input, e.g. "+91". */
  prefix?: string;
  trailing?: ReactNode;
  counter?: boolean;
}) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? t.colors.danger : focused ? t.colors.primary : t.colors.border;
  const length = typeof props.value === 'string' ? props.value.length : 0;
  return (
    <View style={{ gap: t.spacing(1.5) }}>
      <Text variant="label">{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: props.multiline ? 'flex-start' : 'center',
          minHeight: props.multiline ? 104 : 52,
          borderWidth: focused || error ? 1.5 : 1,
          borderColor,
          borderRadius: t.radius.md,
          backgroundColor: t.colors.surface,
          paddingHorizontal: t.spacing(3.5),
          gap: t.spacing(2),
        }}
      >
        {icon ? (
          <View style={{ paddingTop: props.multiline ? 14 : 0 }}>
            <Icon as={icon} size={18} color={focused ? 'primary' : 'textMuted'} />
          </View>
        ) : null}
        {prefix ? (
          <RNText style={{ fontFamily: t.fonts.semibold, fontSize: t.font.md, color: t.colors.textMuted }}>{prefix}</RNText>
        ) : null}
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          placeholderTextColor={t.colors.textFaint}
          selectionColor={t.colors.primary}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[
            {
              flex: 1,
              color: t.colors.text,
              fontSize: t.font.md,
              fontFamily: t.fonts.regular,
              paddingVertical: props.multiline ? 14 : 12,
              textAlignVertical: props.multiline ? 'top' : 'center',
            },
            props.style,
          ]}
        />
        {trailing}
      </View>
      {error ? (
        <Row gap={1.5}>
          <Icon as={AlertCircle} size={14} color="danger" />
          <Text variant="caption" tone="danger" style={{ flex: 1 }}>{error}</Text>
        </Row>
      ) : hint || (counter && props.maxLength) ? (
        <Row justify="space-between">
          <Text variant="caption" muted style={{ flex: 1 }}>{hint ?? ''}</Text>
          {counter && props.maxLength ? (
            <Text variant="caption" tone="faint">{length}/{props.maxLength}</Text>
          ) : null}
        </Row>
      ) : null}
    </View>
  );
}

/**
 * One-time-code entry: six boxes over a single hidden input, so SMS autofill, paste and the number pad all keep
 * working. The active box is outlined; a caret blinks in it.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  label,
  error,
  autoFocus,
  testID,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  label: string;
  error?: boolean;
  autoFocus?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(!!autoFocus);
  const caret = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(caret, { toValue: 0, duration: 450, useNativeDriver: true }),
      Animated.timing(caret, { toValue: 1, duration: 450, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [caret]);
  const digits = value.split('');
  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityLabel={label} accessibilityHint={`${value.length} of ${length} digits entered`}>
      <View style={{ flexDirection: 'row', gap: t.spacing(2), justifyContent: 'space-between' }}>
        {Array.from({ length }, (_, i) => {
          const active = focused && i === Math.min(value.length, length - 1);
          const filled = i < digits.length;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                maxWidth: 54,
                aspectRatio: 0.82,
                borderRadius: t.radius.sm,
                borderWidth: active ? 2 : 1,
                borderColor: error ? t.colors.danger : active ? t.colors.primary : filled ? t.colors.borderStrong : t.colors.border,
                backgroundColor: filled ? t.colors.surface : t.colors.sunken,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {filled ? (
                <RNText style={{ fontFamily: t.fonts.display, fontSize: 26, color: t.colors.text }}>{digits[i]}</RNText>
              ) : active ? (
                <Animated.View style={{ width: 2, height: 24, backgroundColor: t.colors.primary, opacity: caret }} />
              ) : null}
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        testID={testID}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        autoFocus={autoFocus}
        maxLength={length}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        caretHidden
        accessibilityLabel={label}
        style={{ position: 'absolute', opacity: 0.011, width: '100%', height: '100%' }}
      />
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  role = 'checkbox',
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: LucideIcon;
  role?: 'checkbox' | 'radio' | 'tab';
  testID?: string;
}) {
  const t = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={() => { haptic.tap(); onPress(); }}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === 'checkbox' ? { checked: selected } : { selected }}
      scaleTo={0.94}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing(1.5),
        paddingHorizontal: t.spacing(3.5),
        minHeight: 40,
        borderRadius: t.radius.pill,
        borderWidth: 1,
        borderColor: selected ? t.colors.primary : t.colors.border,
        backgroundColor: selected ? t.colors.primary : t.colors.surface,
      }}
    >
      {icon ? <Icon as={icon} size={15} color={selected ? t.colors.onPrimary : t.colors.textMuted} strokeWidth={2} /> : null}
      <RNText style={{ fontFamily: t.fonts.semibold, fontSize: t.font.sm, color: selected ? t.colors.onPrimary : t.colors.text }}>
        {label}
      </RNText>
    </PressableScale>
  );
}

/** Two-to-four way switch with a sliding thumb. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const x = useRef(new Animated.Value(index)).current;
  useEffect(() => {
    Animated.spring(x, { toValue: index, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
  }, [index, x]);
  const segment = width > 0 ? (width - 8) / options.length : 0;
  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', backgroundColor: t.colors.sunken, borderRadius: t.radius.md, padding: 4, height: 46 }}
    >
      {segment > 0 ? (
        <Animated.View
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            bottom: 4,
            width: segment,
            borderRadius: t.radius.sm,
            backgroundColor: t.colors.surface,
            ...elevation(t, 1),
            transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, segment] }) }],
          }}
        />
      ) : null}
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: o.value === value }}
          onPress={() => { haptic.tap(); onChange(o.value); }}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <RNText style={{ fontFamily: t.fonts.semibold, fontSize: t.font.sm,
            color: o.value === value ? t.colors.text : t.colors.textMuted }}>
            {o.label}
          </RNText>
        </Pressable>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------------------------------------------

/** Settings-style grouped card; children are ListItems separated by inset hairlines. */
export function ListGroup({ children }: { children: ReactNode }) {
  const t = useTheme();
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View style={{ backgroundColor: t.colors.surface, borderRadius: t.radius.lg, borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border, overflow: 'hidden', ...elevation(t, 1) }}>
      {items.map((child, i) => (
        <View key={i}>
          {i > 0 ? <Divider inset={t.spacing(14)} /> : null}
          {child}
        </View>
      ))}
    </View>
  );
}

export function ListItem({
  icon,
  iconTone = 'primary',
  title,
  subtitle,
  trailing,
  onPress,
  destructive,
  chevron = !!onPress,
  testID,
}: {
  icon?: LucideIcon;
  iconTone?: 'primary' | 'accent' | 'info' | 'danger' | 'neutral';
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  chevron?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const c = t.colors;
  const [bg, fg] = {
    primary: [c.primarySoft, c.onPrimarySoft],
    accent: [c.accentSoft, c.onAccentSoft],
    info: [c.infoSoft, c.onInfoSoft],
    danger: [c.dangerSoft, c.onDangerSoft],
    neutral: [c.sunken, c.textMuted],
  }[destructive ? 'danger' : iconTone];
  const body = (
    <Row gap={3.5} style={{ paddingHorizontal: t.spacing(4), paddingVertical: t.spacing(3.5), minHeight: 60 }}>
      {icon ? (
        <View style={{ width: 36, height: 36, borderRadius: t.radius.sm, backgroundColor: bg, alignItems: 'center',
          justifyContent: 'center' }}>
          <Icon as={icon} size={18} color={fg} strokeWidth={2} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="subheading" tone={destructive ? 'danger' : 'default'}>{title}</Text>
        {subtitle ? <Text variant="caption" muted numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {trailing}
      {chevron ? <Icon as={ChevronRight} size={18} color="textFaint" /> : null}
    </Row>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
               testID={testID} style={({ pressed }) => ({ backgroundColor: pressed ? c.sunken : 'transparent' })}>
      {body}
    </Pressable>
  );
}

export function ToggleRow({
  title,
  description,
  value,
  onChange,
  disabled,
  testID,
}: {
  title: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Row gap={3} align="flex-start" style={{ paddingHorizontal: t.spacing(4), paddingVertical: t.spacing(3.5) }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="subheading">{title}</Text>
        {description ? <Text variant="caption" muted>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={(v) => { haptic.tap(); onChange(v); }}
        accessibilityLabel={title}
        accessibilityHint={description}
        testID={testID}
        trackColor={{ false: t.colors.borderStrong, true: t.colors.primary }}
        thumbColor={Platform.OS === 'android' ? t.colors.surface : undefined}
        ios_backgroundColor={t.colors.borderStrong}
      />
    </Row>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------------------------------------------

export type NoticeTone = 'info' | 'danger' | 'success' | 'warning';

export function Banner({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: NoticeTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const t = useTheme();
  const c = t.colors;
  const [bg, fg, glyph] = {
    info: [c.infoSoft, c.onInfoSoft, Info],
    danger: [c.dangerSoft, c.onDangerSoft, AlertCircle],
    success: [c.primarySoft, c.onPrimarySoft, CheckCircle2],
    warning: [c.accentSoft, c.onAccentSoft, TriangleAlert],
  }[tone] as [string, string, LucideIcon];
  return (
    <View
      accessibilityRole={tone === 'danger' ? 'alert' : 'summary'}
      accessibilityLiveRegion="polite"
      style={{ backgroundColor: bg, borderRadius: t.radius.md, padding: t.spacing(3.5), flexDirection: 'row',
        gap: t.spacing(3), alignItems: 'flex-start' }}
    >
      <View style={{ paddingTop: 2 }}>
        <Icon as={glyph} size={18} color={fg} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <RNText style={{ color: fg, fontFamily: t.fonts.bold, fontSize: t.font.sm, lineHeight: 20 }}>{title}</RNText> : null}
        {children ? (
          typeof children === 'string' ? (
            <RNText style={{ color: fg, fontFamily: t.fonts.medium, fontSize: t.font.sm, lineHeight: 20 }}>{children}</RNText>
          ) : (
            children
          )
        ) : null}
        {action ? <View style={{ marginTop: t.spacing(2) }}>{action}</View> : null}
      </View>
    </View>
  );
}

/** Breathing placeholder in the shape of the content that is loading. */
export function Skeleton({ width = '100%', height = 14, radius, style }: {
  width?: ViewStyle['width'];
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.55, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      accessible={false}
      style={[{ width, height, borderRadius: radius ?? t.radius.xs, backgroundColor: t.colors.sunken, opacity: pulse }, style]}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card gap={3}>
      <Row justify="space-between">
        <Skeleton width="45%" height={20} />
        <Skeleton width={84} height={24} radius={999} />
      </Row>
      {Array.from({ length: lines - 1 }, (_, i) => (
        <Skeleton key={i} width={i % 2 ? '60%' : '85%'} />
      ))}
    </Card>
  );
}

/** Full-screen loading state: skeleton cards rather than a lone spinner. */
export function Loading({ label = 'Loading', cards = 3, safeTop }: { label?: string; cards?: number; safeTop?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar"
          style={{ flex: 1, backgroundColor: t.colors.background, padding: t.spacing(5),
            paddingTop: (safeTop ? insets.top : 0) + t.spacing(4), gap: t.spacing(4) }}>
      <Skeleton width="55%" height={30} />
      {Array.from({ length: cards }, (_, i) => <SkeletonCard key={i} />)}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  action,
  art,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
  art?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: t.spacing(10), paddingHorizontal: t.spacing(6), gap: t.spacing(3) }}>
      {art}
      <Text variant="heading" center>{title}</Text>
      {message ? <Text muted center style={{ maxWidth: 300 }}>{message}</Text> : null}
      {action ? <View style={{ marginTop: t.spacing(2), alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------------------------------------------

const AVATAR_TONES: (keyof ThemeColors)[][] = [
  ['primarySoft', 'onPrimarySoft'],
  ['accentSoft', 'onAccentSoft'],
  ['infoSoft', 'onInfoSoft'],
  ['dangerSoft', 'onDangerSoft'],
];

/** Initials on a tint picked deterministically from the name, so a child keeps "their" colour everywhere. */
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const t = useTheme();
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '·';
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, fg] = AVATAR_TONES[hash % AVATAR_TONES.length]!;
  return (
    <View accessible={false} style={{ width: size, height: size, borderRadius: size / 2.6, backgroundColor: t.colors[bg],
      alignItems: 'center', justifyContent: 'center' }}>
      <RNText style={{ fontFamily: t.fonts.display, fontSize: size * 0.4, color: t.colors[fg] }}>{initials}</RNText>
    </View>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'primary' | 'accent' | 'danger' | 'info' }) {
  const t = useTheme();
  const c = t.colors;
  const [bg, fg] = {
    neutral: [c.sunken, c.textMuted],
    primary: [c.primarySoft, c.onPrimarySoft],
    accent: [c.accentSoft, c.onAccentSoft],
    danger: [c.dangerSoft, c.onDangerSoft],
    info: [c.infoSoft, c.onInfoSoft],
  }[tone];
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: bg, borderRadius: t.radius.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
      <RNText style={{ color: fg, fontFamily: t.fonts.bold, fontSize: 11.5, letterSpacing: 0.2 }}>{label}</RNText>
    </View>
  );
}

/** Label over a big serif numeral — money, counts, distances. */
export function Stat({ label, value, hint, tone = 'default', size = 'md' }: {
  label: string;
  value: string;
  hint?: string;
  tone?: TextTone;
  size?: 'md' | 'lg';
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 2 }} accessible accessibilityLabel={`${label}: ${value}${hint ? `, ${hint}` : ''}`}>
      <Text variant="overline" tone={tone === 'onPrimary' ? 'onPrimary' : 'muted'}>{label}</Text>
      {/* Stat values stay in the interface sans (semibold): the display serif is for titles, not figures. */}
      <Text variant="heading" tone={tone} style={{ fontFamily: t.fonts.semibold, fontSize: size === 'lg' ? 40 : 24,
        lineHeight: size === 'lg' ? 48 : 30, letterSpacing: size === 'lg' ? -0.8 : -0.3 }}>{value}</Text>
      {hint ? <Text variant="caption" tone={tone === 'onPrimary' ? 'onPrimary' : 'muted'}>{hint}</Text> : null}
    </View>
  );
}

/** Dot that breathes while something is live (a partner moving, a shift running). */
export function LiveDot({ color, size = 10 }: { color?: string; size?: number }) {
  const t = useTheme();
  const c = color ?? t.colors.primary;
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(ring, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [ring]);
  return (
    <View accessible={false} style={{ width: size * 2.4, height: size * 2.4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size * 2.4,
          height: size * 2.4,
          borderRadius: size * 1.2,
          backgroundColor: c,
          opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
          transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c }} />
    </View>
  );
}
