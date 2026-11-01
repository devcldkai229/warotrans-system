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
import { colors, ThemeColors } from '../theme/colors';
import { useThemedStyles } from '../theme/ThemeContext';
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
  const { styles, pressedStyles, textStyles } = useThemedStyles(createButtonStyles);
  const isInteractive = !disabled && !loading;

  return (
    <Pressable
      onPress={isInteractive ? onPress : undefined}
      disabled={!isInteractive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !isInteractive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        styles[size],
        style,
        disabled && styles.disabled,
        pressed && isInteractive && pressedStyles[variant],
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? '#ffffff' : colors.primary}
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

const createButtonStyles = (colors: ThemeColors) => ({
  styles: StyleSheet.create({
    base: {
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    primary: {
      backgroundColor: colors.darkAction,
      borderWidth: 1,
      borderColor: colors.darkActionBorder,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
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
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderBottomWidth: 0,
      shadowOpacity: 0,
      elevation: 0,
    },
    contentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 1,
      minWidth: 0,
    },
    iconLeft: {
      marginRight: 8,
      flexShrink: 0,
    },
    iconRight: {
      marginLeft: 8,
      flexShrink: 0,
    },
  }),
  pressedStyles: StyleSheet.create({
    primary: {
      backgroundColor: colors.darkActionPressed,
      transform: [{ scale: 0.985 }],
      shadowOpacity: 0.05,
      elevation: 1,
    },
    secondary: {
      backgroundColor: colors.surfaceMuted,
      transform: [{ scale: 0.98 }],
    },
    outline: {
      backgroundColor: colors.primaryLight,
      transform: [{ scale: 0.98 }],
    },
    danger: {
      backgroundColor: '#b91c1c',
      transform: [{ scale: 0.98 }],
    },
  }),
  textStyles: StyleSheet.create({
    base: {
      fontWeight: '800',
      fontFamily: typography.fontSans,
      letterSpacing: 0.5,
      textAlign: 'center',
      flexShrink: 1,
    },
    primary: {
      color: '#ffffff',
    },
    secondary: {
      color: colors.textPrimary,
    },
    outline: {
      color: colors.primaryText,
    },
    danger: {
      color: '#ffffff',
    },
    sm: {
      fontSize: 12,
      fontWeight: '800',
      fontFamily: typography.fontSans,
    },
    md: {
      fontSize: 14,
      fontWeight: '800',
      fontFamily: typography.fontSans,
    },
    lg: {
      fontSize: 15,
      fontWeight: '900',
      letterSpacing: 0.8,
      fontFamily: typography.fontSans,
    },
    disabled: {
      color: colors.textMuted,
    },
  }),
});

