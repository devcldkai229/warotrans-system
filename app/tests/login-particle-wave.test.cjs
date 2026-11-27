const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');

const {
  buildParticlePaths,
  createParticleBuckets,
  PARTICLE_PATH_SCALE,
  PARTICLE_WAVE_STILL_TIME,
  particleWaveTime,
  updateParticleBuckets,
} = createLoader()('src/features/auth/particleWave.ts');

test('native SVG paths reproduce the canvas particles at the same size and time', () => {
  const circle = /M(-?\d+) (-?\d+)a(\d+) \3 0 1 0 -(\d+) 0 \3 \3 0 1 0 \4 0z/g;
  for (const [width, height] of [[390, 844], [844, 390]]) {
    for (const isDark of [true, false]) {
      const buckets = createParticleBuckets();
      for (const time of [PARTICLE_WAVE_STILL_TIME, particleWaveTime(4200)]) {
        updateParticleBuckets(buckets, width, height, time, isDark);
        const paths = buildParticlePaths(width, height, time, isDark);
        assert.ok(paths.some(Boolean));

        paths.forEach((path, index) => {
          const matches = [...path.matchAll(circle)];
          const coords = buckets[index];
          assert.equal(matches.map(match => match[0]).join(''), path);
          assert.equal(matches.length * 3, coords.length);
          matches.forEach(([, start, centerY, radius, diameter], dot) => {
            const offset = dot * 3;
            const x = Math.round(coords[offset] * PARTICLE_PATH_SCALE);
            const y = Math.round(coords[offset + 1] * PARTICLE_PATH_SCALE);
            const r = Math.round(coords[offset + 2] * PARTICLE_PATH_SCALE);
            assert.deepEqual([Number(start), Number(centerY), Number(radius), Number(diameter)], [x + r, y, r, r * 2]);
          });
        });
      }

      assert.notDeepEqual(
        buildParticlePaths(width, height, PARTICLE_WAVE_STILL_TIME, isDark),
        buildParticlePaths(width, height, particleWaveTime(4200), isDark),
      );
    }
  }
});

test('login particle waves always animate on mobile and respect reduced motion on web', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const reactNativeWeb = require('react-native-web');

  for (const platform of ['ios', 'android', 'web']) {
    for (const systemReducedMotion of [true, false]) {
      const load = createLoader({
        react: { ...React, useState: () => [systemReducedMotion, () => {}] },
        'react-native': { ...reactNativeWeb, Platform: { OS: platform } },
        'react-native-svg': {
          __esModule: true,
          default: 'svg',
          Defs: 'defs',
          LinearGradient: 'linearGradient',
          RadialGradient: 'radialGradient',
          Rect: 'rect',
          Stop: 'stop',
        },
        './LoginParticleWave': {
          LoginParticleWave: ({ reducedMotion }) => React.createElement('canvas', {
            'data-reduced-motion': reducedMotion,
          }),
        },
      });
      const { LoginBackdrop } = load('src/features/auth/LoginBackdrop.tsx');
      const markup = renderToStaticMarkup(React.createElement(LoginBackdrop, { isDark: false }));
      const expected = platform === 'web' && systemReducedMotion;
      assert.ok(markup.includes(`data-reduced-motion="${expected}"`), `${platform}, system reduced motion ${systemReducedMotion}`);
    }
  }
});
