const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');

function clientFor(fetch, overrides = {}) {
  let refreshToken = 'refresh-token';
  let cleared = 0;
  const saved = [];
  const load = createLoader({
    'expo-constants': { default: {} },
    'react-native': { Platform: { OS: 'web' } },
    'src/shared/api/secureStore.ts': {
      getStoredRefreshToken: async () => refreshToken,
      saveStoredAccessToken: async value => { saved.push(value); },
      saveStoredRefreshToken: async value => { refreshToken = value; },
      clearAllStoredAuth: async () => { refreshToken = null; cleared++; },
    }, ...overrides,
  }, { fetch });
  return { client: load('src/shared/api/client.ts'), saved, authState: () => ({ refreshToken, cleared }) };
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

test('network failures have actionable messages and do not expire a signed-in session', async () => {
  const { client, authState } = clientFor(async () => { throw new TypeError('Failed to fetch'); });
  client.setAccessToken('valid');
  let expired = 0;
  client.onSessionExpired(() => expired++);
  await assert.rejects(() => client.apiFetch('/api/jobs'), error => error.status === 0
    && error.code === 'NETWORK_ERROR' && /Cannot reach the server/.test(error.message) && !/fetch/.test(error.message));
  await assert.rejects(() => client.apiFetch('/api/jobs', { method: 'POST', body: '{}' }), error => /check the latest status/.test(error.message));
  await assert.rejects(() => client.apiFetch('/api/identity/login', { method: 'POST', body: '{}' }), error => /Cannot reach the server/.test(error.message));
  assert.equal(client.getAccessToken(), 'valid');
  assert.equal(expired, 0);
  assert.equal(authState().cleared, 0);
});

test('cancelled requests retain their cancellation instead of showing a network failure', async () => {
  const cancelled = Object.assign(new Error('Request cancelled'), { name: 'AbortError' });
  const { client } = clientFor(async () => { throw cancelled; });
  await assert.rejects(() => client.apiFetch('/api/jobs'), error => error === cancelled);
});

for (const failure of ['network', '503', 'invalid-json']) {
  test(`a refresh ${failure} failure stays retryable without clearing credentials or disguising it as 401`, async () => {
    const { client, authState } = clientFor(async url => {
      if (!url.endsWith('/refresh')) return new Response(null, { status: 401 });
      if (failure === 'network') throw new TypeError('Failed to fetch');
      return failure === '503' ? Response.json({ detail: 'NpgsqlException internal connection details' }, { status: 503 })
        : new Response('<html>gateway</html>', { status: 200 });
    });
    client.setAccessToken('old');
    let expired = 0;
    client.onSessionExpired(() => expired++);
    await assert.rejects(() => client.apiFetch('/api/private'), error => error.status === (failure === 'network' ? 0 : failure === '503' ? 503 : 502)
      && !/fetch|Npgsql|html|Unexpected token/.test(error.message));
    assert.equal(client.getAccessToken(), 'old');
    assert.equal(expired, 0);
    assert.equal(authState().cleared, 0);
  });
}

test('HTTP errors and unreadable successful responses do not expose implementation details', async () => {
  const response = value => clientFor(async () => value).client;
  await assert.rejects(() => response(Response.json({ detail: 'StackTrace SQL credentials', errors: ['secret'] }, { status: 500 })).apiFetch('/api/jobs'),
    error => error.status === 500 && error.code === 'SERVER_ERROR' && !/SQL|secret|StackTrace/.test(error.message));
  await assert.rejects(() => response(new Response('<html>Error</html>', { status: 200 })).apiFetch('/api/jobs'),
    error => error.code === 'INVALID_RESPONSE' && /Refresh/.test(error.message));
  await assert.rejects(() => response(new Response(null, { status: 403 })).apiFetch('/api/admin'),
    error => /permission/.test(error.message));
  await assert.rejects(() => response(Response.json({ title: 'Not Found' }, { status: 404 })).apiFetch('/api/job'),
    error => /no longer available/.test(error.message));
  const { client } = clientFor(async () => new Response(null, { status: 204 }));
  assert.equal(await client.apiFetch('/api/action'), null);
});

test('known business validation stays specific; unknown UI errors use the supplied fallback', async () => {
  const { client } = clientFor(async () => Response.json({ detail: 'Container is already requested', code: 'container_already_requested' }, { status: 409 }));
  await assert.rejects(() => client.apiFetch('/api/submit'), error => error.message === 'Container is already requested' && error.code === 'container_already_requested');
  assert.equal(client.getUserErrorMessage(new TypeError('Cannot read property warehouseId'), 'Could not load the warehouse.'), 'Could not load the warehouse.');
});

function bootstrapFor(fetch) {
  const stored = { token: 'saved-token', refreshToken: 'saved-refresh', session: { id: 'staff', username: 'staff', fullName: 'Old Name', role: 'STAFF', zone: 'Inbound', avatarInitials: 'ON' } };
  let cleared = 0;
  const load = createLoader({
    'expo-constants': { default: {} }, 'react-native': { Platform: { OS: 'web' } },
    'src/shared/api/secureStore.ts': {
      getStoredAccessToken: async () => stored.token,
      getStoredUserSession: async () => stored.session,
      getStoredRefreshToken: async () => stored.refreshToken,
      saveStoredAccessToken: async token => { stored.token = token; },
      saveStoredRefreshToken: async token => { stored.refreshToken = token; },
      clearAllStoredAuth: async () => { cleared++; stored.token = null; stored.refreshToken = null; stored.session = null; },
    },
  }, { fetch });
  return { client: load('src/shared/api/client.ts'), restore: load('src/features/auth/restoreSession.ts').restoreSession, stored, cleared: () => cleared };
}
const account = { id: 'staff', username: 'staff', fullName: 'Current Name', role: 'STAFF', status: 'ACTIVE' };

test('cold start during an outage keeps credentials behind a recovery gate; Retry verifies the current profile', async () => {
  let online = false;
  const state = bootstrapFor(async () => {
    if (!online) throw new TypeError('Failed to fetch');
    return Response.json(account);
  });
  const first = await state.restore();
  assert.equal(first.kind, 'unavailable');
  assert.equal('session' in first, false);
  assert.equal(state.stored.token, 'saved-token');
  assert.equal(state.stored.refreshToken, 'saved-refresh');
  assert.equal(state.cleared(), 0);
  online = true;
  const next = await state.restore();
  assert.equal(next.kind, 'ready');
  assert.equal(next.session.fullName, 'Current Name');
  assert.equal(next.session.zone, 'Inbound');
});

test('cold start with an unavailable refresh never turns an outage into logout', async () => {
  const state = bootstrapFor(async url => url.endsWith('/refresh')
    ? new Response(null, { status: 503 }) : new Response(null, { status: 401 }));
  assert.equal((await state.restore()).kind, 'unavailable');
  assert.equal(state.stored.token, 'saved-token');
  assert.equal(state.cleared(), 0);
});

test('server failure or an incomplete profile during bootstrap keeps credentials for Retry', async () => {
  for (const response of [new Response(null, { status: 503 }), Response.json({ ...account, status: undefined })]) {
    const state = bootstrapFor(async () => response);
    assert.equal((await state.restore()).kind, 'unavailable');
    assert.equal(state.stored.token, 'saved-token');
    assert.equal(state.cleared(), 0);
  }
});

test('invalid saved credentials and inactive accounts end the session rather than opening commands', async () => {
  const invalid = bootstrapFor(async () => new Response(null, { status: 401 }));
  assert.equal((await invalid.restore()).kind, 'signed-out');
  assert.equal(invalid.stored.token, null);
  const inactive = bootstrapFor(async () => Response.json({ ...account, status: 'DISABLED' }));
  assert.equal((await inactive.restore()).kind, 'signed-out');
  assert.equal(inactive.stored.token, null);
});

test('leaving recovery while a profile check is pending cannot restore the previous session', async () => {
  let resolveProfile, started;
  const ready = new Promise(resolve => { started = resolve; });
  const state = bootstrapFor(async () => { started(); return new Promise(resolve => { resolveProfile = resolve; }); });
  let current = true;
  const request = state.restore(() => current);
  await ready;
  current = false;
  state.client.setAccessToken(null);
  resolveProfile(Response.json(account));
  assert.equal((await request).kind, 'cancelled');
  assert.equal(state.client.getAccessToken(), null);
});
