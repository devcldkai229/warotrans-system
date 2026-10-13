import type { TransportRequestView } from '@/shared/api/contracts'

/** Request progress is aggregated from its Detail lines, never from Job status alone (rules/02). */
export function detailProgress(request: TransportRequestView) {
  const total = request.details.length
  const done = request.details.filter((detail) => detail.status === 'COMPLETED').length
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) }
}

export function routeSummary(request: TransportRequestView) {
  const [first] = request.details
  if (!first) return '—'
  const extra = request.details.length - 1
  return `${first.sourceLabel} → ${first.destinationLabel}${extra > 0 ? ` +${extra}` : ''}`
}
