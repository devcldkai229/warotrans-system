import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Wifi } from 'lucide-react-native';
import { AppNavigator } from './src/app/navigation/AppNavigator';
import { NavigationProvider } from './src/app/navigation/NavigationContext';
import { AuthProvider } from './src/features/auth/authContext';
import { ToastProvider } from './src/shared/context/ToastContext';
import { colors } from './src/shared/theme/colors';
import { typography } from './src/shared/theme/typography';

export default function App() {
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const updateScale = () => {
        const availableHeight = window.innerHeight - 32;
        const availableWidth = window.innerWidth - 32;
        const scaleH = availableHeight / 844;
        const scaleW = availableWidth / 390;
        const scale = Math.min(1, Math.max(0.4, Math.min(scaleH, scaleW)));
        document.documentElement.style.setProperty('--phone-scale', scale.toFixed(4));
      };
      updateScale();
      window.addEventListener('resize', updateScale);

      const fontId = 'warotrans-google-fonts';
      if (!document.getElementById(fontId)) {
        const link = document.createElement('link');
        link.id = fontId;
        link.rel = 'stylesheet';
        link.href =
          'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;600;700;800&display=swap';
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
            width: 390px !important;
            height: 844px !important;
            min-width: 390px !important;
            max-width: 390px !important;
            min-height: 844px !important;
            max-height: 844px !important;
            transform: scale(var(--phone-scale, 1)) !important;
            transform-origin: center center !important;
            border-radius: 46px !important;
            border: 2px solid #334155 !important;
            box-shadow: 0 25px 70px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.08), 0 0 50px rgba(0, 92, 209, 0.15) !important;
            overflow: hidden !important;
            position: relative !important;
            background-color: #f8fafc !important;
            flex-shrink: 0 !important;
          }
          @media (max-width: 500px) {
            #web-root-container, .web-root-container {
              padding: 0 !important;
            }
            #web-phone-frame, .web-phone-frame {
              width: 100vw !important;
              max-width: 100vw !important;
              min-width: 100vw !important;
              height: 100vh !important;
              max-height: 100vh !important;
              min-height: 100vh !important;
              transform: none !important;
              border: none !important;
              border-radius: 0 !important;
              box-shadow: none !important;
            }
          }
          div[class*="r-position-1xcajam"][class*="r-zIndex-sfbmgh"],
          div[class*="r-position-1xcajam"]:has([aria-modal="true"]) {
            position: fixed !important;
            top: 50% !important;
            bottom: auto !important;
            left: 50% !important;
            right: auto !important;
            transform: translate(-50%, -50%) scale(var(--phone-scale, 1)) !important;
            transform-origin: center center !important;
            width: 390px !important;
            height: 844px !important;
            min-width: 390px !important;
            max-width: 390px !important;
            min-height: 844px !important;
            max-height: 844px !important;
            border-radius: 46px !important;
            overflow: hidden !important;
            border: none !important;
            box-shadow: none !important;
            pointer-events: auto !important;
          }
          @media (max-width: 500px) {
            #web-status-bar, .web-status-bar {
              display: none !important;
            }
            div[class*="r-position-1xcajam"][class*="r-zIndex-sfbmgh"],
            div[class*="r-position-1xcajam"]:has([aria-modal="true"]) {
              width: 100vw !important;
              max-width: 100vw !important;
              min-width: 100vw !important;
              height: 100vh !important;
              max-height: 100vh !important;
              min-height: 100vh !important;
              left: 0 !important;
              top: 0 !important;
              transform: none !important;
              border-radius: 0 !important;
              border: none !important;
            }
          }
        `;
        document.head.appendChild(style);
      }

      return () => {
        window.removeEventListener('resize', updateScale);
      };
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
          {/* Subtle iOS Status Bar (Clean Header Surface) */}
          <View
            style={styles.webStatusBar}
            nativeID="web-status-bar"
            {...({ className: 'web-status-bar' } as any)}
          >
            <Text style={styles.webStatusTime}>9:41</Text>
            <View style={styles.webStatusIcons}>
              <View style={styles.webSignal}>
                <View style={[styles.webSignalBar, { height: 3.5 }]} />
                <View style={[styles.webSignalBar, { height: 5.5 }]} />
                <View style={[styles.webSignalBar, { height: 7.5 }]} />
                <View style={[styles.webSignalBar, { height: 9.5 }]} />
              </View>
              <Wifi size={13} color="#0f172a" strokeWidth={2.4} />
              <View style={styles.webBattery}>
                <View style={styles.webBatteryBody}>
                  <View style={styles.webBatteryFill} />
                </View>
                <View style={styles.webBatteryCap} />
              </View>
            </View>
          </View>

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
    height: '100%',
    backgroundColor: colors.background,
    overflow: 'hidden',
    position: 'relative',
  },
  appContainer: {
    flex: 1,
    backgroundColor: colors.background,
    position: 'relative',
  },
  webStatusBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 44,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    pointerEvents: 'none',
  },
  webStatusTime: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    fontFamily: typography.fontSans,
    letterSpacing: -0.2,
    paddingTop: 1,
  },
  webStatusIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: 1,
  },
  webSignal: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1.5,
    height: 10,
    marginRight: 1,
  },
  webSignalBar: {
    width: 2.8,
    backgroundColor: '#0f172a',
    borderRadius: 0.75,
  },
  webBattery: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  webBatteryBody: {
    width: 20,
    height: 11,
    borderRadius: 3.5,
    borderWidth: 1.5,
    borderColor: '#0f172a',
    padding: 1.2,
    justifyContent: 'center',
  },
  webBatteryFill: {
    width: '75%',
    height: '100%',
    borderRadius: 1,
    backgroundColor: '#0f172a',
  },
  webBatteryCap: {
    width: 1.5,
    height: 4,
    borderTopRightRadius: 1,
    borderBottomRightRadius: 1,
    backgroundColor: '#0f172a',
    marginLeft: 1,
  },
});
