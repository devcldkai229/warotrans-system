import { startJob } from '../../shared/api/executionApi';

export interface JobStartResult { jobId: string; jobNo: string; robot: string | null; error: string | null }

/**
 * Starts queued Jobs one by one (the web's "Run on robot": queue, then start). Without a robot id the backend picks the
 * best free robot on the request's map; a Job no robot can take keeps its own error and stays startable later.
 */
export async function startQueuedJobs(jobs: { jobId: string; jobNo: string }[], start: typeof startJob = startJob): Promise<JobStartResult[]> {
  const results: JobStartResult[] = [];
  for (const job of jobs) {
    try {
      const started = await start(job.jobId);
      const code = started?.contextValues?.assignedRobotCode;
      const id = started?.contextValues?.assignedRobotId;
      results.push({ jobId: job.jobId, jobNo: job.jobNo,
        robot: typeof code === 'string' && code !== 'Unassigned' ? code : typeof id === 'string' ? id : null, error: null });
    } catch (error) {
      results.push({ jobId: job.jobId, jobNo: job.jobNo, robot: null, error: error instanceof Error ? error.message : 'The job could not be started.' });
    }
  }
  return results;
}
