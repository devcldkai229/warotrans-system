const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const createLoader = require('./load-module.cjs');

test('the web login backdrop hides all decorative layers through its wrapper', () => {
  const load = createLoader({
    'react-native': require('react-native-web'),
    'react-native-svg': {
      __esModule: true,
      default: 'svg',
      Circle: 'circle',
      Defs: 'defs',
      LinearGradient: 'linearGradient',
      RadialGradient: 'radialGradient',
      Rect: 'rect',
      Stop: 'stop',
    },
  });
  const { LoginBackdrop } = load('src/features/auth/LoginBackdrop.tsx');
  const markup = renderToStaticMarkup(React.createElement(LoginBackdrop, { isDark: false }));

  assert.match(markup, /^<div\b[^>]*\baria-hidden="true"/);
  assert.equal((markup.match(/<svg\b/g) ?? []).length, 2);
  assert.match(markup, /<canvas\b/);
  assert.doesNotMatch(markup, /accessibilityElementsHidden|importantForAccessibility/i);
});
