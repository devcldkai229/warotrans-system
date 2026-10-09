import { Platform } from 'react-native';

export const typography = {
  fontSans: Platform.select({
    web: "'Barlow', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    default: undefined,
  }),
  fontMono: Platform.select({
    web: "'Roboto Mono', monospace",
    default: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  }),
};
