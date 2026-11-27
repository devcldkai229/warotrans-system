import { ScanLine } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { translateText } from '../i18n';
import { ThemeColors } from '../theme/colors';
import { radii } from '../theme/radii';
import { useThemedStyles } from '../theme/ThemeContext';
import { Button } from './Button';
import { Text } from './Text';
import { TextField } from './TextField';

export interface BarcodeScanFieldProps {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  onOpenScanner?: () => void;
  placeholder?: string;
  verifyTitle?: string;
  showVerifyButton?: boolean;
  error?: string | null;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/**
 * Unified barcode input + camera scanner trigger + aligned 48pt Verify action.
 *
 * Keeps manual entry, scanner launch, and inline mismatch errors in a single
 * flush row so operators never deal with misaligned buttons or duplicate scan UI.
 */
export function BarcodeScanField({
  label,
  value,
  onChangeText,
  onSubmit,
  onOpenScanner,
  placeholder,
  verifyTitle,
  showVerifyButton = true,
  error,
  disabled = false,
  accessibilityLabel,
}: BarcodeScanFieldProps) {
  const { styles, colors } = useThemedStyles(createStyles);

  return (
    <View style={styles.root}>
      {label ? (
        <Text variant="label" color="textSecondary" style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View style={styles.row}>
        <View style={styles.fieldWrap}>
          <TextField
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder ?? 'Scan or type container barcode'}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={onSubmit}
            editable={!disabled}
            accessibilityLabel={accessibilityLabel ?? label ?? 'Container Barcode'}
            rightIcon={
              onOpenScanner ? (
                <Pressable
                  onPress={onOpenScanner}
                  disabled={disabled}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={translateText('Scan with Camera')}
                  style={({ pressed }) => [
                    styles.scannerBtn,
                    disabled && styles.scannerBtnDisabled,
                    pressed && !disabled && styles.scannerBtnPressed,
                  ]}
                >
                  <ScanLine size={17} color={colors.primaryText} />
                </Pressable>
              ) : undefined
            }
          />
        </View>

        {showVerifyButton ? (
          <Button
            title={verifyTitle ?? 'Verify'}
            variant="outline"
            size="md"
            disabled={Boolean(disabled) || !value.trim()}
            onPress={onSubmit}
          />
        ) : null}
      </View>

      {error ? (
        <Text variant="caption" color="dangerText" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      gap: 6,
    },
    label: {
      marginBottom: 0,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    fieldWrap: {
      flex: 1,
      minWidth: 0,
    },
    scannerBtn: {
      width: 34,
      height: 34,
      borderRadius: radii.sm,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scannerBtnPressed: {
      opacity: 0.78,
    },
    scannerBtnDisabled: {
      opacity: 0.45,
    },
    error: {
      marginTop: 0,
    },
  });
