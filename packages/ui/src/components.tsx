import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useTheme } from './theme';

type Variant = 'title' | 'heading' | 'body' | 'caption' | 'label';

export function Text({
  children,
  variant = 'body',
  muted,
  style,
  numberOfLines,
  accessibilityRole,
}: {
  children: ReactNode;
  variant?: Variant;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  accessibilityRole?: 'header' | 'text';
}) {
  const t = useTheme();
  const size = { title: t.font.xxl, heading: t.font.lg, body: t.font.md, caption: t.font.xs, label: t.font.sm }[variant];
  const weight: TextStyle['fontWeight'] = variant === 'title' || variant === 'heading' ? '700' : variant === 'label' ? '600' : '400';
  return (
    <RNText
      numberOfLines={numberOfLines}
      accessibilityRole={accessibilityRole ?? (variant === 'title' || variant === 'heading' ? 'header' : 'text')}
      style={[{ color: muted ? t.colors.textMuted : t.colors.text, fontSize: size, fontWeight: weight }, style]}
    >
      {children}
    </RNText>
  );
}

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const t = useTheme();
  const inner = <View style={{ padding: padded ? t.spacing(4) : 0, gap: t.spacing(3) }}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{inner}</ScrollView> : inner}
    </View>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    padding: t.spacing(4),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
    gap: t.spacing(2),
  };
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}
                 style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  accessibilityHint,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}) {
  const t = useTheme();
  const bg = { primary: t.colors.primary, secondary: t.colors.primarySoft, danger: t.colors.danger, ghost: 'transparent' }[variant];
  const fg = { primary: t.colors.onPrimary, secondary: t.colors.primary, danger: '#FFFFFF', ghost: t.colors.primary }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        borderRadius: t.radius.md,
        backgroundColor: bg,
        opacity: inactive ? 0.55 : pressed ? 0.85 : 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: t.spacing(4),
        borderWidth: variant === 'ghost' ? 1 : 0,
        borderColor: t.colors.primary,
      })}
    >
      {loading ? <ActivityIndicator color={fg} /> : <RNText style={{ color: fg, fontSize: t.font.md, fontWeight: '600' }}>{title}</RNText>}
    </Pressable>
  );
}

export function TextField({
  label,
  error,
  hint,
  ...props
}: TextInputProps & { label: string; error?: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing(1) }}>
      <Text variant="label">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.colors.textMuted}
        {...props}
        style={[
          {
            minHeight: 48,
            borderWidth: 1,
            borderColor: error ? t.colors.danger : t.colors.border,
            borderRadius: t.radius.md,
            paddingHorizontal: t.spacing(3),
            color: t.colors.text,
            backgroundColor: t.colors.surface,
            fontSize: t.font.md,
          },
          props.style,
        ]}
      />
      {error ? (
        <Text variant="caption" style={{ color: t.colors.danger }}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function Banner({ tone = 'info', children }: { tone?: 'info' | 'danger' | 'success' | 'warning'; children: ReactNode }) {
  const t = useTheme();
  const colours = {
    info: [t.colors.infoSoft, t.colors.info],
    danger: [t.colors.dangerSoft, t.colors.danger],
    success: [t.colors.primarySoft, t.colors.primary],
    warning: [t.colors.accentSoft, t.colors.text],
  }[tone];
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: colours[0], borderRadius: t.radius.md, padding: t.spacing(3) }}>
      <RNText style={{ color: colours[1], fontSize: t.font.sm }}>{children}</RNText>
    </View>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  const t = useTheme();
  return (
    <View accessibilityLabel={label} style={{ padding: t.spacing(8), alignItems: 'center' }}>
      <ActivityIndicator color={t.colors.primary} />
    </View>
  );
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: t.spacing(8), gap: t.spacing(2) }}>
      <Text variant="heading">{title}</Text>
      {message ? (
        <Text muted style={{ textAlign: 'center' }}>
          {message}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}>{children}</View>;
}
