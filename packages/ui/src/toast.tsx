import { CheckCircle2, CircleAlert, Info, type LucideIcon } from 'lucide-react-native';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from './haptics';
import { Icon } from './icons';
import { useTheme } from './theme';
import { elevation } from './tokens';

type ToastTone = 'success' | 'info' | 'danger';
interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => undefined);

/** Short confirmations that need no decision ("Leave marked for Tue 21 Oct"). Also announced to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const counter = useRef(0);
  const show = useCallback((message: string, tone: ToastTone = 'success') => {
    counter.current += 1;
    setToast({ id: counter.current, message, tone });
    if (tone === 'success') haptic.success();
    else if (tone === 'danger') haptic.error();
    AccessibilityInfo.announceForAccessibility(message);
  }, []);
  const clear = useCallback(() => setToast(null), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} onDone={clear} /> : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

function ToastView({ toast, onDone }: { toast: ToastMessage; onDone: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const seq = Animated.sequence([
      Animated.timing(y, { toValue: 1, duration: t.motion.base, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
      Animated.delay(2600),
      Animated.timing(y, { toValue: 0, duration: t.motion.base, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    seq.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => seq.stop();
  }, [y, onDone, t.motion.base]);
  const glyph: LucideIcon = { success: CheckCircle2, info: Info, danger: CircleAlert }[toast.tone];
  // The toast is always a dark capsule, so its icon colours are fixed light tints that read on it.
  const tint = { success: '#8EC2A7', info: '#9DB5E3', danger: '#F08A72' }[toast.tone];
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: insets.top + 8,
        left: 16,
        right: 16,
        alignItems: 'center',
        opacity: y,
        transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          maxWidth: 440,
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: t.radius.pill,
          backgroundColor: t.dark ? '#2A2723' : '#24211D',
          borderWidth: t.dark ? 1 : 0,
          borderColor: t.colors.borderStrong,
          ...elevation(t, 3),
        }}
      >
        <Icon as={glyph} size={18} color={tint} strokeWidth={2.2} />
        <RNText style={{ color: '#F6F2EA', fontFamily: t.fonts.semibold, fontSize: 14.5, flexShrink: 1 }}>{toast.message}</RNText>
      </View>
    </Animated.View>
  );
}
