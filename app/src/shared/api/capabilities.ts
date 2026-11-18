import { ApiError } from './client';

// Operations verified for the approved mobile workflow; permissions are checked separately.
// 08/11/2026: issue reports are served by POST /api/operations/issues (OPS-01).
export const mobileCapabilities = {
  createContainer: true,
  createStockVoucherDraft: true,
  // Inbound and Outbound voucher confirmations post stock atomically via ConfirmStockVoucher (stockPostedAt).
  confirmStockVoucher: true,
  // Warehouse maps ResolveProduct with warehouse.read + StaffOrAdmin; wire contract is exactMatch/items.
  resolveProduct: true,
  // WH-03 claim / release / takeover on job-steps (verified against HumanTasks endpoints, 18/11/2026).
  claimHumanTask: true,
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
