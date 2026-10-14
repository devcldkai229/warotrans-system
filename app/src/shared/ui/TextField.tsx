import { X } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { colors } from '../theme/colors';
import { radii } from '../theme/radii';
import { typography } from '../theme/typography';
import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  /** Shown below the field in `danger` and switches the border to the danger tone. */
  error?: string;
  /** Shown below the field when there is no error. */
  hint?: string;
  /** Leading adornment, e.g. `Search` or `MapPin`. */
  leftIcon?: React.ReactNode;
  /** Trailing adornment. Ignored while the clear button is showing. */
  rightIcon?: React.ReactNode;
  /** Renders a clear ("x") button once the field has a value. */
  showClearButton?: boolean;
  onClear?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: TextInputProps['style'];
}

/**
 * Labelled text input.
 *
 * 48pt tall (above the 44pt touch floor), 1px hairline that turns accent on
 * focus and danger on error. No inner shadow: the border does the work, which
 * keeps the field calm when a form stacks five of them.
 */
export function TextField({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  showClearButton = false,
  onClear,
  containerStyle,
  inputStyle,
  value,
  onChangeText,
  secureTextEntry,
  accessibilityLabel,
  editable = true,
  ...props
}: TextFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  /**
   * `showClearButton` is a request, not a command: clearing a read-only field
   * would leave the operator staring at a value they cannot edit or remove, so
   * the button only appears when the field can actually be written to.
   */
  const canClear = showClearButton && editable && !secureTextEntry && !!value;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text variant="label" color={colors.textSecondary} style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.field,
          isFocused && styles.fieldFocused,
          !!error && styles.fieldError,
          !editable && styles.fieldDisabled,
        ]}
      >
        {leftIcon ? <View style={styles.adornment}>{leftIcon}</View> : null}
        <TextInput
          {...props}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          editable={editable}
          accessibilityLabel={accessibilityLabel ?? label}
          placeholderTextColor={props.placeholderTextColor ?? colors.textMuted}
          onFocus={(event) => {
            setIsFocused(true);
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            setIsFocused(false);
            props.onBlur?.(event);
          }}
          style={[styles.input, inputStyle]}
        />
        {canClear ? (
          <Pressable
            /**
             * Defaulting the handler to `onChangeText('')` means the common case
             * (`showClearButton` + `onChangeText`) needs no `onClear` prop at
             * all, and a caller-supplied `onClear` still wins.
             */
            onPress={onClear ?? (() => onChangeText?.(''))}
            accessibilityRole="button"
            /**
             * Falls back to the field's own `accessibilityLabel`, so a search box
             * declared only for the screen reader does not announce a bare
             * "Clear" with nothing to clear.
             */
            accessibilityLabel={`Clear ${label ?? accessibilityLabel ?? 'field'}`.trim()}
            hitSlop={8}
            style={({ pressed }) => [styles.clearBtn, pressed && styles.clearBtnPressed]}
          >
            <X size={16} color={colors.textMuted} strokeWidth={2.2} />
          </Pressable>
        ) : rightIcon ? (
          <View style={styles.adornment}>{rightIcon}</View>
        ) : null}
      </View>

      {error ? (
        <Text variant="caption" color={colors.dangerText} style={styles.helper}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color={colors.textMuted} style={styles.helper}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    marginBottom: 6,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
  },
  fieldFocused: {
    borderColor: colors.primary,
  },
  fieldError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  fieldDisabled: {
    backgroundColor: colors.surfaceMuted,
  },
  adornment: {
    marginRight: 8,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    // Same step as `<Text variant="body">`, including the family: a raw
    // `fontSize` here left the field rendering in the browser's default face on
    // web while every label around it rendered in Inter.
    ...typography.bodyMedium,
    fontFamily: typography.fontSans,
    color: colors.textPrimary,
  },
  clearBtn: {
    width: 28,
    height: 28,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  clearBtnPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  helper: {
    marginTop: 6,
  },
});