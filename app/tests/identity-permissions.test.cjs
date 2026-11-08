const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');

const load = createLoader({
  'expo-constants': { default: {} },
  'react-native': { Platform: { OS: 'web' } },
  'src/shared/api/secureStore.ts': {
    getStoredRefreshToken: async () => null,
    saveStoredAccessToken: async () => {},
    saveStoredRefreshToken: async () => {},
    clearAllStoredAuth: async () => {},
  },
}, { atob: globalThis.atob });
const { passwordProblem } = load('src/features/auth/passwordPolicy.ts');
const { sessionCan, PERMISSIONS } = load('src/shared/auth/permissions.ts');
const { resolveMapPreviewUri } = load('src/shared/utils/mapCoordinates.ts');
const { tokenSecondsLeft } = load('src/shared/api/client.ts');

test('the new password follows the backend policy', () => {
  assert.equal(passwordProblem('Brand-New-Pass-42', 'Brand-New-Pass-42', 'sam'), null);
  assert.match(passwordProblem('short1', 'short1', 'sam'), /at least 10/);
  assert.match(passwordProblem('onlyletterslong', 'onlyletterslong', 'sam'), /letter and one digit/);
  assert.match(passwordProblem('i-am-sam-12345', 'i-am-sam-12345', 'sam'), /username/);
  assert.match(passwordProblem('Brand-New-Pass-42', 'Brand-New-Pass-43', 'sam'), /do not match/);
});

test('screens are gated by server permissions, never by the role name', () => {
  const staff = { role: 'STAFF', permissions: [PERMISSIONS.robotStop, PERMISSIONS.transportCreate] };
  assert.equal(sessionCan(staff, PERMISSIONS.robotStop), true);
  assert.equal(sessionCan(staff, PERMISSIONS.robotManualDrive), false);
  assert.equal(sessionCan({ role: 'ADMIN' }, PERMISSIONS.robotStop), false);
  assert.equal(sessionCan(null, PERMISSIONS.robotRead), false);
});

test('backend map files carry the access token, absolute URLs are left alone', () => {
  assert.equal(
    resolveMapPreviewUri('/map-assets/w/m/map-preview.png', 'http://api:5090/', 'tok en'),
    'http://api:5090/map-assets/w/m/map-preview.png?access_token=tok%20en',
  );
  assert.equal(resolveMapPreviewUri('/map-assets/a.png', 'http://api', null), 'http://api/map-assets/a.png');
  assert.equal(resolveMapPreviewUri('https://cdn/x.png', 'http://api', 'tok'), 'https://cdn/x.png');
  assert.equal(resolveMapPreviewUri('pending://map-preview.png', 'http://api', 'tok'), null);
});

test('token lifetime is read from the exp claim', () => {
  const body = Buffer.from(JSON.stringify({ exp: 1_000 })).toString('base64url');
  assert.equal(tokenSecondsLeft(`h.${body}.s`, 900_000), 100);
  assert.equal(tokenSecondsLeft('not-a-jwt'), null);
  assert.equal(tokenSecondsLeft(null), null);
});
