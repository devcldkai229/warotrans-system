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

const BUCKET_COUNT = 10;
const WEB_COLS = 42;
const WEB_ROWS = 18;
const NATIVE_ROWS = 12;
const NATIVE_COLS = 26;

function buildNativeWaveRows(): ParticleDot[][] {
  const rows: ParticleDot[][] = [];
  for (let row = 0; row < NATIVE_ROWS; row++) {
    const v = row / (NATIVE_ROWS - 1);
    const rowDots: ParticleDot[] = [];
    for (let col = 0; col < NATIVE_COLS; col++) {
      const u = (col / (NATIVE_COLS - 1)) * 2 - 1;
      const wave =
        Math.sin(u * 2.5 + v * 1.9) * 0.55 +
        Math.cos(u * 1.35 - v * 2.7) * 0.45;
      const hill =
        Math.exp(-Math.pow((u - 0.05) / 0.54, 2)) * (1 - v * 0.42);
      const x = 200 + u * (195 + v * 58);
      const y = 558 + v * 238 - wave * 24 - hill * 44;

      const topFade = Math.min(1, v / 0.24);
      const sideFade = Math.max(0, 1 - Math.pow(Math.abs(u), 2.3));
      const crest = 0.38 + 0.62 * hill + 0.25 * Math.max(0, wave);
      const opacity = Math.min(0.42, topFade * sideFade * crest * 0.36);

      if (opacity >= 0.045 && x >= -10 && x <= 410 && y >= 480 && y <= 805) {
        rowDots.push({
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          r: Math.round((0.72 + 0.45 * v + 0.22 * crest) * 100) / 100,
          o: Math.round(opacity * 1000) / 1000,
        });
      }
    }
    rows.push(rowDots);
  }
  return rows;
}

const NATIVE_WAVE_ROWS = buildNativeWaveRows();

/**
 * Web-only 60/120fps Gerstner 3D particle silk wave drawn onto an HTML5 `<canvas>`
 * inside `requestAnimationFrame` with zero React re-renders and quantized alpha
 * batching.
 */
const WebParticleWave = memo(function WebParticleWave({
  isDark,
  reducedMotion,
}: {
  isDark: boolean;
  reducedMotion: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rgb = isDark ? '125, 211, 252' : '43, 92, 196';
    const baseGain = isDark ? 0.36 : 0.40;
    const buckets: number[][] = Array.from({ length: BUCKET_COUNT }, () => []);

    let cssWidth = 0;
    let cssHeight = 0;
    let dpr = 1;
    let rafId: number | null = null;
    let startMs: number | null = null;
    let disposed = false;

    const syncSize = () => {
      const rect = canvas.getBoundingClientRect();
      const nextW = Math.max(1, Math.round(rect.width));
      const nextH = Math.max(1, Math.round(rect.height));
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      if (nextW !== cssWidth || nextH !== cssHeight || nextDpr !== dpr) {
        cssWidth = nextW;
        cssHeight = nextH;
        dpr = nextDpr;
        canvas.width = Math.round(cssWidth * dpr);
        canvas.height = Math.round(cssHeight * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };

    const drawFrame = (tSec: number) => {
      if (cssWidth <= 1 || cssHeight <= 1) return;
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      for (let b = 0; b < BUCKET_COUNT; b++) {
        buckets[b].length = 0;
      }

      const hillCenter = 0.06 + Math.sin(tSec * 0.38) * 0.22;
      const ampWave = Math.min(cssHeight * 0.056, 44);
      const ampHill = Math.min(cssHeight * 0.068, 54);

      for (let row = 0; row < WEB_ROWS; row++) {
        const v = row / (WEB_ROWS - 1);
        const topFade = Math.min(1, v / 0.22);
        const spanX = cssWidth * 0.54 * (0.84 + v * 0.34);

        for (let col = 0; col < WEB_COLS; col++) {
          const u = (col / (WEB_COLS - 1)) * 2 - 1;
          const sideFade = Math.max(0, 1 - Math.pow(Math.abs(u), 2.3));
          if (sideFade <= 0.01) continue;

          const w1 = Math.sin(u * 2.8 - tSec * 1.35 + v * 2.3);
          const w2 = Math.cos(u * 1.7 + tSec * 0.85 - v * 3.0) * 0.62;
          const w3 = Math.sin((u * 1.4 - v * 2.1) * 2.6 - tSec * 1.05) * 0.25;
          const h = (w1 + w2 + w3) / 1.87;

          const hill =
            Math.exp(-Math.pow((u - hillCenter) / 0.62, 2)) * (1 - v * 0.38);
          const swayX = Math.cos(u * 2.1 - tSec * 1.1 + v * 2.5) * 7;

          const x = cssWidth * 0.5 + u * spanX + swayX;
          const y = cssHeight * 0.59 + v * cssHeight * 0.44 - h * ampWave - hill * ampHill;
          if (x < -8 || x > cssWidth + 8 || y < cssHeight * 0.42 || y > cssHeight + 8) {
            continue;
          }

          const crest = 0.34 + 0.58 * hill + 0.32 * Math.max(0, h);
          const rawOpacity = Math.min(0.46, topFade * sideFade * crest * baseGain);
          if (rawOpacity < 0.04) continue;

          const radius = 0.72 + 0.52 * v + 0.42 * Math.max(0, h);
          const bucketIdx = Math.min(
            BUCKET_COUNT - 1,
            Math.floor((rawOpacity / 0.46) * BUCKET_COUNT),
          );
          buckets[bucketIdx].push(x, y, radius);
        }
      }

      for (let b = 0; b < BUCKET_COUNT; b++) {
        const coords = buckets[b];
        if (coords.length === 0) continue;
        const alpha = ((b + 0.5) / BUCKET_COUNT) * 0.46;
        ctx.fillStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        for (let i = 0; i < coords.length; i += 3) {
          const cx = coords[i];
          const cy = coords[i + 1];
          const cr = coords[i + 2];
          ctx.moveTo(cx + cr, cy);
          ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    };

    const tick = (nowMs: number) => {
      if (disposed || reducedMotion || document.hidden) {
        rafId = null;
        return;
      }
      if (startMs === null) startMs = nowMs;
      const tSec = ((nowMs - startMs) / 1000) * 0.58;
      drawFrame(tSec);
      rafId = window.requestAnimationFrame(tick);
    };

    const startLoop = () => {
      syncSize();
      if (reducedMotion) {
        drawFrame(0.8);
        return;
      }
      if (rafId === null && !document.hidden) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const stopLoop = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopLoop();
      } else {
        startMs = null;
        startLoop();
      }
    };

    const onResize = () => {
      syncSize();
      if (reducedMotion) drawFrame(0.8);
    };

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onResize);
      ro.observe(canvas);
    } else {
      window.addEventListener('resize', onResize);
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    startLoop();

    return () => {
      disposed = true;
      stopLoop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (ro) {
        ro.disconnect();
      } else {
        window.removeEventListener('resize', onResize);
      }
    };
  }, [isDark, reducedMotion]);

  return React.createElement('canvas' as unknown as React.ElementType, {
    ref: canvasRef,
    'aria-hidden': true,
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    },
  });
});

