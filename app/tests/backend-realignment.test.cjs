const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(options = {}) {
  const stored = { access: 'old-token', refresh: 'refresh-token', session: { id: 'account', zone: 'Local Preference' } };
  const storage = {
    getStoredAccessToken: async () => stored.access,
    getStoredRefreshToken: async () => stored.refresh,
    getStoredUserSession: async () => stored.session,
    saveStoredAccessToken: async token => { stored.access = token; },
    saveStoredRefreshToken: async token => { stored.refresh = token; },
    saveStoredUserSession: async session => { stored.session = session; },
    clearAllStoredAuth: async () => { stored.access = null; stored.refresh = null; stored.session = null; },
    ...options.storage,
  };
  const cache = new Map();
  const requests = [];
  const context = { fetch: options.fetch ?? (async () => json({ items: [], total: 0 })) };
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const localRequire = name => {
      if (name === './secureStore' || name.endsWith('/api/secureStore')) return storage;
      if (name === 'expo-constants') return { default: {}, __esModule: true };
      if (name === 'react-native') return { Platform: { OS: 'web' } };
      if (options.modules?.[name]) return options.modules[name];
      if (name.startsWith('.')) {
        const file = path.resolve(path.dirname(filename), name);
        return load(fs.existsSync(`${file}.ts`) ? `${file}.ts` : `${file}.tsx`);
      }
      return require(name);
    };
    const fetch = async (url, init = {}) => {
      requests.push({ url, path: new URL(url).pathname, query: new URL(url).searchParams, ...init });
      return context.fetch(url, init);
    };
    new Function('require', 'module', 'exports', 'fetch', 'process', '__DEV__', 'setTimeout', 'clearTimeout', compiled)(
      localRequire, module, module.exports, fetch, { env: {} }, false, options.setTimeout ?? setTimeout, options.clearTimeout ?? clearTimeout,
    );
    return module.exports;
  }
  return { load, stored, storage, requests, context, client: load('src/shared/api/client.ts') };
}

test('both backend validation arrays and ASP.NET dictionaries retain property, code and messages', async () => {
  const { client } = harness();
  const array = await client.parseApiError(json({ errors: [{ path: 'details[0].containerId', message: 'Required' }, { property: 'robotId', code: 'busy', message: 'Robot busy' }] }, 400));
  assert.deepEqual(array.errors, [{ property: 'details[0].containerId', code: '', message: 'Required' }, { property: 'robotId', code: 'busy', message: 'Robot busy' }]);
  assert.match(array.message, /Required/); assert.match(array.message, /Robot busy/);
  const dictionary = await client.parseApiError(json({ title: 'Validation failed', errors: { field: ['First', 'Second'] } }, 400));
  assert.equal(dictionary.status, 400); assert.equal(dictionary.errors.length, 2); assert.match(dictionary.message, /field: First\nfield: Second/);
});

test('empty server envelopes survive every operational list API', async () => {
  const app = harness();
  const warehouse = app.load('src/shared/api/warehouseApi.ts');
  const reads = [warehouse.listWarehouses(), warehouse.listContainers({ warehouseId: 'warehouse' }), warehouse.listStorageLocations({ warehouseId: 'warehouse' }),
    app.load('src/shared/api/transportApi.ts').listTransportRequests(), app.load('src/shared/api/executionApi.ts').listJobs(),
    app.load('src/shared/api/fleetApi.ts').listRobots(), app.load('src/shared/api/workflowApi.ts').listPublishedWorkflows()];
  for (const result of await Promise.all(reads)) assert.deepEqual(result, { items: [], total: 0 });
});

test('mutations propagate HTTP conflicts and network failures without local receipts', async () => {
  const app = harness({ fetch: async () => json({ code: 'conflict', detail: 'Actual server conflict' }, 409) });
  const transport = app.load('src/shared/api/transportApi.ts');
  const execution = app.load('src/shared/api/executionApi.ts');
  const mutations = [() => transport.createTransportRequest({ details: [] }), () => transport.queueTransportRequest('request'),
    () => execution.startJob('job', 'robot'), () => execution.confirmJobStep('step', 'container'),
    () => app.load('src/shared/api/warehouseApi.ts').createContainer({ productId: 'product' }),
    () => app.load('src/shared/api/fleetApi.ts').cancelRobotCommand('robot', 'command')];
  for (const mutation of mutations) await assert.rejects(mutation, error => error instanceof app.client.ApiError && error.status === 409 && error.message === 'Actual server conflict');
  app.context.fetch = async () => { throw new Error('Connection refused'); };
  for (const mutation of mutations) await assert.rejects(mutation, error => error instanceof app.client.ApiError && error.status === 0 && error.code === 'NETWORK_ERROR');
});

