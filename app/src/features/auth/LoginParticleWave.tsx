import React, { memo, useEffect, useState } from 'react';
import { AppState, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedProps, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import {
  buildParticlePaths,
  PARTICLE_OPACITIES,
  PARTICLE_PATH_SCALE,
  PARTICLE_WAVE_STILL_TIME,
  PARTICLE_WAVE_TOP,
  particleWaveColor,
  particleWaveTime,
  type ParticleWaveProps,
} from './particleWave';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const FRAME_INTERVAL_MS = 1000 / 30;

const ParticlePath = memo(function ParticlePath({
  paths,
  index,
  color,
}: {
  paths: SharedValue<string[]>;
  index: number;
  color: string;
}) {
  const animatedProps = useAnimatedProps(() => ({ d: paths.value[index] ?? '' }));
  return <AnimatedPath animatedProps={animatedProps} fill={color} fillOpacity={PARTICLE_OPACITIES[index]} />;
});

export const LoginParticleWave = memo(function LoginParticleWave({ isDark, reducedMotion }: ParticleWaveProps) {
  const [{ width, height }, setSize] = useState({ width: 0, height: 0 });
  const paths = useSharedValue<string[]>([]);
  const lastFrame = useSharedValue(-1);
  const frame = useFrameCallback(({ timeSinceFirstFrame, timeSincePreviousFrame }) => {
    // Limit SVG redraws on high-refresh displays while keeping wave speed tied to elapsed time.
    const frameIndex = Math.floor((timeSinceFirstFrame + 1) / FRAME_INTERVAL_MS);
    if (timeSincePreviousFrame !== null && lastFrame.value === frameIndex) return;
    lastFrame.value = frameIndex;
    paths.value = buildParticlePaths(width, height, particleWaveTime(timeSinceFirstFrame), isDark);
  }, false);

  useEffect(() => {
    if (width <= 1 || height <= 1) return;
    paths.value = buildParticlePaths(width, height, reducedMotion ? PARTICLE_WAVE_STILL_TIME : 0, isDark);
    if (reducedMotion) return;

    const updateActive = (state: typeof AppState.currentState) => {
      frame.setActive(state !== 'background' && state !== 'inactive');
    };
    const subscription = AppState.addEventListener('change', updateActive);
    updateActive(AppState.currentState);
    return () => {
      subscription.remove();
      frame.setActive(false);
    };
  }, [frame, height, isDark, paths, reducedMotion, width]);

  const onLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    const nextWidth = Math.round(layout.width);
    const nextHeight = Math.round(layout.height);
    setSize(current => current.width === nextWidth && current.height === nextHeight
      ? current
      : { width: nextWidth, height: nextHeight });
  };

  const top = height * PARTICLE_WAVE_TOP;
  const waveHeight = height - top;
  const color = particleWaveColor(isDark);

  return (
    <View onLayout={onLayout} style={StyleSheet.absoluteFill}>
      {width > 1 && height > 1 ? (
        <Svg
          width="100%"
          height={waveHeight}
          viewBox={`0 ${top * PARTICLE_PATH_SCALE} ${width * PARTICLE_PATH_SCALE} ${waveHeight * PARTICLE_PATH_SCALE}`}
          preserveAspectRatio="none"
          style={styles.wave}
        >
          {PARTICLE_OPACITIES.map((_, index) => (
            <ParticlePath key={index} index={index} color={color} paths={paths} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wave: {
    position: 'absolute',
    bottom: 0,
    left: 0,
  },
});
