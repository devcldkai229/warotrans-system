import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { ThemeColors } from '../theme/colors';
import type { ThemeShadows } from '../theme/shadows';
import { useThemedStyles } from '../theme/ThemeContext';

const TRACK_WIDTH = 46;
const TRACK_HEIGHT = 28;
const TRACK_PADDING = 2;
const THUMB_SIZE = 24;
const SWITCH_TRAVEL = TRACK_WIDTH - TRACK_PADDING * 2 - THUMB_SIZE;

// Apple HIG iOS systemGreen and translucent systemFill tokens
const IOS_GREEN_LIGHT = '#34C759';
const IOS_GREEN_DARK = '#30D158';
const IOS_FILL_LIGHT = 'rgba(120, 120, 128, 0.16)';
const IOS_FILL_DARK = 'rgba(120, 120, 128, 0.32)';

const SWITCH_SPRING = {
  duration: 240,
  dampingRatio: 0.92,
  overshootClamping: true,
  reduceMotion: ReduceMotion.System,
} as const;

export interface ToggleSwitchProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
}

/**
 * Apple iOS UISwitch-styled toggle with system green active track,
 * white tactile thumb across light/dark modes, and spring motion.
 */
export function ToggleSwitch({
  value,
  onValueChange,
  accessibilityLabel,
  disabled = false,
}: ToggleSwitchProps) {
  const { styles, isDark } = useThemedStyles(createStyles);
  const onColor = isDark ? IOS_GREEN_DARK : IOS_GREEN_LIGHT;
  const offColor = isDark ? IOS_FILL_DARK : IOS_FILL_LIGHT;

  const progress = useSharedValue(value ? 1 : 0);
  const prevValueRef = useRef(value);

  useEffect(() => {
    // Only animate actual value transitions so initial mount stays settled
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      progress.value = withSpring(value ? 1 : 0, SWITCH_SPRING);
    }
  }, [value, progress]);

  useEffect(() => {
    return () => cancelAnimation(progress);
  }, [progress]);

  const trackAnimatedStyle = useAnimatedStyle(
    () => ({
      backgroundColor: interpolateColor(progress.value, [0, 1], [offColor, onColor]),
    }),
    [offColor, onColor],
  );

  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * SWITCH_TRAVEL }],
  }));

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.pressable,
        pressed && !disabled && styles.pressablePressed,
        disabled && styles.pressableDisabled,
      ]}
    >
      <Animated.View style={[styles.track, trackAnimatedStyle]}>
        <Animated.View style={[styles.thumb, thumbAnimatedStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const createStyles = (_colors: ThemeColors, _shadows: ThemeShadows, isDark: boolean) =>
  StyleSheet.create({
    pressable: {
      justifyContent: 'center',
    },
    pressablePressed: {
      opacity: 0.92,
    },
    pressableDisabled: {
      opacity: 0.45,
    },
    track: {
      width: TRACK_WIDTH,
      height: TRACK_HEIGHT,
      borderRadius: TRACK_HEIGHT / 2,
      padding: TRACK_PADDING,
      justifyContent: 'center',
    },
    thumb: {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: THUMB_SIZE / 2,
      backgroundColor: '#ffffff',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(0, 0, 0, 0.04)',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.32 : 0.18,
      shadowRadius: 3,
      elevation: 2,
    },
  });
