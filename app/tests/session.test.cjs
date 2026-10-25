const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');

function clientFor(fetch, overrides = {}) {
  let refreshToken = 'refresh-token';
  const saved = [];
  const load = createLoader({
    'expo-constants': { default: {} },
    'react-native': { Platform: { OS: 'web' } },
    'src/shared/api/secureStore.ts': {
      getStoredRefreshToken: async () => refreshToken,
      saveStoredAccessToken: async value => { saved.push(value); },
      saveStoredRefreshToken: async value => { refreshToken = value; },
      clearAllStoredAuth: async () => { refreshToken = null; },
    }, ...overrides,
  }, { fetch });
  return { client: load('src/shared/api/client.ts'), saved };
}
test('concurrent 401 responses share one refresh and retry with the rotated token', async () => {
  let refreshes = 0;
  const { client } = clientFor(async (url, init) => {
    if (url.endsWith('/refresh')) { refreshes++; return Response.json({ accessToken: 'new', refreshToken: 'rotated' }); }
    return init.headers.get('Authorization') === 'Bearer new' ? Response.json({ ok: true }) : new Response(null, { status: 401 });
  });
  client.setAccessToken('old');
  const results = await Promise.all([client.apiFetch('/api/one'), client.apiFetch('/api/two')]);
  assert.equal(results.every(value => value.ok), true);
  assert.equal(refreshes, 1);
  assert.equal(client.getAccessToken(), 'new');
});
test('a rejected refresh ends the UI session; a 403 business response does not', async () => {
  const { client } = clientFor(async () => new Response(null, { status: 401 }));
  let expired = 0;
  client.onSessionExpired(() => expired++);
  client.setAccessToken('old');
  await assert.rejects(() => client.apiFetch('/api/private'), error => error.status === 401);
  assert.equal(expired, 1);
  assert.equal(client.getAccessToken(), null);
  const other = clientFor(async () => new Response(null, { status: 403 })).client;
  other.setAccessToken('valid');
  await assert.rejects(() => other.apiFetch('/api/admin'), error => error.status === 403);
  assert.equal(other.getAccessToken(), 'valid');
});
test('logout while a refresh is pending cannot resurrect the previous session', async () => {
  let resolveRefresh;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const { client, saved } = clientFor(async url => {
    if (url.endsWith('/refresh')) { started(); return new Promise(resolve => { resolveRefresh = resolve; }); }
    return new Response(null, { status: 401 });
  });
  client.setAccessToken('old');
  const request = client.apiFetch('/api/private');
  await ready;
  client.setAccessToken(null);
  resolveRefresh(Response.json({ accessToken: 'late', refreshToken: 'late-refresh' }));
  await assert.rejects(() => request);
  assert.equal(client.getAccessToken(), null);
  assert.deepEqual(saved, []);
});
test('validation errors from the BE dictionary are readable by forms', async () => {
  const { client } = clientFor(async () => Response.json({ title: 'Validation failed', errors: { containerId: ['Container is required'] } }, { status: 400 }));
  await assert.rejects(() => client.apiFetch('/api/submit'), error => error.message === 'Container is required' && error.errors[0].property === 'containerId');
});
