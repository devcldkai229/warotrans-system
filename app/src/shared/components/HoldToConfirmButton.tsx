import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
  ViewStyle,
} from 'react-native';
import { Check } from 'lucide-react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface HoldToConfirmButtonProps {
  onConfirm: () => void;
  label?: string;
  confirmingLabel?: string;
  holdDurationMs?: number;
  disabled?: boolean;
  style?: ViewStyle;
}

export function HoldToConfirmButton({
  onConfirm,
  label = 'Hold to Confirm',
  holdDurationMs = 1500,
  disabled = false,
  style,
}: HoldToConfirmButtonProps) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startHold = () => {
    if (disabled) return;

    try {
      Vibration.vibrate(30);
    } catch {
      // Haptics fallback
    }

    setHolding(true);
    let current = 0;
    const intervalMs = 10;

    timerRef.current = setInterval(() => {
      current += intervalMs;
      const p = Math.min((current / holdDurationMs) * 100, 100);
      setProgress(p);

      if (current === 750) {
        try {
          Vibration.vibrate(20);
        } catch {}
      }

      if (current >= holdDurationMs) {
        if (timerRef.current) clearInterval(timerRef.current);
        setHolding(false);
        setProgress(0);
        try {
          Vibration.vibrate([0, 60, 40, 80]);
        } catch {}
        onConfirm();
      }
    }, intervalMs);
  };

  const endHold = () => {
    setHolding(false);
    setProgress(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const isHalfway = progress > 50;

  return (
    <Pressable
      onPressIn={startHold}
      onPressOut={endHold}
      disabled={disabled}
      style={({ pressed }) => [
        styles.buttonContainer,
        disabled && styles.buttonDisabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {/* Background fill progress */}
      <View
        style={[
          styles.progressFill,
          { width: `${progress}%` },
        ]}
      />

      {/* Button Content */}
      <View style={styles.contentRow} pointerEvents="none">
        <Check
          size={19}
          color={isHalfway ? '#ffffff' : colors.success}
          strokeWidth={2.5}
        />
        <Text
          style={[
            styles.label,
            isHalfway && styles.labelWhite,
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  buttonContainer: {
    height: 52,
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderRadius: 6,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.success,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  labelWhite: {
    color: '#ffffff',
  },
});
