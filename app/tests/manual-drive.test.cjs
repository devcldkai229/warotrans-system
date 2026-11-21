const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
const plain = (value) => JSON.parse(JSON.stringify(value));
const flush = () => new Promise((resolve) => setImmediate(resolve));

const {
  JOYSTICK_DEADZONE,
  TELEOP_REPEAT_MS,
  createSequencedLeaseTracker,
  createTeleopController,
  manualDriveBlockReason,
  stickToVelocity,
  turnRateFor,
} = createLoader()('src/features/fleet/manualDriveLogic.ts');

test('stickToVelocity applies deadzone, clamps radius, and maps +forward/+left polarity', () => {
  assert.deepEqual(plain(stickToVelocity(3, -4, 64, 0.2)), {
    linear: 0,
    angular: 0,
    knobX: 3,
    knobY: -4,
  });

  const fullForward = stickToVelocity(0, -200, 64, 0.2);
  assert.equal(fullForward.linear, 0.2);
  assert.equal(fullForward.angular, 0);
  assert.equal(Math.round(Math.hypot(fullForward.knobX, fullForward.knobY)), 64);

  const leftTurn = stickToVelocity(-64, 0, 64, 0.3);
  assert.equal(leftTurn.linear, 0);
  assert.equal(leftTurn.angular, Math.round(turnRateFor(0.3) * 1000) / 1000);

  const reverseRight = stickToVelocity(64, 64, 64, 0.2);
  assert.ok(reverseRight.linear < 0);
  assert.ok(reverseRight.angular < 0);
  assert.ok(JOYSTICK_DEADZONE > 0);
});

test('manualDriveBlockReason enforces permission, link, appActive, robot readiness and heldByMe lease', () => {
  const readyRobot = { isOnline: true, isEnabled: true, currentCommandId: null, motionHeld: false };
  const myLease = { active: true, heldByMe: true, holderName: 'tech-1' };

  assert.equal(
    manualDriveBlockReason({ hasPermission: true, appActive: true, linkInterrupted: false, robot: readyRobot, lease: myLease }),
    null,
  );
  assert.match(
    manualDriveBlockReason({ hasPermission: false, appActive: true, linkInterrupted: false, robot: readyRobot, lease: myLease }),
    /permission/,
  );
  assert.match(
    manualDriveBlockReason({ hasPermission: true, teleopEnabled: false, appActive: true, linkInterrupted: false, robot: readyRobot, lease: myLease }),
    /gated/,
  );
  assert.match(
    manualDriveBlockReason({ hasPermission: true, appActive: false, linkInterrupted: false, robot: readyRobot, lease: myLease }),
    /inactive/,
  );
  assert.match(
    manualDriveBlockReason({ hasPermission: true, appActive: true, linkInterrupted: true, robot: readyRobot, lease: myLease }),
    /Connection/,
  );
  assert.match(
    manualDriveBlockReason({ hasPermission: true, appActive: true, linkInterrupted: false, robot: { ...readyRobot, isOnline: false }, lease: myLease }),
    /offline/,
  );
  assert.match(
    manualDriveBlockReason({ hasPermission: true, appActive: true, linkInterrupted: false, robot: { ...readyRobot, motionHeld: true }, lease: myLease }),
    /STOP/,
  );
  assert.match(
    manualDriveBlockReason({ hasPermission: true, appActive: true, linkInterrupted: false, robot: { ...readyRobot, currentCommandId: 'cmd-1' }, lease: myLease }),
    /autonomous/,
  );
  assert.match(
    manualDriveBlockReason({ hasPermission: true, appActive: true, linkInterrupted: false, robot: readyRobot, lease: { active: true, heldByMe: false, holderName: 'Admin' } }),
    /Admin holds/,
  );
});

