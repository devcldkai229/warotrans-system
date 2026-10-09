import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform, SafeAreaView, StyleSheet, View } from 'react-native';
import { AppNavigator } from './src/app/navigation/AppNavigator';
import { NavigationProvider } from './src/app/navigation/NavigationContext';
import { AuthProvider } from './src/features/auth/authContext';
import { ToastProvider } from './src/shared/context/ToastContext';
import { colors } from './src/shared/theme/colors';

export default function App() {
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const fontId = 'warotrans-google-fonts';
      if (!document.getElementById(fontId)) {
        const link = document.createElement('link');
        link.id = fontId;
        link.rel = 'stylesheet';
        link.href =
          'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800;900&family=Roboto+Mono:wght@500;600;700&display=swap';
        document.head.appendChild(link);
      }

      const styleId = 'warotrans-global-styles';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
          *, *:before, *:after {
            outline: none !important;
            -webkit-tap-highlight-color: transparent !important;
          }
          *:focus, *:focus-visible, *:focus-within {
            outline: none !important;
            box-shadow: none !important;
          }
          button, [role="button"], a, input, select, textarea {
            outline: none !important;
            -webkit-tap-highlight-color: transparent !important;
          }
          .r-backgroundColor-1vo7fp,
          [class*="r-backgroundColor-1vo7fp"],
          div[style*="rgba(7, 21, 35"],
          div[style*="rgba(15, 23, 42"],
          div[style*="rgba(7,21,35"],
          div[style*="rgba(15,23,42"] {
            backdrop-filter: blur(8px) !important;
            -webkit-backdrop-filter: blur(8px) !important;
            background-color: rgba(15, 23, 42, 0.45) !important;
          }
          @keyframes ping {
            75%, 100% {
              transform: scale(2.2);
              opacity: 0;
            }
          }
          @keyframes pulse {
            50% {
              opacity: .4;
            }
          }
          .animate-ping {
            animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite !important;
          }
          .animate-pulse {
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite !important;
          }
          html, body {
            height: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background-color: #090d16 !important;
            overflow: hidden !important;
          }
          #root {
            height: 100% !important;
            width: 100% !important;
            display: flex !important;
            background-color: #090d16 !important;
            overflow: hidden !important;
          }
          body {
            background-color: #090d16 !important;
          }
          #web-root-container, .web-root-container {
            background-color: #090d16 !important;
            padding: 0 !important;
            height: 100vh !important;
            width: 100vw !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }
          #web-phone-frame, .web-phone-frame {
            height: 100vh !important;
            max-height: 100vh !important;
            width: min(100vw, calc(100vh * 9 / 19)) !important;
            max-width: 100vw !important;
            aspect-ratio: 9 / 19 !important;
            border-left: 1px solid #1e293b !important;
            border-right: 1px solid #1e293b !important;
            border-top: none !important;
            border-bottom: none !important;
            border-radius: 0 !important;
            box-shadow: 0 0 60px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.04) !important;
            overflow: hidden !important;
            position: relative !important;
            background-color: #f8fafc !important;
          }
          @media (max-width: 540px), (max-aspect-ratio: 9/19) {
            #web-phone-frame, .web-phone-frame {
              width: 100vw !important;
              max-width: 100vw !important;
              height: 100vh !important;
              border: none !important;
              border-radius: 0 !important;
              box-shadow: none !important;
            }
          }
          div[class*="r-position-1xcajam"][class*="r-zIndex-sfbmgh"],
          div[class*="r-position-1xcajam"]:has([aria-modal="true"]) {
            position: fixed !important;
            top: 0 !important;
            left: 50% !important;
            bottom: auto !important;
            right: auto !important;
            transform: translateX(-50%) !important;
            width: min(100vw, calc(100vh * 9 / 19)) !important;
            max-width: 100vw !important;
            height: 100vh !important;
            max-height: 100vh !important;
            border-radius: 0 !important;
            overflow: hidden !important;
            border-left: 1px solid #1e293b !important;
            border-right: 1px solid #1e293b !important;
            border-top: none !important;
            border-bottom: none !important;
            pointer-events: auto !important;
          }
          @media (max-width: 540px), (max-aspect-ratio: 9/19) {
            div[class*="r-position-1xcajam"][class*="r-zIndex-sfbmgh"],
            div[class*="r-position-1xcajam"]:has([aria-modal="true"]) {
              width: 100vw !important;
              max-width: 100vw !important;
              left: 0 !important;
              transform: none !important;
              border: none !important;
            }
          }
        `;
        document.head.appendChild(style);
      }
    }
  }, []);

  const content = (
    <View style={styles.appContainer}>
      <StatusBar style="dark" />
      <AuthProvider>
        <NavigationProvider>
          <ToastProvider>
            <AppNavigator />
          </ToastProvider>
        </NavigationProvider>
      </AuthProvider>
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <View
        style={styles.webRoot}
        nativeID="web-root-container"
        {...({ className: 'web-root-container' } as any)}
      >
        <View
          style={styles.webFrame}
          nativeID="web-phone-frame"
          {...({ className: 'web-phone-frame' } as any)}
        >
          {content}
        </View>
      </View>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  webRoot: {
    flex: 1,
    backgroundColor: '#090d16',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  webFrame: {
    width: '100%',
    maxWidth: 450,
    height: '100%',
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  appContainer: {
    flex: 1,
    backgroundColor: colors.background,
    position: 'relative',
  },
});
