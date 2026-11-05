import type { JobDetailResponse } from '../types/contracts';

// These are Job timestamps, not a fabricated notification creation time.
export function jobActivityTime(job: JobDetailResponse): string {
  const [label, value] = job.completedAt ? ['Finished', job.completedAt]
    : job.startedAt ? ['Started', job.startedAt] : ['Created', job.createdAt];
  if (!value || !Number.isFinite(Date.parse(value))) return 'Time Unavailable';
  return `${label} ${new Date(value).toLocaleString()}`;
}
