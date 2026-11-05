import React, { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { colors } from '../theme/colors';
import { radii } from '../theme/radii';
import { typography } from '../theme/typography';
import { Text } from '../ui/Text';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Input({
  label,
  error,
  hint,
  containerStyle,
  inputStyle,
  leftIcon,
  rightIcon,
  secureTextEntry,
  accessibilityLabel,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text variant="caption" color={colors.textSecondary} style={styles.label}>
          {label}
        </Text>
      )}
      <View
        style={[
          styles.inputContainer,
          isFocused && styles.inputFocused,
          error ? styles.inputError : null,
        ]}
      >
        {leftIcon && <View style={styles.iconLeft}>{leftIcon}</View>}
        <TextInput
          {...props}
          accessibilityLabel={accessibilityLabel ?? label}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, inputStyle]}
          onFocus={(event) => { setIsFocused(true); props.onFocus?.(event); }}
          onBlur={(event) => { setIsFocused(false); props.onBlur?.(event); }}
          secureTextEntry={secureTextEntry}
        />
        {rightIcon && <View style={styles.iconRight}>{rightIcon}</View>}
      </View>
      {error ? (
        <Text variant="caption" color={colors.danger} style={styles.errorText}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color={colors.textMuted} style={styles.hintText}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  inputFocused: {
    borderColor: colors.primary,
    backgroundColor: '#ffffff',
  },
  inputError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    fontFamily: typography.fontSans,
    color: colors.textPrimary,
    paddingVertical: 12,
  },
  iconLeft: {
    marginRight: 10,
  },
  iconRight: {
    marginLeft: 10,
  },
  errorText: {
    marginTop: 2,
    fontWeight: '600',
  },
  hintText: {
    marginTop: 2,
  },
});
