import { apiRequest } from './client'

export type TicketType = 'MAINTENANCE' | 'DIAGNOSTIC' | 'INSPECTION' | 'REPAIR' | 'TECHNICAL_REPORT'
export type TicketStatus = 'OPEN' | 'COMPLETED' | 'CANCELLED'
export type TicketResult = 'PASSED' | 'FIXED' | 'NEEDS_FOLLOW_UP' | 'FAILED'

export const TICKET_TYPES: TicketType[] = ['INSPECTION', 'DIAGNOSTIC', 'REPAIR', 'MAINTENANCE', 'TECHNICAL_REPORT']
export const TICKET_STATUSES: TicketStatus[] = ['OPEN', 'COMPLETED', 'CANCELLED']
export const TICKET_RESULTS: TicketResult[] = ['PASSED', 'FIXED', 'NEEDS_FOLLOW_UP', 'FAILED']

export interface TicketAction {
  at: string
  byName: string | null
  text: string
}

export interface TicketChecklistItem {
  item: string
  ok: boolean
  note?: string | null
}

/** GET /api/fleet/tickets/{id}: a technical ticket (phiếu kỹ thuật) of one robot. */
export interface TechnicalTicket {
  id: string
  ticketNo: string
  robotId: string
  robotCode: string
  type: TicketType
  status: TicketStatus
  title: string
  description: string | null
  findings: string | null
  actions: TicketAction[]
  checklist: TicketChecklistItem[]
  result: TicketResult | null
  /** The robot when the ticket was opened: status, battery, pose, localization, health. */
  snapshot: Record<string, unknown> | null
  maintenanceRecordId: string | null
  issueId: string | null
  jobId: string | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
  completedByName: string | null
  completedAt: string | null
}

export interface TicketQuery {
  robotId?: string
  type?: TicketType | ''
  status?: TicketStatus | ''
  search?: string
  skip?: number
  take?: number
}

export function listTickets(query: TicketQuery = {}) {
  const params = new URLSearchParams()
  if (query.robotId) params.set('robotId', query.robotId)
  if (query.type) params.set('type', query.type)
  if (query.status) params.set('status', query.status)
  if (query.search) params.set('search', query.search)
  if (query.skip !== undefined) params.set('skip', String(query.skip))
  if (query.take !== undefined) params.set('take', String(query.take))
  const qs = params.toString()
  return apiRequest<{ items: TechnicalTicket[]; total: number; skip: number; take: number }>(`/api/fleet/tickets${qs ? `?${qs}` : ''}`)
}

export const getTicket = (id: string) => apiRequest<TechnicalTicket>(`/api/fleet/tickets/${id}`)

export function createTicket(
  robotId: string,
  body: { type: TicketType; title: string; description?: string; findings?: string; issueId?: string; jobId?: string },
) {
  return apiRequest<TechnicalTicket>(`/api/fleet/robots/${robotId}/tickets`, { method: 'POST', body: JSON.stringify(body) })
}

export function updateTicket(
  id: string,
  body: { title?: string; description?: string; findings?: string; checklist?: TicketChecklistItem[] },
) {
  return apiRequest<TechnicalTicket>(`/api/fleet/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export const addTicketAction = (id: string, text: string) =>
  apiRequest<TechnicalTicket>(`/api/fleet/tickets/${id}/actions`, { method: 'POST', body: JSON.stringify({ text }) })

export const completeTicket = (id: string, body: { result: TicketResult; findings?: string; checklist?: TicketChecklistItem[] }) =>
  apiRequest<TechnicalTicket>(`/api/fleet/tickets/${id}/complete`, { method: 'POST', body: JSON.stringify(body) })

export const cancelTicket = (id: string, reason: string) =>
  apiRequest<TechnicalTicket>(`/api/fleet/tickets/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) })
