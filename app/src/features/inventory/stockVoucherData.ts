import { ApiError } from '../../shared/api/client';
import { type StockVoucherLine, type StockVoucherPage } from '../../shared/api/warehouseApi';
import type { OperatingContext } from '../../shared/api/operatingContextApi';
import { PERMISSIONS, sessionCan } from '../../shared/auth/permissions';
import type { StockVoucherType, UserSession } from '../../shared/types/contracts';

export function voucherLineLocation(
  line: Pick<StockVoucherLine, 'currentStorageLocationCode' | 'currentEndpointId' | 'containerStatus'>,
  endpointLabelById?: ReadonlyMap<string, string>,
): string | null {
  if (line.currentStorageLocationCode) return line.currentStorageLocationCode;
  if (line.currentEndpointId) {
    const resolved = endpointLabelById?.get(line.currentEndpointId);
    if (resolved) return resolved;
    return 'At Station';
  }
  if (line.containerStatus === 'ISSUED') return null;
  return 'None';
}

export function canReadVouchers(session: UserSession | null) {
  return !!session && ['STAFF', 'ADMIN'].includes(session.role) && sessionCan(session, PERMISSIONS.warehouseRead);
}
export function canCreateVoucher(session: UserSession | null) {
  return canReadVouchers(session) && sessionCan(session, PERMISSIONS.voucherWrite);
}
export function canAllocateInboundBatch(session: UserSession | null) {
  return canCreateVoucher(session) && sessionCan(session, PERMISSIONS.containerCreate);
}
export function voucherType(value: unknown): StockVoucherType {
  return value === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND';
}
export function voucherDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Time unavailable';
}
export function voucherRows(pages: StockVoucherPage[]) {
  const seen = new Set<string>();
  return pages.flatMap(page => page.items).filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
export function nextVoucherPage(last: StockVoucherPage, pages: StockVoucherPage[]) {
  const loaded = pages.reduce((count, page) => count + page.items.length, 0);
  return last.items.length > 0 && loaded < last.total ? loaded : undefined;
}
export function incompleteVoucherPages(pages: StockVoucherPage[]) {
  const last = pages.at(-1);
  return !!last && last.items.length === 0 && pages.reduce((sum, page) => sum + page.items.length, 0) < last.total;
}
export function draftValidation(referenceNo: string, note: string) {
  if (referenceNo.trim().length > 100) return 'Reference must be 100 characters or fewer.';
  if (note.trim().length > 500) return 'Note must be 500 characters or fewer.';
  return null;
}
export function uncertainDraftWrite(error: unknown) {
  return error instanceof ApiError && (error.status === 0 || error.status >= 500);
}
/** Lists follow the published context; an open create form cannot silently change its warehouse. */
export function selectPublishedVoucherWarehouse(context: OperatingContext | undefined, pinnedId = '') {
  if (!context?.warehouse.isActive || context.map.status !== 'PUBLISHED' || context.map.warehouseId !== context.warehouse.id) return undefined;
  return !pinnedId || pinnedId === context.warehouse.id ? context.warehouse : undefined;
}
