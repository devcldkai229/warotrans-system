import React from 'react';
import { Image, StyleSheet, View, ViewStyle } from 'react-native';
import { ThemeColors } from '../theme/colors';
import { useThemedStyles } from '../theme/ThemeContext';

interface BrandMarkProps {
  size?: number;
  style?: ViewStyle;
}

/**
 * WaroTrans BrandMark.
 * Displays the cropped WaroTrans warehouse + AMR symbol mark on a crisp surface badge.
 */
export function BrandMark({ size = 36, style }: BrandMarkProps) {
  const styles = useThemedStyles(createStyles);
  const imageSize = Math.round(size * 0.84);
  const borderRadius = Math.round(size * 0.26);

  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius,
        },
        style,
      ]}
    >
      <Image
        source={require('../../../assets/logo_wrt.png')}
        style={{ width: imageSize, height: imageSize }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors, _shadows: unknown, isDark: boolean) =>
  StyleSheet.create({
    badge: {
      backgroundColor: isDark ? '#e6ebf2' : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : colors.border,
      borderCurve: 'continuous',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
