import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { AppNavigator } from './src/app/navigation/AppNavigator';
import { NavigationProvider } from './src/app/navigation/NavigationContext';
import { AuthProvider } from './src/features/auth/authContext';
import { colors } from './src/shared/theme/colors';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <AuthProvider>
        <NavigationProvider>
          <AppNavigator />
        </NavigationProvider>
      </AuthProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
});
