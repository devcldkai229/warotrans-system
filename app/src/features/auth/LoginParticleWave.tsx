import React, { memo, useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { particleWaveColor, type ParticleWaveProps } from './particleWave';

interface ParticleDot {
  x: number;
  y: number;
  r: number;
  o: number;
}

const WAVE_EASE = Easing.inOut(Easing.sin);
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

export const LoginParticleWave = memo(function LoginParticleWave({
  isDark,
  reducedMotion,
}: ParticleWaveProps) {
  const [rowPhases] = useState(() =>
    NATIVE_WAVE_ROWS.map(() => new Animated.Value(0.5)),
  );

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

  const dotColor = particleWaveColor(isDark);
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

const styles = StyleSheet.create({
  overscan: {
    position: 'absolute',
    top: -16,
    bottom: -24,
    left: -24,
    right: -24,
  },
});
