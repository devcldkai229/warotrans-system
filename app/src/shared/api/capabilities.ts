import { ApiError } from './client';

// Checked against the registered BE routes and authorization policies (27/10/2026).
// Warehouse create/resolve are not mapped; Operations inbox is AdminOnly and no
// issue-report route is mapped. Enable Staff commands only after both are ready.
export const mobileCapabilities = {
  createContainer: false,
  resolveProduct: false,
  claimHumanTask: false,
  reportIssue: false,
  pauseJob: false,
  resumeJob: true,
  payloadRecovery: false,
} as const;

export function requireMobileCapability(feature: keyof typeof mobileCapabilities): void {
  if (!mobileCapabilities[feature]) {
    throw new ApiError(501, 'backend_capability_unavailable', 'This action is not supported by the current backend. Contact the supervisor.');
  }
}
