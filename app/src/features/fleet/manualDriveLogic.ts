import type { ManualLeaseResponse, RobotResponse } from '../../shared/types/contracts';

export const MANUAL_LEASE_RENEW_MS = 10_000;
export const TELEOP_REPEAT_MS = 200;
export const JOYSTICK_DEADZONE = 0.12;
export const SPEED_PRESETS = [0.1, 0.2, 0.3] as const;

export function turnRateFor(maxLinear: number): number {
  return Math.min(1.0, 0.2 + maxLinear * 2.7);
}

const cleanZero = (value: number) => {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
};

export function stickToVelocity(
  dx: number,
  dy: number,
  radius: number,
  maxLinear: number,
): { linear: number; angular: number; knobX: number; knobY: number } {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || radius <= 0) {
    return { linear: 0, angular: 0, knobX: 0, knobY: 0 };
  }
  let cx = dx;
  let cy = dy;
  const length = Math.hypot(cx, cy);
  if (length > radius) {
    cx = (cx / length) * radius;
    cy = (cy / length) * radius;
  }
  const nx = cx / radius;
  const ny = cy / radius;
  const dead = (value: number) => (Math.abs(value) < JOYSTICK_DEADZONE ? 0 : value);
  return {
    linear: cleanZero(dead(-ny) * maxLinear),
    angular: cleanZero(dead(-nx) * turnRateFor(maxLinear)),
    knobX: cx,
    knobY: cy,
  };
}

export interface ManualDriveGateInput {
  hasPermission: boolean;
  teleopEnabled?: boolean;
  appActive: boolean;
  linkInterrupted: boolean;
  robot: Pick<RobotResponse, 'isOnline' | 'isEnabled' | 'currentCommandId' | 'motionHeld'> | null;
  lease: Pick<ManualLeaseResponse, 'active' | 'heldByMe' | 'holderName'> | null;
}

export function manualDriveBlockReason(input: ManualDriveGateInput): string | null {
  if (!input.hasPermission) {
    return 'Manual drive requires robot.manual.drive permission.';
  }
  if (input.teleopEnabled === false) {
    return 'Manual joystick drive is gated until lease-epoch freshness and robot authority checks are ready.';
  }
  if (!input.appActive) {
    return 'Control paused while app was inactive. Touch joystick again to resume.';
  }
  if (input.linkInterrupted) {
    return 'Connection was interrupted. Reconnect and take lease before driving.';
  }
  if (!input.robot) {
    return 'Select an online robot to inspect or drive.';
  }
  if (!input.robot.isOnline) {
    return 'Robot is offline. Motion commands cannot be sent.';
  }
  if (!input.robot.isEnabled) {
    return 'Robot is disabled.';
  }
  if (input.robot.motionHeld) {
    return 'Robot holds motion after a STOP. Check stop-state and resume motion first.';
  }
  if (input.robot.currentCommandId) {
    return 'Robot is executing an autonomous command.';
  }
  if (!input.lease?.heldByMe) {
    return input.lease?.active && input.lease.holderName
      ? `${input.lease.holderName} holds the manual-drive lease.`
      : 'Acquire the manual-drive lease before moving the robot.';
  }
  return null;
}

export interface TeleopClock {
  setInterval: (handler: () => void, timeout?: number) => ReturnType<typeof setInterval>;
  clearInterval: (id: ReturnType<typeof setInterval>) => void;
}

const DEFAULT_CLOCK: TeleopClock = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
};

export interface TeleopControllerOptions {
  send: (linear: number, angular: number, signal: AbortSignal) => Promise<unknown>;
  canDrive: () => boolean;
  onError: (error: unknown) => void;
  onMovingChange?: (moving: boolean) => void;
  clock?: TeleopClock;
  repeatMs?: number;
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && (error as { name?: unknown }).name === 'AbortError';
}

function shouldSkipZeroAfterError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('status' in error)) return false;
  const status = (error as { status?: unknown }).status;
  return status === 0 || status === 401 || status === 403;
}

/**
 * Latest-wins native teleop loop (no stale queued setpoints, max 1 request in flight):
 * repeats every `repeatMs` while held, aborts non-zero setpoints on release/interrupt,
 * and latches interrupted state until a fresh user gesture begins.
 */