test('refresh failure clears tokens and stored session and notifies auth listeners', async () => {
  const app = harness({ fetch: async () => json({ detail: 'Unauthorized' }, 401) });
  const tokens = []; app.client.setAccessToken('expired'); app.client.onAccessTokenChange(token => tokens.push(token));
  await assert.rejects(() => app.client.apiFetch('/api/identity/me'), error => error.status === 401);
  assert.equal(app.client.getAccessToken(), null); assert.deepEqual(app.stored, { access: null, refresh: null, session: null });
  assert.deepEqual(tokens, [null]);
});

test('concurrent 401s share a refresh and retry with the rotated token', async () => {
  let refreshes = 0;
  const app = harness({ fetch: async (url, init) => {
    if (url.endsWith('/refresh')) { refreshes++; await tick(); return json({ accessToken: 'fresh', refreshToken: 'rotated' }); }
    return init.headers.get('Authorization') === 'Bearer fresh' ? json({ ok: true }) : json({}, 401);
  } });
  app.client.setAccessToken('expired');
  const results = await Promise.all([app.client.apiFetch('/api/one'), app.client.apiFetch('/api/two')]);
  assert.equal(refreshes, 1); assert.ok(results.every(result => result.ok));
  assert.equal(app.stored.access, 'fresh'); assert.equal(app.stored.refresh, 'rotated');
});

test('logout while refresh is in flight cannot restore tokens or stored session', async () => {
  const gate = deferred(); const refreshing = deferred();
  const app = harness({ fetch: async url => { if (url.endsWith('/refresh')) { refreshing.resolve(); return gate.promise; } return json({}, 401); } });
  app.client.setAccessToken('expired');
  const pending = app.client.apiFetch('/api/identity/me');
  await refreshing.promise;
  await app.client.invalidateAuthSession();
  gate.resolve(json({ accessToken: 'too-late', refreshToken: 'too-late' }));
  await assert.rejects(() => pending);
  assert.equal(app.client.getAccessToken(), null); assert.deepEqual(app.stored, { access: null, refresh: null, session: null });
});

test('logout during native token persistence runs the final storage wipe after the stale write', async () => {
  const saving = deferred(); const gate = deferred();
  const app = harness({ fetch: async url => url.endsWith('/refresh') ? json({ accessToken: 'fresh', refreshToken: 'rotated' }) : json({}, 401),
    storage: { saveStoredAccessToken: async token => { saving.resolve(); await gate.promise; app.stored.access = token; } } });
  app.client.setAccessToken('expired');
  const pending = app.client.apiFetch('/api/identity/me');
  await saving.promise;
  const logout = app.client.invalidateAuthSession(); gate.resolve();
  await logout; await assert.rejects(() => pending);
  assert.equal(app.client.getAccessToken(), null); assert.deepEqual(app.stored, { access: null, refresh: null, session: null });
});

test('an old failed refresh does not clear a newer login session', async () => {
  const gate = deferred(); const refreshing = deferred();
  const app = harness({ fetch: async url => { if (url.endsWith('/refresh')) { refreshing.resolve(); return gate.promise; } return json({}, 401); } });
  app.client.setAccessToken('old'); const pending = app.client.apiFetch('/api/one'); await refreshing.promise;
  await app.client.invalidateAuthSession();
  const generation = app.client.beginAuthSession(); await app.client.persistAuthSession('new', 'new-refresh', generation, { id: 'new-user' });
  gate.resolve(json({}, 401)); await assert.rejects(() => pending);
  assert.equal(app.client.getAccessToken(), 'new'); assert.equal(app.stored.access, 'new'); assert.equal(app.stored.session.id, 'new-user');
});

test('handover resolves barcode to the real container UUID and preserves server rejection', async () => {
  const app = harness({ fetch: async url => url.includes('/by-barcode/') ? json({ id: 'container-uuid', barcode: 'printed/barcode' }) : json({ detail: 'Step is no longer waiting' }, 409) });
  const container = await app.load('src/shared/api/warehouseApi.ts').getContainerByBarcode('printed/barcode');
  assert.match(app.requests[0].url, /printed%2Fbarcode$/);
  await assert.rejects(() => app.load('src/shared/api/executionApi.ts').confirmJobStep('step-uuid', container.id, 'Actual note'), /Step is no longer waiting/);
  assert.equal(app.requests[1].path, '/api/workflow-execution/job-steps/step-uuid/confirm');
  assert.deepEqual(JSON.parse(app.requests[1].body), { containerId: 'container-uuid', note: 'Actual note' });
});

