import { ApiError } from './client';

// Operations verified for the approved mobile workflow; permissions are checked separately.
// 08/11/2026: issue reports are served by POST /api/operations/issues (OPS-01).
export const mobileCapabilities = {
  createContainer: false,
  createStockVoucherDraft: true,
  // The current confirm handler changes the document only; it does not post stock at Inbound/Outbound.
  confirmStockVoucher: false,
  // Warehouse maps ResolveProduct with warehouse.read + StaffOrAdmin; wire contract is exactMatch/items.
  resolveProduct: true,
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
