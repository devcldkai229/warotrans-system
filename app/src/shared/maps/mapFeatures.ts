// Interactive MapViewport enabled by default on iOS, Android, and Web; opt out via EXPO_PUBLIC_INTERACTIVE_MAP=false.
export const interactiveMapEnabled = process.env.EXPO_PUBLIC_INTERACTIVE_MAP !== 'false';
