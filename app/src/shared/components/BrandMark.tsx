import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Route } from 'lucide-react-native';
import { colors } from '../theme/colors';

interface BrandMarkProps {
  size?: number;
  style?: ViewStyle;
}

/**
 * Authentic WaroTrans Tactile BrandMark
 * Matches prototype <BrandMark/> with --shadow-control (3px 3D bottom shelf)
 * and high-contrast pure white Nav2 Route vector icon.
 */
export function BrandMark({ size = 40, style }: BrandMarkProps) {
  const iconSize = Math.round(size * 0.58);
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
      <Route size={iconSize} color="#ffffff" strokeWidth={2.6} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.primary, // Rich cobalt blue (#005cd1)
    alignItems: 'center',
    justifyContent: 'center',
    // 3D tactile control shelf under foot and right edge for diagonal extruded depth
    borderBottomWidth: 3.5,
    borderRightWidth: 2.5,
    borderBottomColor: '#003882',
    borderRightColor: '#003882',
    shadowColor: '#012147',
    shadowOffset: { width: 3, height: 3.5 },
    shadowOpacity: 0.35,
    shadowRadius: 2,
    elevation: 5,
  },
});