/**
 * Native fallback (iOS & Android): 12 depth-staggered animated SVG wave strips
 * propagating smoothly upward through the bottom particle field.
 */
const NativeWaveRows = memo(function NativeWaveRows({
  isDark,
  reducedMotion,
}: {
  isDark: boolean;
  reducedMotion: boolean;
}) {
  const rowPhases = useRef(
    NATIVE_WAVE_ROWS.map(() => new Animated.Value(0.5)),
  ).current;

  useEffect(() => {
    if (reducedMotion) {
      rowPhases.forEach((v) => v.setValue(0.5));
      return;
    }

    const loops = rowPhases.map((val, idx) => {
      val.setValue(0);
      return Animated.loop(
        Animated.sequence([
          Animated.delay(idx * 400),
          Animated.timing(val, {
            toValue: 1,
            duration: 3000,
            easing: WAVE_EASE,
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 3000,
            easing: WAVE_EASE,
            useNativeDriver: true,
          }),
        ]),
      );
    });

    loops.forEach((loop) => loop.start());
    return () => {
      loops.forEach((loop) => loop.stop());
    };
  }, [reducedMotion, rowPhases]);

  const dotColor = isDark ? '#7dd3fc' : '#2b5cc4';
  const dotScale = isDark ? 0.85 : 0.92;

  return (
    <>
      {NATIVE_WAVE_ROWS.map((rowDots, rowIdx) => {
        if (rowDots.length === 0) return null;
        const phase = rowPhases[rowIdx];
        const rowStyle = {
          opacity: phase.interpolate({
            inputRange: [0, 1],
            outputRange: [0.68, 1],
          }),
          transform: [
            {
              translateY: phase.interpolate({
                inputRange: [0, 1],
                outputRange: [-12, 12],
              }),
            },
            {
              translateX: phase.interpolate({
                inputRange: [0, 1],
                outputRange: [-6, 6],
              }),
            },
          ],
        };

        return (
          <Animated.View key={rowIdx} style={[styles.overscan, rowStyle]}>
            <Svg
              width="100%"
              height="100%"
              viewBox="0 0 400 800"
              preserveAspectRatio="xMidYMax slice"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {rowDots.map((dot, idx) => (
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
        );
      })}
    </>
  );
});

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
      useNativeDriver: true,
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
          useNativeDriver: true,
        }),
        Animated.timing(mistPhase, {
          toValue: 0,
          duration: 6500,
          easing: WAVE_EASE,
          useNativeDriver: true,
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

      {/* Atmospheric bloom + rolling wave particle field */}
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

        {Platform.OS === 'web' ? (
          <WebParticleWave isDark={isDark} reducedMotion={reducedMotion} />
        ) : (
          <NativeWaveRows isDark={isDark} reducedMotion={reducedMotion} />
        )}
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