test('fleet uses supported filters and cancel body and treats accepted as a request', async () => {
  const app = harness({ fetch: async () => json({ commandId: 'cancel-command', targetCommandId: 'active-command', status: 'PENDING' }, 202) });
  const fleet = app.load('src/shared/api/fleetApi.ts');
  await fleet.listRobots({ warehouseId: 'w', isEnabled: true });
  assert.equal(app.requests[0].query.has('isOnline'), false);
  const receipt = await fleet.cancelRobotCommand('robot', 'active-command');
  assert.equal(receipt.status, 'PENDING'); assert.deepEqual(JSON.parse(app.requests[1].body), { targetCommandId: 'active-command' });
  await fleet.enableRobot('robot'); await fleet.disableRobot('robot');
  await fleet.navigateRobot('robot', { x: 1, y: 2, yaw: 0.5 }); await fleet.teleopRobot('robot', { linear: 0, angular: 0, assist: true });
  assert.deepEqual(app.requests.slice(2).map(r => r.path), ['/api/fleet/robots/robot/enable', '/api/fleet/robots/robot/disable', '/api/fleet/robots/robot/commands/navigate', '/api/fleet/robots/robot/teleop']);
});

test('receiving uses the real three endpoint contracts and does not suppress unmapped routes', async () => {
  const app = harness(); const api = app.load('src/shared/api/warehouseApi.ts');
  await api.resolveProduct({ barcode: 'supplier', query: 'sku', limit: 8 }); await api.getProductInventoryContext('product-id');
  await api.createContainer({ productId: 'product-id', supplierPackageBarcode: 'package', initialStorageLocationId: 'location-id', initialLevelNo: 2 });
  assert.equal(app.requests[0].path, '/api/warehouse/products/resolve'); assert.equal(app.requests[0].query.get('limit'), '8');
  assert.equal(app.requests[1].path, '/api/warehouse/products/product-id/inventory-context');
  assert.deepEqual(JSON.parse(app.requests[2].body), { productId: 'product-id', supplierPackageBarcode: 'package', initialStorageLocationId: 'location-id', initialLevelNo: 2 });
  app.context.fetch = async () => json({ title: 'Not Found' }, 404);
  await assert.rejects(() => api.createContainer({ productId: 'product-id' }), error => error.status === 404);
});

test('transport Create -> Queue -> Start is ordered and retries use saved receipts', async () => {
  let startFails = true;
  const app = harness({ fetch: async url => {
    if (url.endsWith('/start')) return startFails ? json({ detail: 'Robot busy' }, 409) : json({ id: 'job-id', status: 'RUNNING' });
    if (url.endsWith('/queue')) return json({ transportRequestId: 'request-id', jobs: [{ jobId: 'job-id', jobNo: 'JOB-REAL' }, { jobId: 'job-2', jobNo: 'JOB-SECOND' }] });
    return json({ id: 'request-id', requestCode: 'TR-REAL', status: 'SUBMITTED' });
  } });
  const { executeTransportLifecycle } = app.load('src/features/transport/transportLifecycle.ts');
  let progress = { request: null, queued: null, started: {} };
  const options = { mode: 'run', robotId: 'robot-id', createBody: () => ({ details: [{ containerId: 'uuid' }] }), onPhase: () => {}, onProgress: next => { progress = next; } };
  await assert.rejects(() => executeTransportLifecycle({ ...options, progress }), error => error.phase === 'Start Job JOB-REAL' && /Robot busy/.test(error.message));
  assert.equal(progress.request.id, 'request-id'); assert.equal(progress.queued.jobs.length, 2); assert.deepEqual(progress.started, {});
  assert.deepEqual(app.requests.map(r => r.path), ['/api/transportation/transport-requests', '/api/transportation/transport-requests/request-id/queue', '/api/workflow-execution/jobs/job-id/start']);
  startFails = false;
  assert.match(await executeTransportLifecycle({ ...options, progress }), /Remaining Jobs Await A Robot/);
  assert.equal(app.requests.length, 4); assert.equal(progress.started['job-id'].status, 'RUNNING');
  assert.deepEqual(JSON.parse(app.requests[3].body), { robotId: 'robot-id' });
});

