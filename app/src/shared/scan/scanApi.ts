import { ApiError } from '../api/client';
import { getContainerByBarcode, listStockVouchers, listStorageLocations, resolveProduct } from '../api/warehouseApi';
import { listTransportRequests } from '../api/transportApi';
import { getJobDetail, listJobSummaries } from '../api/executionApi';
import { getOperatingContext } from '../api/operatingContextApi';
import type { ScanApi } from './scanRouter';

const same = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();
const orNull = async <T>(load: () => Promise<T>): Promise<T | null> => {
  try { return await load(); } catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error; }
};

/** The scan router's lookups on the existing APIs: exact code only, a missing one is null. */
export function createScanApi(): ScanApi {
  let warehouse: Promise<string> | null = null;
  const warehouseId = () => (warehouse ??= getOperatingContext().then(context => context.warehouse.id));
  return {
    container: code => orNull(() => getContainerByBarcode(code)),
    async voucher(code) {
      const id = await warehouseId();
      const page = await listStockVouchers({ warehouseId: id, search: code, take: 10 });
      const hit = page.items.find(item => same(item.code, code));
      return hit ? { id: hit.id, warehouseId: id } : null;
    },
    async request(code) {
      const page = await listTransportRequests({ search: code, take: 10 });
      const hit = page.items.find(item => same(item.requestCode, code));
      return hit ? { id: hit.id } : null;
    },
    async job(code) {
      const page = await listJobSummaries({ search: code, take: 10 });
      const hit = page.items.find(item => same(item.jobNo, code));
      return hit ? { id: hit.id } : null;
    },
    async location(code) {
      const locations = await listStorageLocations({ warehouseId: await warehouseId(), activeOnly: true });
      const hit = locations.items.find(item => same(item.code, code) || same(item.endpointCode, code));
      return hit ? { id: hit.id } : null;
    },
    async product(code) {
      const found = await orNull(() => resolveProduct({ barcode: code }));
      return found?.exactMatch ? { sku: found.exactMatch.sku } : null;
    },
    async runningJobs() {
      const page = await listJobSummaries({ status: 'RUNNING', take: 50 });
      return Promise.all(page.items.map(item => getJobDetail(item.id)));
    },
  };
}
