import * as Haptics from 'expo-haptics';

/**
 * Tactile confirmation for moments that matter (pickup confirmed, leave marked, rating sent). Never required for
 * feedback: every haptic is paired with a visible change, and failures (simulators, old devices) are ignored.
 */
export const haptic = {
  tap: () => void Haptics.selectionAsync().catch(() => undefined),
  press: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined),
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined),
};