test('transport stops at a failed queue, retaining the request for retry', async () => {
  let queueFails = true;
  const app = harness({ fetch: async url => url.endsWith('/queue') ? (queueFails ? json({ detail: 'Invalid plan' }, 400) : json({ jobs: [] })) : json({ id: 'saved-id' }) });
  const { executeTransportLifecycle } = app.load('src/features/transport/transportLifecycle.ts');
  let progress = { request: null, queued: null, started: {} };
  const options = { mode: 'queue', createBody: () => ({}), onPhase: () => {}, onProgress: next => { progress = next; } };
  await assert.rejects(() => executeTransportLifecycle({ ...options, progress }), error => error.phase === 'Queue Request');
  assert.equal(progress.request.id, 'saved-id'); assert.equal(progress.queued, null); assert.equal(app.requests.length, 2);
  queueFails = false; await executeTransportLifecycle({ ...options, progress });
  assert.equal(app.requests.length, 3); assert.equal(app.requests[2].path, '/api/transportation/transport-requests/saved-id/queue');
});

test('STAFF_INPUT coercion rejects invalid required, numeric, boolean, UUID and date inputs', () => {
  const { coerceWorkflowInputs, optionalLevel } = harness().load('src/features/transport/workflowInputs.ts');
  const field = dataType => ({ key: 'value', label: 'Field', required: true, dataType });
  assert.deepEqual(coerceWorkflowInputs([field('INTEGER')], { value: '3' }), { value: 3 });
  assert.deepEqual(coerceWorkflowInputs([field('DECIMAL')], { value: '2.5' }), { value: 2.5 });
  assert.deepEqual(coerceWorkflowInputs([field('BOOLEAN')], { value: 'false' }), { value: false });
  for (const [type, value] of [['INTEGER', '1.5'], ['DECIMAL', 'NaN'], ['BOOLEAN', 'yes'], ['UUID', 'BOX-101'], ['DATETIME', 'tomorrow'], ['STRING', '']]) assert.throws(() => coerceWorkflowInputs([field(type)], { value }));
  assert.equal(optionalLevel(''), null); assert.equal(optionalLevel('2'), 2); assert.throws(() => optionalLevel('0')); assert.throws(() => optionalLevel('32768'));
});

test('ROS transforms preserve yaw and continuous H-v coordinates, without a half-cell offset', () => {
  const { pixelToWorld, worldToImagePixel } = harness().load('src/shared/map/mapCoordinateTransform.ts');
  for (const originYaw of [0, Math.PI / 2, -0.4]) {
    const params = { resolution: 0.05, originX: -10, originY: 2, originYaw, imageHeightPixels: 200 };
    const origin = worldToImagePixel(params, { x: -10, y: 2 }); assert.equal(origin.u, 0); assert.equal(origin.v, 200);
    for (const pixel of [{ u: 0, v: 0 }, { u: 0, v: 200 }, { u: 63.2, v: 80.5 }]) {
      const actual = worldToImagePixel(params, pixelToWorld(params, pixel));
      assert.ok(Math.abs(actual.u - pixel.u) < 1e-10); assert.ok(Math.abs(actual.v - pixel.v) < 1e-10);
    }
  }
});

test('handover uses currentStepId and only RUNNING WAITING human pickup/dropoff can confirm', () => {
  const { getCurrentStep, canConfirmHandover } = harness().load('src/features/jobs/jobData.ts');
  const step = { id: 'actual-step', stepType: 'HUMAN_INTERACTION', status: 'WAITING', operationCode: 'PICKUP_CONFIRM', sequenceNo: 1 };
  const job = { status: 'RUNNING', currentStepId: step.id, tasks: [{ sequenceNo: 1, steps: [step] }] };
  assert.equal(getCurrentStep(job), step); assert.equal(canConfirmHandover(job), true);
  for (const status of ['CREATED', 'QUEUED', 'COMPLETED', 'RECOVERY_REQUIRED']) assert.equal(canConfirmHandover({ ...job, status }), false);
  assert.equal(canConfirmHandover(job, { ...step, status: 'EXECUTING' }), false);
  assert.equal(canConfirmHandover(job, { ...step, stepType: 'WAIT' }), false);
  assert.equal(getCurrentStep({ ...job, currentStepId: 'another-step' }), undefined);
});

