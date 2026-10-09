import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
  ViewStyle,
} from 'react-native';
import { Check, CheckCircle2 } from 'lucide-react-native';
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
  label = 'HOLD 1.5s TO CONFIRM',
  confirmingLabel = 'HOLD TO CONFIRM...',
  holdDurationMs = 1500,
  disabled = false,
  style,
}: HoldToConfirmButtonProps) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startHold = () => {
    if (disabled || confirmed) return;

    try {
      Vibration.vibrate(30);
    } catch {
      // Haptics fallback
    }

    setHolding(true);
    let elapsed = 0;
    const intervalMs = 16; // ~60fps smooth progress

    timerRef.current = setInterval(() => {
      elapsed += intervalMs;
      const p = Math.min((elapsed / holdDurationMs) * 100, 100);
      setProgress(p);

      if (elapsed >= holdDurationMs) {
        if (timerRef.current) clearInterval(timerRef.current);
        setHolding(false);
        setConfirmed(true);
        try {
          Vibration.vibrate([0, 60, 40, 80]);
        } catch {
          // Haptics fallback
        }
        onConfirm();

        // Reset state after a brief visual confirmation feedback
        setTimeout(() => {
          setConfirmed(false);
          setProgress(0);
        }, 1200);
      }
    }, intervalMs);
  };

  const endHold = () => {
    if (confirmed) return;
    setHolding(false);
    setProgress(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

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
          confirmed && styles.progressFillConfirmed,
        ]}
      />

      {/* Button Content */}
      <View style={styles.contentRow}>
        {confirmed ? (
          <>
            <CheckCircle2 size={18} color="#ffffff" />
            <Text style={styles.confirmedText}>CONFIRMED</Text>
          </>
        ) : holding ? (
          <>
            <Check size={16} color={progress > 50 ? '#ffffff' : colors.success} />
            <Text
              style={[
                styles.holdingText,
                progress > 50 && styles.textWhite,
              ]}
            >
              {confirmingLabel} ({Math.round(progress)}%)
            </Text>
          </>
        ) : (
          <>
            <View style={styles.pulseIndicator} />
            <Text style={styles.idleText}>{label}</Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  buttonContainer: {
    height: 50,
    backgroundColor: 'rgba(0, 122, 56, 0.12)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.success,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.success,
    opacity: 0.9,
  },
  progressFillConfirmed: {
    width: '100%',
    backgroundColor: colors.success,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 2,
    paddingHorizontal: 12,
  },
  pulseIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  idleText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '900',
    fontFamily: typography.fontSans,
    letterSpacing: 0.8,
  },
  holdingText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '900',
    fontFamily: typography.fontSans,
    letterSpacing: 0.6,
  },
  confirmedText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    fontFamily: typography.fontSans,
    letterSpacing: 0.8,
  },
  textWhite: {
    color: '#ffffff',
  },
});
