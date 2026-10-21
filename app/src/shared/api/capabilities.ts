import { ApiError } from './client';

// Current deployed BE contract, verified against its registered OpenAPI routes.
// Enable a command only after the owning BE team exposes and validates it.
export const mobileCapabilities = {
  createContainer: false,
  resolveProduct: false,
  claimHumanTask: false,
  reportIssue: false,
  pauseResume: false,
  payloadRecovery: false,
} as const;

export function requireMobileCapability(feature: keyof typeof mobileCapabilities): void {
  if (!mobileCapabilities[feature]) {
    throw new ApiError(501, 'backend_capability_unavailable', 'This action is not supported by the current backend. Contact the supervisor.');
  }
}
