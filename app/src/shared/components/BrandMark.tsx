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
    // 3D tactile control shelf under the foot of the badge (matching prototype shadow-control: 0 3px 0 oklch(25% .08 255/.2))
    borderBottomWidth: 3.5,
    borderBottomColor: '#003882',
    shadowColor: '#012147',
    shadowOffset: { width: 0, height: 3.5 },
    shadowOpacity: 0.3,
    shadowRadius: 1,
    elevation: 4,
  },
});
