import { apiFetch } from './client'
import type { Robot, RobotStatus } from './contracts'

export interface ListRobotsParams {
  warehouseId?: string
  status?: RobotStatus
  isEnabled?: boolean
  search?: string
  skip?: number
  take?: number
}

export interface ListRobotsResponse {
  items: Robot[]
  total: number
}

export interface RegisterRobotRequest {
  warehouseId: string
  currentMapVersionId: string
  code: string
  name: string
}

export function listRobots(params: ListRobotsParams = {}) {
  const query = new URLSearchParams()
  if (params.warehouseId) query.set('warehouseId', params.warehouseId)
  if (params.status) query.set('status', params.status)
  if (params.isEnabled !== undefined) query.set('isEnabled', String(params.isEnabled))
  if (params.search) query.set('search', params.search)
  if (params.skip !== undefined) query.set('skip', String(params.skip))
  if (params.take !== undefined) query.set('take', String(params.take))
  const qs = query.toString()
  return apiFetch<ListRobotsResponse>(`/api/fleet/robots${qs ? `?${qs}` : ''}`)
}

export function getRobot(id: string) {
  return apiFetch<Robot>(`/api/fleet/robots/${id}`)
}

export function registerRobot(body: RegisterRobotRequest) {
  return apiFetch<Robot>('/api/fleet/robots', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function enableRobot(id: string) {
  return apiFetch<Robot>(`/api/fleet/robots/${id}/enable`, { method: 'POST' })
}

export function disableRobot(id: string) {
  return apiFetch<Robot>(`/api/fleet/robots/${id}/disable`, { method: 'POST' })
}
