import type { TaskSummary } from '@/shared/api/contracts'

export const TASK_SUMMARY: TaskSummary = {
  completed: 3412,
  completedDeltaPercent: 12.4,
  cancelled: 122,
  failed: 46,
  reassigned: 47,
  belowTargetTime: 2890,
  aboveTargetTime: 522,
  timeouts: 14,
  rows: [
    { taskType: 'Rack to dock transfer', completed: 1245, cancelled: 42, failed: 12, timeouts: 18 },
    { taskType: 'Returns to sorting', completed: 862, cancelled: 31, failed: 21, timeouts: 14 },
    { taskType: 'Bulk floor to packing', completed: 704, cancelled: 26, failed: 9, timeouts: 8 },
    { taskType: 'Replenishment run', completed: 431, cancelled: 15, failed: 11, timeouts: 6 },
    { taskType: 'Charger repositioning', completed: 211, cancelled: 8, failed: 8, timeouts: 4 },
  ],
}

export const DASHBOARD_META = {
  warehouse: 'Warehouse A',
  lastUpdated: 'last updated 2 min ago',
  range: 'Last 7 days',
}
