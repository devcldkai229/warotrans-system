import { createTransportRequest, queueTransportRequest } from '../../shared/api/transportApi';
import type { CreateTransportRequestBody, CreateTransportRequestResponse, QueueTransportRequestResponse } from '../../shared/api/transportApi';
import { startJob } from '../../shared/api/executionApi';
import type { JobDetailResponse } from '../../shared/types/contracts';

export interface TransportProgress {
  request: CreateTransportRequestResponse | null;
  queued: QueueTransportRequestResponse | null;
  started: Record<string, JobDetailResponse>;
}
export class TransportLifecycleError extends Error {
  constructor(readonly phase: string, readonly cause: unknown) {
    super(`${phase} Failed: ${cause instanceof Error ? cause.message : 'Request Failed'}`);
    this.name = 'TransportLifecycleError';
  }
}
/** Reports receipts immediately, so retrying a failed later stage never recreates earlier work. */
export async function executeTransportLifecycle(options: {
  mode: 'submit' | 'queue' | 'run';
  progress: TransportProgress;
  createBody: () => CreateTransportRequestBody;
  robotId?: string;
  onProgress: (progress: TransportProgress) => void;
  onPhase: (phase: string) => void;
}): Promise<string> {
  let progress = { ...options.progress, started: { ...options.progress.started } };
  let phase = 'Create Request';
  try {
    if (options.mode === 'run' && !options.robotId) throw new Error('Select A Robot Before Starting Jobs.');
    if (!progress.request) {
      options.onPhase(phase);
      progress.request = await createTransportRequest(options.createBody());
      options.onProgress({ ...progress });
    }
    if (options.mode === 'submit') return 'Request Submitted';
    phase = 'Queue Request';
    if (!progress.queued) {
      options.onPhase(phase);
      progress.queued = await queueTransportRequest(progress.request.id);
      options.onProgress({ ...progress });
    }
    if (options.mode === 'queue') return 'Request Queued';
    const next = progress.queued.jobs.find(job => !progress.started[job.jobId]);
    if (!next) return progress.queued.jobs.length ? 'All Jobs Started' : 'No Jobs Returned By Queue';
    phase = `Start Job ${next.jobNo}`;
    options.onPhase(phase);
    const job = await startJob(next.jobId, options.robotId);
    progress.started[job.id] = job;
    options.onProgress({ ...progress, started: { ...progress.started } });
    return progress.queued.jobs.some(j => !progress.started[j.jobId]) ? 'Job Started; Remaining Jobs Await A Robot' : 'Job Started';
  } catch (error) { throw new TransportLifecycleError(phase, error); }
}