function authHarness(options) {
  const state = []; let cursor = 0; let firstRender = true; const effects = [];
  const react = { createContext: () => ({ Provider: 'AuthProvider' }), useContext: () => null,
    useState: initial => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
    useEffect: effect => { if (firstRender) effects.push(effect); } };
  const app = harness({ ...options, modules: { react: { ...react, default: react, __esModule: true } } });
  const { AuthProvider } = app.load('src/features/auth/authContext.tsx');
  const render = () => { cursor = 0; const value = AuthProvider({ children: null }).props.value; firstRender = false; return value; };
  return { ...app, state, effects, render };
}

test('login cannot fabricate a session on network failure or invalid credentials', async () => {
  for (const failure of [0, 401]) {
    const app = authHarness({ fetch: async () => { if (!failure) throw new Error('Offline'); return json({ detail: 'Invalid credentials' }, failure); } });
    const auth = app.render();
    await assert.rejects(() => auth.loginAsync('someone', 'incorrect', 'Local Label'));
    assert.equal(app.state[0], null); assert.equal(app.client.getAccessToken(), null); assert.equal(app.stored.session, null);
    assert.equal(app.render().isAuthenticated, false);
  }
});

test('hydration waits for verified /me instead of accepting the cached profile', async () => {
  const gate = deferred();
  const app = authHarness({ fetch: async () => gate.promise });
  app.render(); app.effects.forEach(effect => effect()); await tick();
  assert.equal(app.state[0], null);
  gate.resolve(json({ id: 'server-account', username: 'real-user', fullName: 'Verified Staff', role: 'STAFF' }));
  await tick(); await tick();
  assert.equal(app.state[0].id, 'server-account'); assert.equal(app.state[0].zone, 'Local Preference'); assert.equal(app.state[1], false);
});

test('hydration clears cached session on forbidden or unauthorized /me and failed refresh', async () => {
  for (const status of [401, 403]) {
    const app = authHarness({ fetch: async () => json({ detail: 'Session revoked' }, status) });
    app.render(); app.effects.forEach(effect => effect()); await tick(); await tick(); await tick();
    assert.equal(app.state[0], null); assert.equal(app.state[1], false); assert.equal(app.stored.session, null); assert.equal(app.stored.access, null);
  }
});

test('only a successful login saves server identity and local zone preference', async () => {
  const app = authHarness({ fetch: async () => json({ accessToken: 'valid-access', refreshToken: 'valid-refresh', account: { id: 'server-id', username: 'staff', fullName: 'Real Staff', role: 'STAFF' } }) });
  const auth = app.render();
  const session = await auth.loginAsync('staff', 'secret', 'My Device Label');
  assert.equal(session.id, 'server-id'); assert.equal(app.stored.access, 'valid-access'); assert.equal(app.stored.session.zone, 'My Device Label');
  assert.equal(app.render().isAuthenticated, true);
  app.render().logout(); await tick(); await tick();
  assert.equal(app.state[0], null); assert.equal(app.stored.session, null);
});

function signalrHarness({ failFirst = false, holdFirst = false } = {}) {
  const connections = []; const gate = deferred(); let attempts = 0; let concurrent = 0; let maxConcurrent = 0; const timers = [];
  class Builder {
    withUrl() { return this; } withAutomaticReconnect() { return this; } configureLogging() { return this; }
    build() {
      const connection = { state: 'Disconnected', handlers: {},
        on(name, handler) { this.handlers[name] = handler; }, onreconnecting(handler) { this.reconnecting = handler; },
        onreconnected(handler) { this.reconnected = handler; }, onclose(handler) { this.close = handler; },
        async start() { attempts++; concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent); this.state = 'Connecting';
          try { if (holdFirst && attempts === 1) await gate.promise; if (failFirst && attempts === 1) throw new Error('Unavailable'); this.state = 'Connected'; }
          finally { concurrent--; } },
        async stop() { this.state = 'Disconnected'; this.close?.(); },
      };
      connections.push(connection); return connection;
    }
  }
  const app = harness({ modules: { '@microsoft/signalr': { HubConnectionBuilder: Builder, HubConnectionState: { Connected: 'Connected' }, LogLevel: { Warning: 3 }, HttpTransportType: { WebSockets: 1, LongPolling: 4 } } },
    setTimeout: callback => { const timer = { callback, cancelled: false }; timers.push(timer); return timer; }, clearTimeout: timer => { timer.cancelled = true; } });
  const client = app.load('src/shared/realtime/realtimeClient.ts').realtimeClient;
  return { ...app, realtime: client, gate, connections, timers, get maxConcurrent() { return maxConcurrent; } };
}

