import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Route } from 'lucide-react-native';
import { colors } from '../theme/colors';

interface BrandMarkProps {
  size?: number;
  style?: ViewStyle;
}

/**
 * WaroTrans BrandMark (Flat Monochrome Edition).
 * Minimalist black-and-white icon mark with zero 3D bevels or extruded shelves.
 */
export function BrandMark({ size = 36, style }: BrandMarkProps) {
  const iconSize = Math.round(size * 0.58);
  const borderRadius = Math.round(size * 0.28);

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
      <Route size={iconSize} color="#ffffff" strokeWidth={2.4} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#121317', // Solid deep ink / black
    alignItems: 'center',
    justifyContent: 'center',
  },
});
