import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Circle, Line } from 'react-native-svg';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react-native';
import { t } from '../../shared/i18n';
import type { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { ThemeShadows } from '../../shared/theme/shadows';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Text } from '../../shared/ui';
import { stickToVelocity, turnRateFor } from './manualDriveLogic';

const PAD_SIZE = 188;
const RADIUS = 64;

interface ManualJoystickPadProps {
  disabled: boolean;
  maxLinear: number;
  onBeginGesture: () => boolean;
  onVelocityChange: (linear: number, angular: number) => void;
  onEndGesture: () => void;
}

export function ManualJoystickPad({
  disabled,
  maxLinear,
  onBeginGesture,
  onVelocityChange,
  onEndGesture,
}: ManualJoystickPadProps) {
  const { styles, colors } = useThemedStyles(createStyles);
  const knobX = useSharedValue(0);
  const knobY = useSharedValue(0);

  useEffect(() => {
    if (disabled) {
      knobX.set(0);
      knobY.set(0);
    }
  }, [disabled, knobX, knobY]);

  const handleDragStart = () => {
    if (disabled) return;
    onBeginGesture();
  };

  const handleDragUpdate = (dx: number, dy: number) => {
    if (disabled) return;
    const next = stickToVelocity(dx, dy, RADIUS, maxLinear);
    onVelocityChange(next.linear, next.angular);
  };

  const handleDragEnd = () => {
    knobX.set(0);
    knobY.set(0);
    onEndGesture();
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .enabled(!disabled)
    .onBegin(() => {
      knobX.set(0);
      knobY.set(0);
      scheduleOnRN(handleDragStart);
    })
    .onUpdate((event) => {
      const length = Math.hypot(event.translationX, event.translationY);
      const scale = length > RADIUS && length > 0 ? RADIUS / length : 1;
      knobX.set(event.translationX * scale);
      knobY.set(event.translationY * scale);
      scheduleOnRN(handleDragUpdate, event.translationX, event.translationY);
    })
    .onFinalize(() => {
      knobX.set(0);
      knobY.set(0);
      scheduleOnRN(handleDragEnd);
    });

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: knobX.get() }, { translateY: knobY.get() }],
  }));

  const maxAngular = turnRateFor(maxLinear);

  const nudgeProps = (linear: number, angular: number, label: string) => ({
    disabled,
    accessibilityRole: 'button' as const,
    accessibilityLabel: t(label),
    onPressIn: () => {
      if (disabled) return;
      if (onBeginGesture()) {
        onVelocityChange(linear, angular);
      }
    },
    onPressOut: () => {
      onEndGesture();
    },
  });

  return (
    <View style={styles.root}>
      <View style={[styles.padFrame, disabled && styles.padDisabled]}>
        <GestureDetector gesture={pan}>
          <View
            style={styles.padSurface}
            accessibilityLabel={t('Manual drive joystick')}
            accessibilityState={{ disabled }}
          >
            <Svg width={PAD_SIZE} height={PAD_SIZE} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Line
                x1={22}
                y1={PAD_SIZE / 2}
                x2={PAD_SIZE - 22}
                y2={PAD_SIZE / 2}
                stroke={colors.borderStrong}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <Line
                x1={PAD_SIZE / 2}
                y1={22}
                x2={PAD_SIZE / 2}
                y2={PAD_SIZE - 22}
                stroke={colors.borderStrong}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <Circle
                cx={PAD_SIZE / 2}
                cy={PAD_SIZE / 2}
                r={44}
                fill="none"
                stroke={colors.border}
                strokeWidth={1}
              />
            </Svg>
            <Animated.View
              style={[
                styles.knob,
                disabled ? styles.knobDisabled : styles.knobReady,
                knobStyle,
              ]}
            />
          </View>
        </GestureDetector>
      </View>

      <Text variant="caption" color="textSecondary" textAlign="center">
        {t('Hold and drag to drive · Release to stop immediately')}
      </Text>

      <View style={styles.nudgeRow}>
        <Pressable
          {...nudgeProps(0, maxAngular, 'Hold to turn left')}
          style={({ pressed }) => [styles.nudgeBtn, pressed && !disabled && styles.nudgePressed, disabled && styles.nudgeDisabled]}
        >
          <ArrowLeft size={18} color={disabled ? colors.textMuted : colors.textPrimary} />
          <Text variant="caption" color={disabled ? 'textMuted' : 'textPrimary'}>Left</Text>
        </Pressable>
        <Pressable
          {...nudgeProps(maxLinear, 0, 'Hold to drive forward')}
          style={({ pressed }) => [styles.nudgeBtn, pressed && !disabled && styles.nudgePressed, disabled && styles.nudgeDisabled]}
        >
          <ArrowUp size={18} color={disabled ? colors.textMuted : colors.textPrimary} />
          <Text variant="caption" color={disabled ? 'textMuted' : 'textPrimary'}>Forward</Text>
        </Pressable>
        <Pressable
          {...nudgeProps(-maxLinear, 0, 'Hold to drive reverse')}
          style={({ pressed }) => [styles.nudgeBtn, pressed && !disabled && styles.nudgePressed, disabled && styles.nudgeDisabled]}
        >
          <ArrowDown size={18} color={disabled ? colors.textMuted : colors.textPrimary} />
          <Text variant="caption" color={disabled ? 'textMuted' : 'textPrimary'}>Reverse</Text>
        </Pressable>
        <Pressable
          {...nudgeProps(0, -maxAngular, 'Hold to turn right')}
          style={({ pressed }) => [styles.nudgeBtn, pressed && !disabled && styles.nudgePressed, disabled && styles.nudgeDisabled]}
        >
          <ArrowRight size={18} color={disabled ? colors.textMuted : colors.textPrimary} />
          <Text variant="caption" color={disabled ? 'textMuted' : 'textPrimary'}>Right</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) =>
  StyleSheet.create({
    root: {
      alignItems: 'center',
      gap: 12,
    },
    padFrame: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    padDisabled: {
      opacity: 0.5,
    },
    padSurface: {
      width: PAD_SIZE,
      height: PAD_SIZE,
      borderRadius: PAD_SIZE / 2,
      backgroundColor: colors.surfaceSubtle,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.md,
    },
    knob: {
      width: 60,
      height: 60,
      borderRadius: 30,
      borderWidth: 3,
      borderColor: colors.surface,
      ...shadows.lg,
    },
    knobReady: {
      backgroundColor: colors.primary,
    },
    knobDisabled: {
      backgroundColor: colors.textMuted,
    },
    nudgeRow: {
      flexDirection: 'row',
      alignSelf: 'stretch',
      gap: 8,
    },
    nudgeBtn: {
      flex: 1,
      minHeight: 44,
      paddingVertical: 8,
      paddingHorizontal: 6,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSubtle,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    nudgePressed: {
      backgroundColor: colors.primaryLight,
      borderColor: colors.primaryBorder,
    },
    nudgeDisabled: {
      opacity: 0.45,
    },
  });