test('realtime restarts serialize even when token changes during initial connection', async () => {
  const app = signalrHarness({ holdFirst: true }); app.client.setAccessToken('token');
  const first = app.realtime.start(); await tick();
  const second = app.realtime.restart(); const third = app.realtime.restart();
  assert.equal(app.connections.length, 1);
  app.gate.resolve(); await Promise.all([first, second, third]);
  assert.equal(app.maxConcurrent, 1); assert.equal(app.connections.length, 3);
  assert.equal(app.connections.filter(c => c.state === 'Connected').length, 1);
  await app.realtime.stop();
});

test('realtime retries a failed initial start and emits reconnection for REST resync', async () => {
  const app = signalrHarness({ failFirst: true }); app.client.setAccessToken('token');
  const states = []; app.realtime.onConnectionStateChange(connected => states.push(connected));
  await app.realtime.start();
  assert.equal(app.realtime.isConnected, false); assert.equal(app.timers.length, 1);
  app.timers[0].callback(); await tick();
  assert.equal(app.realtime.isConnected, true); assert.equal(states.at(-1), true);
  app.connections.at(-1).reconnected(); assert.equal(states.at(-1), true);
  await app.realtime.stop();
});

test('events from a previous session connection are ignored after logout', async () => {
  const app = signalrHarness(); app.client.setAccessToken('token');
  const events = []; app.realtime.onJobUpdated(event => events.push(event));
  await app.realtime.start(); const connection = app.connections[0];
  connection.handlers.jobUpdated({ jobId: 'real-job', status: 'RUNNING' }); assert.equal(events.length, 1);
  await app.client.invalidateAuthSession(); connection.handlers.jobUpdated({ jobId: 'stale-job', status: 'RUNNING' });
  assert.equal(events.length, 1); await app.realtime.stop();
});

