import { Platform } from 'react-native';

export const typography = {
  // Inter is FIRST on web on purpose. The stack used to start with
  // `-apple-system`, so the web prototype rendered in San Francisco on a
  // reviewer's Mac but Inter on Windows/Linux - the same build looked
  // different per machine. Inter is loaded with weights 400-900 from
  // Google Fonts (App.tsx), so weight 900 is a real face, not a synthesised
  // faux-bold like the browser's default fallback.
  fontSans: Platform.select({
    web: "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif",
    default: undefined, // iOS uses San Francisco (SF Pro) natively
  }),
  fontMono: Platform.select({
    web: "'JetBrains Mono', Menlo, 'SF Mono', Consolas, 'Roboto Mono', monospace",
    default: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  }),
};
