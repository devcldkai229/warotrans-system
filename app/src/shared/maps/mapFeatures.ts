import { Platform } from 'react-native';

// Native rollout stays opt-in until gesture/performance checks on a real device.
export const interactiveMapEnabled = Platform.OS === 'web' || process.env.EXPO_PUBLIC_INTERACTIVE_MAP === 'true';
