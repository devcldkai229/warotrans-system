import { ApiError } from './client';

// Operations verified for the approved mobile workflow; permissions are checked separately.
// 08/11/2026: issue reports are served by POST /api/operations/issues (OPS-01).
export const mobileCapabilities = {
  createContainer: true,
  createStockVoucherDraft: true,
  // Inbound confirmation atomically posts InventoryStock once at configured Inbound; Outbound remains guarded by voucher type.
  confirmStockVoucher: true,
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
