import { Platform, Vibration } from 'react-native';

export type HapticType = 'tap' | 'tick' | 'success' | 'warning' | 'error';

/**
 * Trigger calibrated tactile vibration feedback.
 * Routine interactions (tap, tick) are silenced to prevent annoying motor spam on real phones.
 * Only high-impact events (success confirmation, warning, emergency error) trigger physical vibration.
 */
export function triggerHaptic(type: HapticType = 'tap') {
  try {
    switch (type) {
      case 'tick':
      case 'tap':
        // Silenced on mobile devices to prevent excessive motor buzz on physical smartphones
        break;
      case 'success':
        // Feather-light crisp tactile click (10ms)
        Vibration.vibrate(Platform.OS === 'ios' ? 10 : [0, 12]);
        break;
      case 'warning':
        // Soft alert tap (15ms)
        Vibration.vibrate(Platform.OS === 'ios' ? 15 : [0, 18]);
        break;
      case 'error':
        // Controlled double micro-pulse (20ms each)
        Vibration.vibrate([0, 20, 30, 20]);
        break;
      default:
        break;
    }
  } catch {
    // Graceful fallback on devices without vibration hardware
  }
}

