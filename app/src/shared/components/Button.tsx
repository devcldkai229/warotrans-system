import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  rightIcon,
  style,
  textStyle,
}: ButtonProps) {
  const isInteractive = !disabled && !loading;

  return (
    <Pressable
      onPress={isInteractive ? onPress : undefined}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        styles[size],
        disabled && styles.disabled,
        pressed && isInteractive && pressedStyles[variant],
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? colors.textInverse : colors.primary}
        />
      ) : (
        <View style={styles.contentRow}>
          {icon && <View style={styles.iconLeft}>{icon}</View>}
          <Text
            style={[
              textStyles.base,
              textStyles[variant],
              textStyles[size],
              disabled && textStyles.disabled,
              textStyle,
            ]}
          >
            {label}
          </Text>
          {rightIcon && <View style={styles.iconRight}>{rightIcon}</View>}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primary: {
    backgroundColor: colors.primary,
    borderBottomWidth: 3,
    borderBottomColor: '#004bb0',
    shadowColor: '#00285a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 3,
  },
  secondary: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  danger: {
    backgroundColor: colors.danger,
    borderBottomWidth: 3,
    borderBottomColor: '#991b1b',
  },
  sm: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  md: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  lg: {
    minHeight: 54,
    paddingVertical: 15,
    paddingHorizontal: 24,
  },
  disabled: {
    opacity: 0.5,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
});

const pressedStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.primaryDark,
  },
  secondary: {
    backgroundColor: colors.surfaceMuted,
  },
  outline: {
    backgroundColor: colors.primaryLight,
  },
  danger: {
    backgroundColor: '#b91c1c',
  },
});

const textStyles = StyleSheet.create({
  base: {
    fontWeight: '800',
    fontFamily: typography.fontSans,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  primary: {
    color: colors.textInverse,
  },
  secondary: {
    color: colors.textPrimary,
  },
  outline: {
    color: colors.primary,
  },
  danger: {
    color: colors.textInverse,
  },
  sm: {
    fontSize: 12,
    fontWeight: '800',
  },
  md: {
    fontSize: 14,
    fontWeight: '800',
  },
  lg: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  disabled: {
    color: colors.textMuted,
  },
});

