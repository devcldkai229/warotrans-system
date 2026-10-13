import { Platform } from 'react-native';

export const typography = {
  fontSans: Platform.select({
    web: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, sans-serif",
    default: undefined, // iOS uses San Francisco (SF Pro) natively
  }),
  fontMono: Platform.select({
    web: "Menlo, 'SF Mono', Consolas, 'JetBrains Mono', 'Roboto Mono', monospace",
    default: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  }),
};
