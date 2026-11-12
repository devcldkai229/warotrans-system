const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');

test('lightColors and darkColors have exact key parity and valid syncActiveColors mutation', () => {
  const load = createLoader();
  const { lightColors, darkColors, colors, syncActiveColors, LIGHT_HEX_TO_TOKEN } = load('src/shared/theme/colors.ts');
  const { lightShadows, darkShadows, shadows, syncActiveShadows } = load('src/shared/theme/shadows.ts');
  const { zoneColor } = load('src/shared/maps/mapPresentation.ts');

  assert.deepEqual(Object.keys(lightColors).sort(), Object.keys(darkColors).sort());
  assert.deepEqual(Object.keys(lightShadows).sort(), Object.keys(darkShadows).sort());

  // Default is light
  assert.equal(colors.background, lightColors.background);
  assert.equal(colors.surface, '#ffffff');
  assert.equal(zoneColor('JUNCTION'), lightColors.success);

  // Switch to dark
  syncActiveColors('dark');
  syncActiveShadows('dark');
  assert.equal(colors.background, darkColors.background);
  assert.equal(colors.surface, darkColors.surface);
  assert.equal(colors.textPrimary, darkColors.textPrimary);
  assert.equal(shadows.sm.shadowOpacity, darkShadows.sm.shadowOpacity);
  assert.equal(zoneColor('JUNCTION'), darkColors.success);

  // Switch back to light
  syncActiveColors('light');
  syncActiveShadows('light');
  assert.equal(colors.background, lightColors.background);
  assert.equal(colors.surface, '#ffffff');
  assert.equal(zoneColor('JUNCTION'), lightColors.success);

  // Verify LIGHT_HEX_TO_TOKEN maps to existing ThemeColors keys
  for (const token of Object.values(LIGHT_HEX_TO_TOKEN)) {
    assert.ok(token in lightColors, `Missing token ${token} in lightColors`);
    assert.ok(token in darkColors, `Missing token ${token} in darkColors`);
  }
});

test('resolveThemeScheme resolves system, light, and dark modes accurately', () => {
  const load = createLoader({
    react: {
      createContext: () => ({}),
      useContext: () => ({}),
      useState: (v) => [v, () => {}],
      useEffect: () => {},
      useMemo: (fn) => fn(),
      useCallback: (fn) => fn,
    },
    'react-native': {
      useColorScheme: () => 'light',
      Platform: { OS: 'ios' },
    },
    '../api/secureStore': {
      getStoredThemeMode: async () => null,
      saveStoredThemeMode: async () => {},
    },
  });
  const { resolveThemeScheme } = load('src/shared/theme/ThemeContext.tsx');

  assert.equal(resolveThemeScheme('light', 'dark'), 'light');
  assert.equal(resolveThemeScheme('dark', 'light'), 'dark');
  assert.equal(resolveThemeScheme('system', 'dark'), 'dark');
  assert.equal(resolveThemeScheme('system', 'light'), 'light');
  assert.equal(resolveThemeScheme('system', null), 'light');
  assert.equal(resolveThemeScheme('system', undefined), 'light');
});

test('saveStoredThemeMode and getStoredThemeMode persist and validate theme preferences', async () => {
  const memoryStore = new Map();
  const load = createLoader({
    'react-native': { Platform: { OS: 'ios' } },
    'expo-secure-store': {
      getItemAsync: async (key) => memoryStore.get(key) ?? null,
      setItemAsync: async (key, val) => { memoryStore.set(key, val); },
      deleteItemAsync: async (key) => { memoryStore.delete(key); },
    },
  });
  const { getStoredThemeMode, saveStoredThemeMode, THEME_MODE_KEY } = load('src/shared/api/secureStore.ts');

  assert.equal(await getStoredThemeMode(), null);

  await saveStoredThemeMode('dark');
  assert.equal(await getStoredThemeMode(), 'dark');

  await saveStoredThemeMode('light');
  assert.equal(await getStoredThemeMode(), 'light');

  await saveStoredThemeMode('system');
  assert.equal(await getStoredThemeMode(), 'system');

  memoryStore.set(THEME_MODE_KEY, 'invalid-mode');
  assert.equal(await getStoredThemeMode(), null);
});
