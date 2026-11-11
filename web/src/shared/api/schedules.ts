import { apiRequest } from './client'

export type ScheduleRecurrence = 'ONCE' | 'DAILY' | 'WEEKLY'

export interface TransportWave {
  id: string
  plannedAt: string
  status: 'PLANNED' | 'STARTED' | 'SKIPPED' | 'MISSED' | 'CANCELLED' | 'FAILED'
  transportRequestId: string | null
  containerCount: number
  note: string | null
  processedAt: string | null
}

export interface TransportSchedule {
  id: string
  name: string
  warehouseId: string
  workflowId: string
  productId: string
  sourceStorageLocationId: string
  destinationEndpointId: string
  maxContainersPerWave: number
  recurrence: ScheduleRecurrence
  localTime: string
  startDate: string
  daysOfWeek: number[]
  timezone: string
  endsAt: string | null
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'FINISHED'
  waves: TransportWave[]
}

export interface CreateScheduleBody {
  name: string
  warehouseId: string
  mapVersionId: string
  workflowId: string
  productId: string
  sourceStorageLocationId: string
  destinationEndpointId: string
  destinationStorageLocationId: string
  maxContainersPerWave: number
  recurrence: ScheduleRecurrence
  localTime: string
  startDate: string
  daysOfWeek?: number[]
  timezone: string
}

const ROOT = '/api/transportation/schedules'

export function listSchedules(warehouseId?: string) {
  const qs = warehouseId ? `?warehouseId=${warehouseId}` : ''
  return apiRequest<{ items: TransportSchedule[] }>(`${ROOT}${qs}`)
}

export function createSchedule(body: CreateScheduleBody) {
  return apiRequest<TransportSchedule>(ROOT, { method: 'POST', body: JSON.stringify(body) })
}

export function setScheduleState(id: string, action: 'pause' | 'resume' | 'cancel') {
  return apiRequest<TransportSchedule>(`${ROOT}/${id}/${action}`, { method: 'POST' })
}

export function cancelWave(id: string) {
  return apiRequest<TransportWave>(`${ROOT}/waves/${id}/cancel`, { method: 'POST' })
}
