const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
const load = createLoader({ qrcode: require('qrcode') });
const scan = load('src/shared/scan/scanCodes.ts');
const labels = load('src/shared/scan/labels.ts');

test('codes are recognised by shape, and the QR payload names its kind', () => {
  const kind = raw => scan.classifyCode(raw)?.kind ?? null;
  assert.equal(kind('C181126001'), 'CONTAINER');
  assert.equal(kind('ctn-20261118-000003'), 'CONTAINER');
  assert.equal(kind('PN-20261118-000001'), 'VOUCHER');
  assert.equal(kind('PX-20261115-000001'), 'VOUCHER');
  assert.equal(kind('R181126004'), 'REQUEST');
  assert.equal(kind('REQ-20261118-000004'), 'REQUEST');
  assert.equal(kind('J181126004'), 'JOB');
  assert.equal(kind('SHELF-A-1'), 'LOCATION');
  assert.equal(kind('8930001234567'), 'PRODUCT');
  assert.equal(kind('   '), null);
  assert.equal(scan.qrPayload('CONTAINER', 'C181126001'), 'WT:C:C181126001');
  assert.deepEqual(plain(scan.classifyCode('WT:L:SHELF-C-1')), { kind: 'LOCATION', code: 'SHELF-C-1', raw: 'WT:L:SHELF-C-1' });
  assert.deepEqual(plain(scan.classifyCode('wt:v:PN-20261118-000002')), { kind: 'VOUCHER', code: 'PN-20261118-000002', raw: 'wt:v:PN-20261118-000002' });
});

test('the scan guard drops the same code within its window, case-insensitively', () => {
  let clock = 0;
  const accept = scan.createScanGuard(2000, () => clock);
  assert.equal(accept('C181126001'), true);
  clock = 500; assert.equal(accept('c181126001'), false);
  assert.equal(accept('C181126002'), true);
  clock = 2600; assert.equal(accept('C181126001'), true);
});

test('Code 128 B has the right checksum and 11 modules per symbol (13 for stop)', () => {
  // "ABC": 104 + 33*1 + 34*2 + 35*3 = 310, 310 % 103 = 1
  assert.deepEqual(plain(labels.code128BValues('ABC')), [104, 33, 34, 35, 1, 106]);
  const widths = labels.code128B('C181126001');
  assert.equal(widths.reduce((sum, w) => sum + w, 0), (1 + 10 + 1) * 11 + 13);
  assert.equal(widths.length, (1 + 10 + 1) * 6 + 7);
  assert.throws(() => labels.code128B('Ä'), /cannot be printed/);
});

test('QR matrix is square with finder patterns, and the sheet has one label per code', () => {
  const qr = labels.qrMatrix('WT:C:C181126001');
  assert.ok(qr.size >= 21 && (qr.size - 17) % 4 === 0);
  for (const [x, y] of [[0, 0], [6, 0], [0, 6], [qr.size - 1, 0], [0, qr.size - 1]]) assert.equal(qr.dark(x, y), true);
  assert.equal(qr.dark(7, 7), false);
  const html = labels.labelSheetHtml([{ code: 'C181126001', qr: 'WT:C:C181126001', title: 'Box <A>' }, { code: 'C181126002', qr: 'WT:C:C181126002' }]);
  assert.equal((html.match(/class="label"/g) || []).length, 2);
  assert.ok(html.includes('Box &lt;A&gt;'));
});

test('a scan opens what the code names; a container shows the staff steps waiting for it', async () => {
  const router = load('src/shared/scan/scanRouter.ts');
  const job = { id: 'job-1', jobNo: 'J181126004', tasks: [
    { contextValues: { containerId: 'c-1' }, steps: [{ id: 's1', status: 'WAITING', operationCode: 'PICKUP_CONFIRM' }] },
    { contextValues: {}, steps: [{ id: 's2', status: 'WAITING', operationCode: 'INSPECTION_CONFIRM', resolvedInputs: { containerId: 'c-1' } }, { id: 's3', status: 'PENDING', operationCode: 'DROPOFF_CONFIRM', resolvedInputs: { containerId: 'c-1' } }] },
    { contextValues: { containerId: 'c-2' }, steps: [{ id: 's4', status: 'WAITING', operationCode: 'DROPOFF_CONFIRM' }] },
  ] };
  assert.deepEqual(plain(router.containerTasks([job], 'c-1').map(task => [task.stepId, task.operation])), [['s1', 'PICKUP_CONFIRM'], ['s2', 'INSPECTION_CONFIRM']]);
  const api = {
    container: async code => code === 'C181126001' ? { id: 'c-1', barcode: code } : null,
    voucher: async code => code === 'PN-20261118-000001' ? { id: 'v-1', warehouseId: 'w' } : null,
    request: async () => ({ id: 'r-1' }), job: async () => null, location: async () => ({ id: 'l-1' }),
    product: async () => null, runningJobs: async () => [job],
  };
  const go = raw => router.resolveScan(scan.classifyCode(raw), api).then(plain);
  assert.deepEqual(await go('WT:V:PN-20261118-000001'), { type: 'route', screen: 'stock_voucher_detail', params: { voucherId: 'v-1', warehouseId: 'w' } });
  assert.deepEqual(await go('R181126004'), { type: 'route', screen: 'transport_detail', params: { requestId: 'r-1' } });
  assert.deepEqual(await go('SHELF-A-1'), { type: 'route', screen: 'inventory_lookup', params: { locationId: 'l-1' } });
  assert.equal((await go('J181126009')).type, 'error');
  assert.equal((await go('8930001')).type, 'error');
  const container = await go('WT:C:C181126001');
  assert.equal(container.type, 'container');
  assert.equal(container.tasks.length, 2);
  assert.equal((await go('C181126999')).type, 'error');
});
