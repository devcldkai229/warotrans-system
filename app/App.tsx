import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Platform, SafeAreaView, StyleSheet, View } from 'react-native';
import { AppNavigator } from './src/app/navigation/AppNavigator';
import { NavigationProvider } from './src/app/navigation/NavigationContext';
import { AuthProvider } from './src/features/auth/authContext';
import { colors } from './src/shared/theme/colors';

export default function App() {
  const content = (
    <SafeAreaView style={styles.appContainer}>
      <StatusBar style="dark" />
      <AuthProvider>
        <NavigationProvider>
          <AppNavigator />
        </NavigationProvider>
      </AuthProvider>
    </SafeAreaView>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webRoot}>
        <View style={styles.webFrame}>{content}</View>
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
    maxWidth: 460,
    height: '100%',
    maxHeight: 940,
    backgroundColor: colors.background,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
  },
  appContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