export function createTeleopController({
  send,
  canDrive,
  onError,
  onMovingChange,
  clock = DEFAULT_CLOCK,
  repeatMs = TELEOP_REPEAT_MS,
}: TeleopControllerOptions) {
  let desired: [number, number] = [0, 0];
  let moving = false;
  let gestureActive = false;
  let latchedInterrupt = false;
  let disposed = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;
  let inFlightNonZero = false;
  let pendingZero = false;
  let activeAbort: AbortController | null = null;
  let generation = 0;

  const notifyMoving = (next: boolean) => {
    if (moving !== next) {
      moving = next;
      onMovingChange?.(next);
    }
  };

  const clearTimer = () => {
    if (timer !== null) {
      clock.clearInterval(timer);
      timer = null;
    }
  };

  const dispatchNow = (linear: number, angular: number, isZeroStop: boolean) => {
    if (disposed || inFlight) return;
    inFlight = true;
    inFlightNonZero = !isZeroStop;
    const gen = generation;
    const controller = new AbortController();
    activeAbort = controller;

    let requestPromise: Promise<unknown>;
    try {
      requestPromise = Promise.resolve(send(linear, angular, controller.signal));
    } catch (syncError) {
      requestPromise = Promise.reject(syncError);
    }

    requestPromise
      .catch((error) => {
        if (disposed || controller.signal.aborted || isAbortError(error) || gen !== generation) return;
        interruptInternal({ skipZeroSend: shouldSkipZeroAfterError(error) });
        onError(error);
      })
      .finally(() => {
        if (activeAbort === controller) activeAbort = null;
        inFlight = false;
        inFlightNonZero = false;
        if (pendingZero && !disposed) {
          pendingZero = false;
          dispatchNow(0, 0, true);
        }
      });
  };

  const triggerZeroStop = () => {
    if (disposed) return;
    if (inFlightNonZero) {
      activeAbort?.abort();
    }
    if (inFlight) {
      pendingZero = true;
      return;
    }
    pendingZero = false;
    dispatchNow(0, 0, true);
  };

  const interruptInternal = (options: { skipZeroSend?: boolean } = {}) => {
    clearTimer();
    const hadMotion = moving || desired[0] !== 0 || desired[1] !== 0 || inFlightNonZero;
    desired = [0, 0];
    gestureActive = false;
    latchedInterrupt = true;
    generation += 1;
    notifyMoving(false);

    if (options.skipZeroSend) {
      pendingZero = false;
      activeAbort?.abort();
      return;
    }
    if (hadMotion) {
      triggerZeroStop();
    }
  };

  const startLoopIfNeeded = () => {
    if (timer !== null || disposed) return;
    timer = clock.setInterval(() => {
      if (disposed || !gestureActive || latchedInterrupt || !canDrive()) {
        interruptInternal();
        return;
      }
      const [linear, angular] = desired;
      if (linear === 0 && angular === 0) {
        clearTimer();
        return;
      }
      if (!inFlight) {
        dispatchNow(linear, angular, false);
      }
    }, repeatMs);
  };

  const applyVelocity = (linear: number, angular: number) => {
    if (disposed || !gestureActive || latchedInterrupt || !canDrive()) {
      return;
    }
    const nextLinear = Number.isFinite(linear) ? cleanZero(linear) : 0;
    const nextAngular = Number.isFinite(angular) ? cleanZero(angular) : 0;
    const [prevLinear, prevAngular] = desired;
    const nowMoving = nextLinear !== 0 || nextAngular !== 0;

    if (!nowMoving) {
      desired = [0, 0];
      clearTimer();
      const wasMoving = moving || prevLinear !== 0 || prevAngular !== 0 || inFlightNonZero;
      notifyMoving(false);
      if (wasMoving) {
        triggerZeroStop();
      }
      return;
    }

    desired = [nextLinear, nextAngular];
    pendingZero = false;
    notifyMoving(true);
    if (!inFlight && (nextLinear !== prevLinear || nextAngular !== prevAngular)) {
      dispatchNow(nextLinear, nextAngular, false);
    }
    startLoopIfNeeded();
  };

  return {
    beginGesture(): boolean {
      if (disposed || !canDrive()) {
        latchedInterrupt = true;
        gestureActive = false;
        return false;
      }
      latchedInterrupt = false;
      gestureActive = true;
      return true;
    },
    updateGesture(linear: number, angular: number) {
      if (!gestureActive || latchedInterrupt) return;
      if (!canDrive()) {
        interruptInternal();
        return;
      }
      applyVelocity(linear, angular);
    },
    endGesture() {
      gestureActive = false;
      clearTimer();
      const wasMoving = moving || desired[0] !== 0 || desired[1] !== 0 || inFlightNonZero;
      desired = [0, 0];
      notifyMoving(false);
      if (wasMoving) {
        triggerZeroStop();
      }
    },
    interrupt(options: { skipZeroSend?: boolean } = {}) {
      interruptInternal(options);
    },
    syncCanDrive() {
      if (!canDrive() && (moving || gestureActive || inFlightNonZero)) {
        interruptInternal();
      }
    },
    dispose() {
      if (disposed) return;
      interruptInternal();
      disposed = true;
      pendingZero = false;
      activeAbort?.abort();
    },
    get isMoving() {
      return moving;
    },
    get isInterrupted() {
      return latchedInterrupt;
    },
  };
}
