const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createJobRefresh } = require('./load-module.cjs')()('src/features/jobs/jobRefresh.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('a slow job read survives repeated poll/push refreshes without starvation', async () => {
  const reader = createJobRefresh(); let resolve, requests = 0; const applied = [];
  const load = () => { requests++; return new Promise(done => { resolve = done; }); };
  const first = reader.read('job', load, value => applied.push(value), () => {});
  await tick();
  for (let i = 0; i < 10; i++) assert.equal(reader.read('job', load, () => {}, () => {}), first);
  assert.equal(requests, 1); resolve({ id: 'job' }); await first;
  assert.equal(applied.length, 1); assert.equal(applied[0].id, 'job');
});

test('navigation and command responses invalidate an older pending read', async () => {
  const reader = createJobRefresh(); let finish; const applied = [], errors = [];
  const stale = reader.read('job-a', () => new Promise(resolve => { finish = resolve; }), value => applied.push(value), error => errors.push(error));
  await tick(); reader.invalidate();
  await reader.read('job-b', async () => 'new-job', value => applied.push(value), error => errors.push(error));
  finish('old-job'); await stale; assert.deepEqual(applied, ['new-job']); assert.deepEqual(errors, []);
  const command = reader.read('job-b', () => new Promise(resolve => { finish = resolve; }), value => applied.push(value), () => {});
  await tick(); reader.invalidate(); finish('pre-command-state'); await command;
  assert.deepEqual(applied, ['new-job']);
});

test('read failures allow retry and obsolete failures cannot replace a newer job', async () => {
  const reader = createJobRefresh(); const errors = []; let reject;
  await assert.rejects(reader.read('job', async () => { throw new Error('offline'); }, () => {}, error => errors.push(error.message)), /offline/);
  assert.deepEqual(errors, ['offline']);
  const stale = reader.read('job', () => new Promise((_, fail) => { reject = fail; }), () => {}, error => errors.push(error.message));
  await tick(); reader.invalidate();
  await reader.read('job', async () => 'recovered', () => {}, () => {});
  reject(new Error('old-error')); await assert.rejects(stale, /old-error/); assert.deepEqual(errors, ['offline']);
});
