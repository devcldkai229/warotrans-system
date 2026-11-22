import React, { memo, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

interface ParticleDot {
  x: number;
  y: number;
  r: number;
  o: number;
}

const ENTER_EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const WAVE_EASE = Easing.inOut(Easing.sin);

function buildWaveLayers(): { primary: ParticleDot[]; secondary: ParticleDot[] } {
  const primary: ParticleDot[] = [];
  const secondary: ParticleDot[] = [];

  // Primary 3D undulating particle field across the lower atmosphere.
  const cols = 30;
  const rows = 18;
  for (let row = 0; row < rows; row++) {
    const v = row / (rows - 1);
    for (let col = 0; col < cols; col++) {
      const u = (col / (cols - 1)) * 2 - 1;
      const wave =
        Math.sin(u * 2.5 + v * 1.9) * 0.55 +
        Math.cos(u * 1.35 - v * 2.7) * 0.45;
      const hill =
        Math.exp(-Math.pow((u - 0.05) / 0.54, 2)) * (1 - v * 0.42);
      const x = 200 + u * (195 + v * 58);
      const y = 568 + v * 232 - wave * 24 - hill * 44;

      const topFade = Math.min(1, v / 0.24);
      const sideFade = Math.max(0, 1 - Math.pow(Math.abs(u), 2.3));
      const crest = 0.38 + 0.62 * hill + 0.25 * Math.max(0, wave);
      const opacity = Math.min(0.42, topFade * sideFade * crest * 0.36);

      if (opacity >= 0.045 && x >= -10 && x <= 410 && y >= 480 && y <= 805) {
        primary.push({
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          r: Math.round((0.65 + (0.45 * v + 0.2 * crest)) * 100) / 100,
          o: Math.round(opacity * 1000) / 1000,
        });
      }
    }
  }

  // Secondary counter-drifting foreground wave for organic depth separation.
  const subCols = 18;
  const subRows = 11;
  for (let row = 0; row < subRows; row++) {
    const v = row / (subRows - 1);
    for (let col = 0; col < subCols; col++) {
      const t = col / (subCols - 1);
      const u = -0.75 + t * 1.8;
      const ripple = Math.sin(t * 3.1 + v * 2.2) * 16;
      const arc = Math.cos((t - 0.55) * 2.4) * 22;
      const x = 200 + u * 205 + (v - 0.5) * 20;
      const y = 632 + v * 160 - ripple - arc * (1 - v * 0.35);

      const env =
        Math.sin(Math.min(1, t) * Math.PI) *
        Math.min(1, v / 0.25) *
        (1 - v * 0.22);
      const opacity = Math.min(0.32, env * 0.32);

      if (opacity >= 0.045 && x >= -10 && x <= 410 && y >= 590 && y <= 798) {
        secondary.push({
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          r: Math.round((0.68 + 0.32 * v) * 100) / 100,
          o: Math.round(opacity * 1000) / 1000,
        });
      }
    }
  }

  return { primary, secondary };
}

const { primary: PRIMARY_DOTS, secondary: SECONDARY_DOTS } = buildWaveLayers();

/**
 * Antigravity-inspired Login Backdrop with GPU-composited ambient wave motion.
 *
 * Keeps the upper workspace crisp and steady while floating multi-lobe
 * sky/periwinkle mist and two counter-drifting particle wave contours along
 * the bottom edge. Honors system reduced-motion settings automatically.
 */
export const LoginBackdrop = memo(function LoginBackdrop({
  isDark,
}: {
  isDark: boolean;
}) {
  const [reducedMotion, setReducedMotion] = useState(false);

  const enterOpacity = useRef(new Animated.Value(0)).current;
  const mistPhase = useRef(new Animated.Value(0)).current;
  const waveAPhase = useRef(new Animated.Value(0)).current;
  const waveBPhase = useRef(new Animated.Value(0)).current;

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
      useNativeDriver: true,
    });
    enterAnim.start();

    if (reducedMotion) {
      mistPhase.setValue(0.5);
      waveAPhase.setValue(0.5);
      waveBPhase.setValue(0.5);
      return () => {
        enterAnim.stop();
      };
    }

    const createLoop = (val: Animated.Value, fullCycleMs: number) => {
      const half = Math.round(fullCycleMs / 2);
      return Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: 1,
            duration: half,
            easing: WAVE_EASE,
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: half,
            easing: WAVE_EASE,
            useNativeDriver: true,
          }),
        ]),
      );
    };

    const mistLoop = createLoop(mistPhase, 9500);
    const waveALoop = createLoop(waveAPhase, 7500);
    const waveBLoop = createLoop(waveBPhase, 11000);

    mistLoop.start();
    waveALoop.start();
    waveBLoop.start();

    return () => {
      enterAnim.stop();
      mistLoop.stop();
      waveALoop.stop();
      waveBLoop.stop();
    };
  }, [reducedMotion, enterOpacity, mistPhase, waveAPhase, waveBPhase]);

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

  const waveAStyle = {
    opacity: waveAPhase.interpolate({
      inputRange: [0, 1],
      outputRange: [0.76, 1],
    }),
    transform: [
      {
        translateX: waveAPhase.interpolate({
          inputRange: [0, 1],
          outputRange: [-12, 12],
        }),
      },
      {
        translateY: waveAPhase.interpolate({
          inputRange: [0, 1],
          outputRange: [8, -9],
        }),
      },
      {
        scaleX: waveAPhase.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.035],
        }),
      },
      {
        scaleY: waveAPhase.interpolate({
          inputRange: [0, 1],
          outputRange: [0.985, 1.03],
        }),
      },
    ],
  };

  const waveBStyle = {
    opacity: waveBPhase.interpolate({
      inputRange: [0, 1],
      outputRange: [0.55, 0.95],
    }),
    transform: [
      {
        translateX: waveBPhase.interpolate({
          inputRange: [0, 1],
          outputRange: [14, -12],
        }),
      },
      {
        translateY: waveBPhase.interpolate({
          inputRange: [0, 1],
          outputRange: [-7, 9],
        }),
      },
      {
        scale: waveBPhase.interpolate({
          inputRange: [0, 1],
          outputRange: [1.03, 0.98],
        }),
      },
    ],
  };

  const baseColor = isDark ? '#0f1218' : '#ffffff';
  const dotColor = isDark ? '#7dd3fc' : '#2b5cc4';
  const dotScale = isDark ? 0.85 : 0.92;

  return (
    <View pointerEvents="none" style={styles.root}>
      {/* Static base canvas + bottom horizon wash */}
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 400 800"
        preserveAspectRatio="xMidYMax slice"
        style={StyleSheet.absoluteFill}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
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

      {/* Atmospheric bloom + counter-drifting particle wave layers */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: enterOpacity }]}>
        <Animated.View style={[styles.overscan, mistStyle]}>
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 400 800"
            preserveAspectRatio="xMidYMax slice"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
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

        <Animated.View style={[styles.overscan, waveAStyle]}>
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 400 800"
            preserveAspectRatio="xMidYMax slice"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {PRIMARY_DOTS.map((dot, idx) => (
              <Circle
                key={idx}
                cx={dot.x}
                cy={dot.y}
                r={dot.r}
                fill={dotColor}
                fillOpacity={dot.o * dotScale}
              />
            ))}
          </Svg>
        </Animated.View>

        <Animated.View style={[styles.overscan, waveBStyle]}>
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 400 800"
            preserveAspectRatio="xMidYMax slice"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {SECONDARY_DOTS.map((dot, idx) => (
              <Circle
                key={idx}
                cx={dot.x}
                cy={dot.y}
                r={dot.r}
                fill={dotColor}
                fillOpacity={dot.o * dotScale}
              />
            ))}
          </Svg>
        </Animated.View>
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
