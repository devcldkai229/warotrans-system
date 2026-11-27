import React, { memo, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { LoginParticleWave } from './LoginParticleWave';

const ENTER_EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const WAVE_EASE = Easing.inOut(Easing.sin);
const IS_WEB = Platform.OS === 'web';

/**
 * Antigravity-inspired Login Backdrop with rolling 3D particle wave motion.
 *
 * Keeps the upper workspace crisp and steady while breathing atmospheric mist
 * and undulating 3D micro-dots across the lower horizon.
 */
export const LoginBackdrop = memo(function LoginBackdrop({
  isDark,
}: {
  isDark: boolean;
}) {
  const [reducedMotion, setReducedMotion] = useState(false);

  const enterOpacity = useRef(new Animated.Value(0)).current;
  const mistPhase = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReducedMotion(enabled);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      setReducedMotion,
    );
    return () => {
      active = false;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    enterOpacity.setValue(0);
    const enterAnim = Animated.timing(enterOpacity, {
      toValue: 1,
      duration: reducedMotion ? 150 : 450,
      easing: ENTER_EASE_OUT,
      useNativeDriver: !IS_WEB,
    });
    enterAnim.start();

    if (reducedMotion) {
      mistPhase.setValue(0.5);
      return () => {
        enterAnim.stop();
      };
    }

    const mistLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(mistPhase, {
          toValue: 1,
          duration: 6500,
          easing: WAVE_EASE,
          useNativeDriver: !IS_WEB,
        }),
        Animated.timing(mistPhase, {
          toValue: 0,
          duration: 6500,
          easing: WAVE_EASE,
          useNativeDriver: !IS_WEB,
        }),
      ]),
    );

    mistLoop.start();
    return () => {
      enterAnim.stop();
      mistLoop.stop();
    };
  }, [reducedMotion, enterOpacity, mistPhase]);

  const mistStyle = {
    opacity: mistPhase.interpolate({
      inputRange: [0, 1],
      outputRange: [0.84, 1],
    }),
    transform: [
      {
        translateX: mistPhase.interpolate({
          inputRange: [0, 1],
          outputRange: [-14, 14],
        }),
      },
      {
        translateY: mistPhase.interpolate({
          inputRange: [0, 1],
          outputRange: [6, -10],
        }),
      },
      {
        scale: mistPhase.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.06],
        }),
      },
    ],
  };

  const baseColor = isDark ? '#0f1218' : '#ffffff';

  return (
    <View aria-hidden pointerEvents="none" style={styles.root}>
      {/* Static base canvas + bottom horizon wash */}
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 400 800"
        preserveAspectRatio="xMidYMax slice"
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <LinearGradient
            id={isDark ? 'agBottomDark' : 'agBottomLight'}
            x1="50%"
            y1={isDark ? '48%' : '46%'}
            x2="50%"
            y2="100%"
          >
            <Stop offset="0" stopColor={baseColor} stopOpacity="1" />
            <Stop
              offset={isDark ? '0.50' : '0.48'}
              stopColor={isDark ? '#101b2d' : '#eef7ff'}
              stopOpacity="1"
            />
            <Stop
              offset="0.84"
              stopColor={isDark ? '#102036' : '#ddf0ff'}
              stopOpacity="1"
            />
            <Stop
              offset="1"
              stopColor={isDark ? '#0f233c' : '#cde8ff'}
              stopOpacity="1"
            />
          </LinearGradient>
        </Defs>

        <Rect x={0} y={0} width={400} height={800} fill={baseColor} />
        <Rect
          x={0}
          y={0}
          width={400}
          height={800}
          fill={`url(#${isDark ? 'agBottomDark' : 'agBottomLight'})`}
        />
      </Svg>

      {/* Atmospheric bloom + rolling wave particle field */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: enterOpacity }]}>
        <Animated.View style={[styles.overscan, mistStyle]}>
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 400 800"
            preserveAspectRatio="xMidYMax slice"
          >
            <Defs>
              <RadialGradient
                id={isDark ? 'agLeftSkyDark' : 'agLeftSkyLight'}
                cx="12%"
                cy="94%"
                rx="64%"
                ry="42%"
                r="52%"
              >
                <Stop
                  offset="0"
                  stopColor={isDark ? '#0ea5e9' : '#7dd3fc'}
                  stopOpacity={isDark ? '0.28' : '0.56'}
                />
                <Stop
                  offset="0.52"
                  stopColor={isDark ? '#0284c7' : '#bae6fd'}
                  stopOpacity={isDark ? '0.11' : '0.26'}
                />
                <Stop offset="1" stopColor={baseColor} stopOpacity="0" />
              </RadialGradient>

              <RadialGradient
                id={isDark ? 'agPeriwinkleDark' : 'agPeriwinkleLight'}
                cx="52%"
                cy="88%"
                rx="56%"
                ry="38%"
                r="48%"
              >
                <Stop
                  offset="0"
                  stopColor={isDark ? '#6366f1' : '#93b4ff'}
                  stopOpacity={isDark ? '0.24' : '0.40'}
                />
                <Stop
                  offset="0.55"
                  stopColor={isDark ? '#3b82f6' : '#c7d7fe'}
                  stopOpacity={isDark ? '0.10' : '0.18'}
                />
                <Stop offset="1" stopColor={baseColor} stopOpacity="0" />
              </RadialGradient>

              <RadialGradient
                id={isDark ? 'agRightCyanDark' : 'agRightCyanLight'}
                cx="90%"
                cy="95%"
                rx="58%"
                ry="40%"
                r="50%"
              >
                <Stop
                  offset="0"
                  stopColor={isDark ? '#38bdf8' : '#72d5ff'}
                  stopOpacity={isDark ? '0.26' : '0.54'}
                />
                <Stop
                  offset="0.55"
                  stopColor={isDark ? '#0ea5e9' : '#bae6fd'}
                  stopOpacity={isDark ? '0.10' : '0.24'}
                />
                <Stop offset="1" stopColor={baseColor} stopOpacity="0" />
              </RadialGradient>
            </Defs>

            <Rect
              x={0}
              y={0}
              width={400}
              height={800}
              fill={`url(#${isDark ? 'agLeftSkyDark' : 'agLeftSkyLight'})`}
            />
            <Rect
              x={0}
              y={0}
              width={400}
              height={800}
              fill={`url(#${isDark ? 'agPeriwinkleDark' : 'agPeriwinkleLight'})`}
            />
            <Rect
              x={0}
              y={0}
              width={400}
              height={800}
              fill={`url(#${isDark ? 'agRightCyanDark' : 'agRightCyanLight'})`}
            />
          </Svg>
        </Animated.View>

        <LoginParticleWave isDark={isDark} reducedMotion={IS_WEB && reducedMotion} />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  overscan: {
    position: 'absolute',
    top: -16,
    bottom: -24,
    left: -24,
    right: -24,
  },
});