test('createTeleopController enforces single-flight latest-wins, 200ms repeat, release stop and latched interrupts', async () => {
  const sent = [];
  const errors = [];
  const movingStates = [];
  let canDrive = true;
  let tick = null;
  let cleared = 0;
  let nextResolver = null;

  const controller = createTeleopController({
    canDrive: () => canDrive,
    onError: (err) => errors.push(err),
    onMovingChange: (m) => movingStates.push(m),
    clock: {
      setInterval: (fn, ms) => {
        assert.equal(ms, TELEOP_REPEAT_MS);
        tick = fn;
        return 1;
      },
      clearInterval: () => {
        tick = null;
        cleared += 1;
      },
    },
    send: (linear, angular, signal) => {
      sent.push({ linear, angular, signal });
      return new Promise((resolve) => {
        nextResolver = resolve;
      });
    },
  });

  // Update without beginGesture is ignored.
  controller.updateGesture(0.2, 0);
  assert.equal(sent.length, 0);

  assert.equal(controller.beginGesture(), true);
  controller.updateGesture(0.2, 0);
  assert.equal(sent.length, 1);
  assert.equal(controller.isMoving, true);

  // While request #1 is still in flight, interval ticks & new setpoints do NOT queue extra non-zero requests.
  controller.updateGesture(0.3, -0.5);
  tick();
  assert.equal(sent.length, 1);

  // Finish request #1, then next tick sends ONLY latest velocity (0.3, -0.5).
  nextResolver({ linear: 0.2, angular: 0 });
  await flush();
  tick();
  assert.equal(sent.length, 2);
  assert.deepEqual({ linear: sent[1].linear, angular: sent[1].angular }, { linear: 0.3, angular: -0.5 });

  // End gesture aborts in-flight non-zero #2 and sends trailing zero stop cleanly.
  controller.endGesture();
  assert.equal(sent[1].signal.aborted, true);
  assert.equal(controller.isMoving, false);
  nextResolver({ linear: 0.3, angular: -0.5 });
  await flush();
  assert.equal(sent.length, 3);
  assert.deepEqual({ linear: sent[2].linear, angular: sent[2].angular }, { linear: 0, angular: 0 });
  nextResolver({ linear: 0, angular: 0 });
  await flush();

  // Interrupt latches: updateGesture without a fresh beginGesture cannot drive even if canDrive returns true.
  assert.equal(controller.beginGesture(), true);
  controller.updateGesture(0.1, 0);
  assert.equal(sent.length, 4);
  controller.interrupt();
  assert.equal(controller.isInterrupted, true);
  controller.updateGesture(0.2, 0);
  assert.equal(sent.length, 4);
  nextResolver({ linear: 0.1, angular: 0 });
  await flush();
  assert.equal(sent.length, 5);
  assert.deepEqual({ linear: sent[4].linear, angular: sent[4].angular }, { linear: 0, angular: 0 });
  assert.ok(cleared >= 2);
  assert.deepEqual(errors, []);
  assert.ok(movingStates.length >= 2);

  controller.dispose();
});

test('createTeleopController skips zero retry on 401/403/0 errors and interrupts immediately', async () => {
  const sent = [];
  const errors = [];
  const controller = createTeleopController({
    canDrive: () => true,
    onError: (err) => errors.push(err),
    send: async (linear, angular) => {
      sent.push({ linear, angular });
      const err = new Error('Unauthorized');
      err.status = 401;
      throw err;
    },
  });

  controller.beginGesture();
  controller.updateGesture(0.2, 0);
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(sent.length, 1);
  assert.equal(controller.isInterrupted, true);
  assert.equal(controller.isMoving, false);
  assert.equal(errors.length, 1);
  controller.dispose();
});

test('createSequencedLeaseTracker increments seq monotonically, keeps seq on renewal, and applies serverTime offset', () => {
  const tracker = createSequencedLeaseTracker();
  assert.equal(tracker.nextSetpoint(), null);

  tracker.syncLease(
    { heldByMe: true, sequenced: true, leaseId: 'lease-1', serverTime: '2026-11-20T10:00:05.000Z' },
    Date.parse('2026-11-20T10:00:00.000Z'),
  );
  assert.equal(tracker.leaseId, 'lease-1');
  assert.equal(tracker.serverOffsetMs, 5000);

  const s1 = tracker.nextSetpoint(Date.parse('2026-11-20T10:00:01.000Z'));
  assert.deepEqual(plain(s1), {
    leaseId: 'lease-1',
    seq: 1,
    clientSentAt: '2026-11-20T10:00:06.000Z',
  });

  // Renewing same leaseId preserves monotonic seq counter.
  tracker.syncLease(
    { heldByMe: true, sequenced: true, leaseId: 'lease-1', serverTime: '2026-11-20T10:00:15.000Z' },
    Date.parse('2026-11-20T10:00:10.000Z'),
  );
  const s2 = tracker.nextSetpoint(Date.parse('2026-11-20T10:00:11.000Z'));
  assert.equal(s2.seq, 2);

  // New leaseId resets seq back to 1 on next setpoint.
  tracker.syncLease(
    { heldByMe: true, sequenced: true, leaseId: 'lease-2', serverTime: '2026-11-20T10:00:25.000Z' },
    Date.parse('2026-11-20T10:00:20.000Z'),
  );
  const s3 = tracker.nextSetpoint(Date.parse('2026-11-20T10:00:21.000Z'));
  assert.deepEqual(plain(s3), {
    leaseId: 'lease-2',
    seq: 1,
    clientSentAt: '2026-11-20T10:00:26.000Z',
  });

  tracker.clear();
  assert.equal(tracker.leaseId, null);
  assert.equal(tracker.nextSetpoint(), null);

  assert.match(
    manualDriveBlockReason({
      hasPermission: true,
      appActive: true,
      linkInterrupted: false,
      robot: { isOnline: true, isEnabled: true, currentCommandId: null, motionHeld: false },
      lease: { active: true, heldByMe: true, holderName: 'Tech', sequenced: true, leaseId: null },
    }),
    /identifier/,
  );
});
