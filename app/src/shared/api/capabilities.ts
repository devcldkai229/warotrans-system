import { ApiError } from './client';

// Which backend features exist (not who may use them: that is the session's permissions).
// 08/11/2026: issue reports are served by POST /api/operations/issues (OPS-01).
export const mobileCapabilities = {
  createContainer: false,
  resolveProduct: false,
  claimHumanTask: false,
  reportIssue: true,
  pauseJob: false,
  resumeJob: true,
  payloadRecovery: false,
} as const;

export function requireMobileCapability(feature: keyof typeof mobileCapabilities): void {
  if (!mobileCapabilities[feature]) {
    throw new ApiError(501, 'backend_capability_unavailable', 'This action is not supported by the current backend. Contact the supervisor.');
  }
}
