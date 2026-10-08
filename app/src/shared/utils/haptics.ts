import { Vibration } from 'react-native';

export type HapticType = 'tap' | 'tick' | 'success' | 'warning' | 'error';

export function triggerHaptic(type: HapticType = 'tap') {
  try {
    switch (type) {
      case 'tick':
        Vibration.vibrate(15);
        break;
      case 'tap':
        Vibration.vibrate(30);
        break;
      case 'success':
        // Quick double-pulse success
        Vibration.vibrate([0, 40, 50, 60]);
        break;
      case 'warning':
        // Double alert vibration
        Vibration.vibrate([0, 80, 60, 100]);
        break;
      case 'error':
        // Triple urgent hazard vibration
        Vibration.vibrate([0, 100, 50, 100, 50, 200]);
        break;
      default:
        Vibration.vibrate(30);
    }
  } catch {
    // Graceful fallback on devices without vibration hardware
  }
}
