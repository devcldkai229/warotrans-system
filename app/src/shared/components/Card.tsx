import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  highlighted?: boolean;
}

export function Card({ children, style, highlighted = false }: CardProps) {
  return (
    <View style={[styles.card, highlighted && styles.highlighted, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  highlighted: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
});
