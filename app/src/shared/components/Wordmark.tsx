import React from 'react';
import { Image, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

/**
 * Authentic WaroTrans Brand Wordmark & Logo.
 * Displays the official WaroTrans logo asset matching the Admin Web console.
 */
export function Wordmark({ size = 'md', style }: WordmarkProps) {
  const { isDark } = useTheme();
  const height = size === 'sm' ? 24 : size === 'lg' ? 38 : 30;

  return (
    <View style={[styles.container, isDark && styles.containerDark, style]}>
      <Image
        source={require('../../../assets/logo_wrt.png')}
        style={{ height, width: height * 4.2 }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  containerDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
