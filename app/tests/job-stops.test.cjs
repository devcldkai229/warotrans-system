const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
const { groupStops, stopStatus, containerRoutes } = createLoader()('src/features/jobs/jobStops.ts');

// The shape of JOB-20261118-000004 (inbound, 2 containers): a drive task then one confirm task per container.
const step = (id, stepType, operationCode, status = 'PENDING') => ({ id, stepType, operationCode, workflowStepKey: operationCode, status });
const task = (id, action, endpointCode, steps, containerCodes = []) => ({ id, title: id, endpointCode, containerCodes, contextValues: { stopAction: action }, steps });
const tasks = [
  task('t1', 'PICKUP', 'EP-INBOUND', [step('s1', 'MOVE', 'PICKUP', 'COMPLETED')]),
  task('t2', 'PICKUP', 'EP-INBOUND', [step('s2', 'HUMAN_INTERACTION', 'PICKUP_CONFIRM', 'WAITING')], ['CTN-1']),
  task('t3', 'PICKUP', 'EP-INBOUND', [step('s3', 'HUMAN_INTERACTION', 'PICKUP_CONFIRM')], ['CTN-2']),
  task('t4', 'DROPOFF', 'EP-SHELF-A-1', [step('s4', 'MOVE', 'DROPOFF')]),
  task('t5', 'DROPOFF', 'EP-SHELF-A-1', [step('s5', 'HUMAN_INTERACTION', 'DROPOFF_CONFIRM')], ['CTN-1']),
  task('t6', 'DROPOFF', 'EP-SHELF-A-2', [step('s6', 'MOVE', 'DROPOFF')]),
  task('t7', 'DROPOFF', 'EP-SHELF-A-2', [step('s7', 'HUMAN_INTERACTION', 'DROPOFF_CONFIRM')], ['CTN-2']),
];

test('consecutive tasks at the same place become one stop with all their steps', () => {
  const stops = groupStops(tasks);
  assert.deepEqual(plain(stops.map(stop => [stop.action, stop.endpointCode, stop.steps.length])),
    [['PICKUP', 'EP-INBOUND', 3], ['DROPOFF', 'EP-SHELF-A-1', 2], ['DROPOFF', 'EP-SHELF-A-2', 2]]);
  assert.deepEqual(plain(stops[0].steps.map(item => item.containerCode ?? null)), [null, 'CTN-1', 'CTN-2']);
  assert.equal(stopStatus(stops[0]), 'WAITING');
  assert.equal(stopStatus(stops[1]), 'PENDING');
});

test('each container keeps its own pick-up and delivery place', () => {
  assert.deepEqual(plain(containerRoutes(tasks)), {
    'CTN-1': { from: 'EP-INBOUND', to: 'EP-SHELF-A-1' },
    'CTN-2': { from: 'EP-INBOUND', to: 'EP-SHELF-A-2' },
  });
});
