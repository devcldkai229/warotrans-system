import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { ThemeColors } from '../theme/colors';
import { useThemedStyles } from '../theme/ThemeContext';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  highlighted?: boolean;
}

export function Card({ children, style, highlighted = false }: CardProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.card, highlighted && styles.highlighted, style]}>
      {children}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
