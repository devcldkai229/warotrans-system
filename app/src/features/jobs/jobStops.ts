import type { JobStepResponse } from '../../shared/types/contracts';
import type { AppJobTaskItem } from './jobData';

/** One stop of the trip: consecutive tasks at the same place doing the same thing (drive there, then confirm each container). */
export interface JobStop { key: string; action: string | undefined; endpointCode: string | undefined; tasks: AppJobTaskItem[]; steps: { step: JobStepResponse; containerCode?: string }[] }

export function groupStops(tasks: AppJobTaskItem[]): JobStop[] {
  const stops: JobStop[] = [];
  for (const task of tasks) {
    const action = typeof task.contextValues?.stopAction === 'string' ? task.contextValues.stopAction : undefined;
    const last = stops[stops.length - 1];
    const stop = last && last.action === action && last.endpointCode === task.endpointCode && action
      ? last : { key: task.id, action, endpointCode: task.endpointCode, tasks: [], steps: [] };
    if (stop !== last) stops.push(stop);
    stop.tasks.push(task);
    for (const step of task.steps) stop.steps.push({ step, containerCode: task.containerCodes[0] });
  }
  return stops;
}

export function stopStatus(stop: JobStop): string {
  const statuses = stop.steps.map(item => item.step.status);
  if (statuses.some(status => status === 'FAILED')) return 'FAILED';
  if (statuses.some(status => status === 'WAITING')) return 'WAITING';
  if (statuses.some(status => status === 'EXECUTING')) return 'EXECUTING';
  if (statuses.some(status => status === 'PAUSED')) return 'PAUSED';
  if (statuses.length && statuses.every(status => status === 'COMPLETED' || status === 'SKIPPED')) return 'COMPLETED';
  if (statuses.some(status => status === 'COMPLETED')) return 'EXECUTING';
  return 'PENDING';
}

/** Where each container is picked up and delivered, from the stop tasks that carry it. */
export function containerRoutes(tasks: AppJobTaskItem[]): Record<string, { from?: string; to?: string }> {
  const routes: Record<string, { from?: string; to?: string }> = {};
  for (const task of tasks) {
    const action = task.contextValues?.stopAction;
    for (const code of task.containerCodes) {
      const route = routes[code] ?? (routes[code] = {});
      if (action === 'PICKUP' && !route.from) route.from = task.endpointCode;
      if (action === 'DROPOFF' && !route.to) route.to = task.endpointCode;
    }
  }
  return routes;
}
