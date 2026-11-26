const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');

test('native waves animate the original rows and stop when reduced motion is enabled', () => {
  const loops = [];
  let phases;
  let cleanup;
  const load = createLoader({
    react: {
      ...require('react'),
      memo: component => component,
      useState: initialize => [phases ??= initialize()],
      useEffect: effect => {
        cleanup?.();
        cleanup = effect();
      },
    },
    'react-native': {
      Animated: {
        View: 'animated-view',
        Value: class {
          constructor(value) { this.value = value; }
          setValue(value) { this.value = value; }
          interpolate(config) { return config; }
        },
        delay: duration => ({ duration }),
        timing: (_phase, config) => config,
        sequence: steps => steps,
        loop: steps => {
          const loop = {
            steps,
            start() { this.started = true; },
            stop() { this.stopped = true; },
          };
          loops.push(loop);
          return loop;
        },
      },
      Easing: { inOut: easing => easing },
      StyleSheet: { create: styles => styles },
    },
    'react-native-svg': { __esModule: true, default: 'svg', Circle: 'circle' },
  });
  const { LoginParticleWave } = load('src/features/auth/LoginParticleWave.tsx');
  const render = reducedMotion => LoginParticleWave({ isDark: false, reducedMotion });
  const rows = render(false).props.children.filter(Boolean);
  assert.equal(rows.reduce((total, row) => total + row.props.children.props.children.length, 0), 234);
  assert.ok(loops.length >= rows.length);
  assert.ok(loops.every(loop => loop.started && loop.steps.slice(1).every(step => step.useNativeDriver)));

  render(true);
  assert.ok(loops.every(loop => loop.stopped));
  assert.ok(phases.every(phase => phase.value === 0.5));
});