function hookRenderer(options = {}) {
  const slots = []; let cursor = 0; const pendingEffects = [];
  const react = {
    createContext: require('react').createContext, useContext: () => undefined,
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useCallback(fn) { cursor++; return fn; },
    useEffect(effect, dependencies) {
      const index = cursor++; const previous = slots[index];
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
        slots[index] = { dependencies, cleanup: previous?.cleanup };
        pendingEffects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const app = harness({ ...options, modules: { ...options.modules, react: { ...react, default: react, __esModule: true } } });
  return { ...app, render(Component, props = {}) { cursor = 0; return Component(props); }, flush() { while (pendingEffects.length) pendingEffects.shift()(); } };
}
function elements(element, name) {
  if (Array.isArray(element)) return element.flatMap(item => elements(item, name));
  if (!element || typeof element !== 'object') return [];
  return [...(element.type?.name === name ? [element] : []), ...elements(element.props?.children, name)];
}
const uiStub = Object.fromEntries(['Text', 'Button', 'TextField', 'ErrorBanner', 'ActionModal', 'Card', 'StatusPill'].map(name => [name, { [name]: function () {} }[name]]));

test('handover modal rejects a mismatched resolved UUID without confirming or advancing', async () => {
  const app = hookRenderer({ modules: { '../../shared/ui': uiStub }, fetch: async () => json({ id: 'wrong-uuid', barcode: 'actual-label' }) });
  const { VerifyModal } = app.load('src/features/jobs/VerifyModal.tsx'); const confirmed = []; let closed = false;
  const props = { visible: true, stepId: 'step-uuid', operationCode: 'PICKUP_CONFIRM', expectedContainerId: 'expected-uuid', onClose: () => { closed = true; }, onConfirmed: job => confirmed.push(job) };
  let tree = app.render(VerifyModal, props); app.flush();
  elements(tree, 'TextField')[0].props.onChangeText('actual-label'); tree = app.render(VerifyModal, props);
  await elements(tree, 'Button')[0].props.onPress(); tree = app.render(VerifyModal, props);
  assert.match(elements(tree, 'ErrorBanner')[0].props.message, /Does Not Match/);
  assert.equal(app.requests.length, 1); assert.equal(confirmed.length, 0); assert.equal(closed, false);
});

test('handover modal keeps actual HTTP 400/404/409 messages visible and never advances', async () => {
  for (const status of [400, 404, 409]) {
    const app = hookRenderer({ modules: { '../../shared/ui': uiStub }, fetch: async url => url.includes('/by-barcode/') ? json({ id: 'container-uuid' }) : json({ detail: `Actual rejection ${status}` }, status) });
    const { VerifyModal } = app.load('src/features/jobs/VerifyModal.tsx'); let advances = 0;
    const props = { visible: true, stepId: 'step-uuid', operationCode: 'DROPOFF_CONFIRM', expectedContainerId: 'container-uuid', onClose: () => advances++, onConfirmed: () => advances++ };
    let tree = app.render(VerifyModal, props); app.flush();
    elements(tree, 'TextField')[0].props.onChangeText('label'); tree = app.render(VerifyModal, props);
    await elements(tree, 'Button')[0].props.onPress(); tree = app.render(VerifyModal, props);
    assert.equal(elements(tree, 'ErrorBanner')[0].props.message, `Actual rejection ${status}`); assert.equal(advances, 0);
  }
});

test('handover modal returns the server JobDetailDto after barcode UUID resolution', async () => {
  const updated = { id: 'job-uuid', status: 'RUNNING', currentStepId: 'next-step', tasks: [], containers: [] };
  const app = hookRenderer({ modules: { '../../shared/ui': uiStub }, fetch: async url => url.includes('/by-barcode/') ? json({ id: 'container-uuid' }) : json(updated) });
  const { VerifyModal } = app.load('src/features/jobs/VerifyModal.tsx'); let result; let closed = false;
  const props = { visible: true, stepId: 'step-uuid', operationCode: 'PICKUP_CONFIRM', expectedContainerId: 'container-uuid', onClose: () => { closed = true; }, onConfirmed: job => { result = job; } };
  let tree = app.render(VerifyModal, props); app.flush();
  elements(tree, 'TextField')[0].props.onChangeText('printed-label'); tree = app.render(VerifyModal, props);
  await elements(tree, 'Button')[0].props.onPress(); assert.deepEqual(result, updated); assert.equal(closed, true);
  assert.deepEqual(JSON.parse(app.requests[1].body), { containerId: 'container-uuid', note: null });
});

test('job visuals render every container and all four step types with UUID keys', () => {
  const app = harness({ modules: { '../../shared/ui': uiStub } });
  const cargo = app.load('src/features/jobs/AmrCargoBayVisualizer.tsx').AmrCargoBayVisualizer;
  const containers = Array.from({ length: 5 }, (_, i) => ({ id: `job-container-${i}`, containerId: `container-${i}`, status: 'ONBOARD' }));
  assert.equal(elements(cargo({ containers }), 'Card').length, 5);
  const steps = ['CHECK', 'MOVE', 'HUMAN_INTERACTION', 'WAIT'].map((stepType, index) => ({ id: `uuid-${index}`, stepType, name: stepType, operationCode: `OP-${index}`, status: 'PENDING' }));
  const tree = app.load('src/features/jobs/JobStepper.tsx').JobStepper({ steps });
  assert.deepEqual(elements(tree, 'Card').map(element => element.key), steps.map(step => step.id));
});

test('a returned mutation snapshot supersedes an older pending GET', async () => {
  const app = hookRenderer(); const { useRemoteData } = app.load('src/shared/hooks/useRemoteData.ts');
  const gate = deferred(); let current;
  function Probe() { current = useRemoteData(() => gate.promise); return null; }
  app.render(Probe); app.flush();
  current.setData({ status: 'RUNNING', currentStepId: 'new-step' });
  gate.resolve({ status: 'CREATED', currentStepId: null }); await tick(); app.render(Probe);
  assert.equal(current.data.status, 'RUNNING'); assert.equal(current.data.currentStepId, 'new-step');
});

test('realtime context starts empty, derives operational notifications and preserves newer events on resync', async () => {
  const handlers = {}; const gate = deferred();
  const fakeClient = { start: async () => {}, stop: async () => {}, restart: async () => {} };
  for (const name of ['ConnectionStateChange', 'TelemetryUpdated', 'ConnectivityChanged', 'NotificationReceived', 'TransportStatusChanged', 'JobUpdated']) {
    fakeClient[`on${name}`] = handler => { handlers[name] = handler; return () => {}; };
  }
  const app = hookRenderer({ fetch: async () => gate.promise, modules: { './realtimeClient': { realtimeClient: fakeClient }, '../utils/haptics': { triggerHaptic: () => {} } } });
  const { RealtimeProvider } = app.load('src/shared/realtime/RealtimeContext.tsx'); app.client.setAccessToken('token');
  let value = app.render(RealtimeProvider, { children: null }).props.value; app.flush();
  assert.deepEqual(value.notifications, []); assert.deepEqual(value.robotTelemetry, {}); assert.equal(value.unreadCount, 0);
  handlers.ConnectionStateChange(true);
  handlers.JobUpdated({ jobId: 'job-uuid', kind: 'step', stepKey: 'PICKUP_CONFIRM', status: 'WAITING', occurredAt: '2026-10-17T02:00:00Z' });
  handlers.ConnectivityChanged({ robotId: 'robot-uuid', robotCode: 'R-7', isOnline: false, status: 'OFFLINE', lastHeartbeatAt: null });
  handlers.TelemetryUpdated({ robotId: 'robot-uuid', robotCode: 'R-7', poseX: 8, poseY: 4, poseYaw: 0, batteryPercent: 73, lastTelemetryAt: '2026-10-17T02:10:00Z' });
  gate.resolve(json({ items: [{ id: 'robot-uuid', code: 'R-7', poseX: 1, poseY: 1, poseYaw: 0, batteryPercent: 75, isOnline: true, status: 'AVAILABLE', lastHeartbeatAt: null, lastTelemetryAt: '2026-10-17T02:00:00Z' }], total: 1 }));
  await tick(); value = app.render(RealtimeProvider, { children: null }).props.value;
  assert.equal(value.resyncVersion, 1); assert.equal(value.notifications.length, 2); assert.equal(value.unreadCount, 2);
  assert.match(value.notifications.find(n => n.jobId)?.message, /PICKUP_CONFIRM: WAITING/);
  assert.equal(value.robotTelemetry['R-7'].poseX, 8); assert.equal(value.robotConnectivity['R-7'].isOnline, false);
  await app.client.invalidateAuthSession(); value = app.render(RealtimeProvider, { children: null }).props.value;
  assert.deepEqual(value.notifications, []); assert.deepEqual(value.robotTelemetry, {}); assert.deepEqual(value.robotConnectivity, {});
});

test('full map geometry and calibration metadata pass through the navigation API intact', async () => {
  const detail = { id: 'map-id', imageWidthPixels: 1000, imageHeightPixels: 800, resolution: 0.05, originX: -8, originY: -4, originYaw: 0.2,
    mapUri: '/map.pgm', previewImageUri: '/map.png', endpoints: [{ id: 'endpoint', x: 1, y: 2 }], edges: [{ id: 'edge', geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] } }], zones: [{ id: 'zone', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] } }] };
  const app = harness({ fetch: async () => json(detail) });
  assert.deepEqual(await app.load('src/shared/api/navigationApi.ts').getMapVersionDetail('map-id'), detail);
});

