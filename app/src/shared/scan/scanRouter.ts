import type { ContainerListItem } from '../api/warehouseApi';
import type { JobDetailResponse } from '../types/contracts';
import type { ScannedCode } from './scanCodes';

/** Where a scan leads: a screen, the container card, or a message. */
export type ScanTarget =
  | { type: 'route'; screen: string; params: Record<string, unknown> }
  | { type: 'container'; container: ContainerListItem; tasks: ContainerTask[] }
  | { type: 'error'; message: string };

/** A waiting staff step on a job that names this container (what the container card offers to do). */
export interface ContainerTask { jobId: string; jobNo: string; stepId: string; operation: string }

export interface ScanApi {
  container(code: string): Promise<ContainerListItem | null>;
  voucher(code: string): Promise<{ id: string; warehouseId: string } | null>;
  request(code: string): Promise<{ id: string } | null>;
  job(code: string): Promise<{ id: string } | null>;
  location(code: string): Promise<{ id: string } | null>;
  product(code: string): Promise<{ sku: string } | null>;
  /** Running jobs, to find a waiting step for the scanned container. */
  runningJobs(): Promise<JobDetailResponse[]>;
}

const STAFF_STEPS = ['PICKUP_CONFIRM', 'DROPOFF_CONFIRM', 'INSPECTION_CONFIRM'];

/** Waiting pick-up / delivery / inspection steps that name the container (by its id in the step or task inputs). */
export function containerTasks(jobs: JobDetailResponse[], containerId: string): ContainerTask[] {
  return jobs.flatMap(job => job.tasks.flatMap(task => task.steps
    .filter(step => step.status === 'WAITING' && STAFF_STEPS.includes(step.operationCode)
      && (step.resolvedInputs?.containerId === containerId || task.contextValues?.containerId === containerId))
    .map(step => ({ jobId: job.id, jobNo: job.jobNo, stepId: step.id, operation: step.operationCode }))));
}

/** Resolve a recognised code through the existing APIs (each one checks access); exact code match only. */
export async function resolveScan(scanned: ScannedCode, api: ScanApi): Promise<ScanTarget> {
  const notFound = (what: string): ScanTarget => ({ type: 'error', message: `${scanned.code}: no ${what} with this code.` });
  try {
    switch (scanned.kind) {
      case 'CONTAINER': {
        const container = await api.container(scanned.code);
        if (!container) return notFound('container');
        const jobs = await api.runningJobs().catch(() => []);
        return { type: 'container', container, tasks: containerTasks(jobs, container.id) };
      }
      case 'VOUCHER': {
        const voucher = await api.voucher(scanned.code);
        return voucher ? { type: 'route', screen: 'stock_voucher_detail', params: { voucherId: voucher.id, warehouseId: voucher.warehouseId } } : notFound('stock voucher');
      }
      case 'REQUEST': {
        const request = await api.request(scanned.code);
        return request ? { type: 'route', screen: 'transport_detail', params: { requestId: request.id } } : notFound('transport request');
      }
      case 'JOB': {
        const job = await api.job(scanned.code);
        return job ? { type: 'route', screen: 'job_detail', params: { jobId: job.id } } : notFound('job');
      }
      case 'LOCATION': {
        const location = await api.location(scanned.code);
        return location ? { type: 'route', screen: 'inventory_lookup', params: { locationId: location.id } } : notFound('shelf');
      }
      case 'PRODUCT': {
        const product = await api.product(scanned.code);
        return product ? { type: 'route', screen: 'inventory_lookup', params: { search: product.sku } } : { type: 'error', message: `${scanned.code} is not a WaroTrans code or a known product.` };
      }
    }
  } catch (error) {
    return { type: 'error', message: error instanceof Error ? error.message : 'The code could not be looked up.' };
  }
}
