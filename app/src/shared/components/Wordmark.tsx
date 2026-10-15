import React from 'react';
import { Image, StyleSheet, View, ViewStyle } from 'react-native';

interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

/**
 * Authentic WaroTrans Brand Wordmark & Logo.
 * Displays the official WaroTrans logo asset matching the Admin Web console.
 */
export function Wordmark({ size = 'md', style }: WordmarkProps) {
  const height = size === 'sm' ? 24 : size === 'lg' ? 38 : 30;

  return (
    <View style={[styles.container, style]}>
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
});