test('transport derives sources from actual containers and validates dotted movement schema paths', () => {
  const { buildTransportMovements } = harness().load('src/features/transport/transportMovements.ts');
  const endpoints = ['real-source', 'destination', 'manual-source'].map(id => ({ id, isEnabled: true }));
  const containers = [{ id: 'uuid-1', barcode: 'printed-1', currentStorageLocationId: 'source-location', currentEndpointId: 'real-source', currentLevelNo: 3 },
    { id: 'uuid-2', barcode: 'printed-2', currentStorageLocationId: null, currentEndpointId: null, currentLevelNo: null }];
  const locations = [{ id: 'source-location', endpointId: 'real-source' }, { id: 'destination-location', endpointId: 'destination' }];
  const draft = { sourceEndpointId: 'manual-source', destinationEndpointId: 'destination', destinationStorageLocationId: 'destination-location', destinationLevel: '2' };
  const fields = ['containerId', 'source.endpointId', 'destination.endpointId', 'jobContainerId'].map(key => ({ key, required: true, label: key }));
  const result = buildTransportMovements({ 'uuid-1': draft, 'uuid-2': draft }, containers, locations, endpoints, fields);
  assert.deepEqual(result[0], { sequenceNo: 1, containerId: 'uuid-1', sourceStorageLocationId: 'source-location', sourceEndpointId: 'real-source', sourceLevelNo: 3,
    destinationStorageLocationId: 'destination-location', destinationEndpointId: 'destination', destinationLevelNo: 2 });
  assert.equal(result[1].sourceEndpointId, 'manual-source'); assert.equal(result[1].sourceLevelNo, null); assert.equal(result[1].sequenceNo, 2);
  assert.throws(() => buildTransportMovements({ 'uuid-2': { ...draft, sourceEndpointId: '' } }, containers, locations, endpoints, fields), /Source Endpoint/);
  assert.throws(() => buildTransportMovements({ 'uuid-1': { ...draft, destinationStorageLocationId: 'source-location' } }, containers, locations, endpoints, fields), /Does Not Belong/);
});
