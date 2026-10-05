// Display formatting for API values. The API sends ISO-8601 timestamps and plain numbers; the UI formats them here.

const pad = (value: number) => String(value).padStart(2, '0')

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatDateTimeWithYear(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** `04m 12s`; hours are folded into minutes because Jobs run for minutes, not days. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  return `${pad(Math.floor(seconds / 60))}m ${pad(seconds % 60)}s`
}

export function secondsBetween(fromIso: string | null | undefined, toIso?: string | null): number | null {
  if (!fromIso) return null
  const end = toIso ? new Date(toIso).getTime() : Date.now()
  return Math.max(0, (end - new Date(fromIso).getTime()) / 1000)
}

export function formatCoordinate(value: number): string {
  return `${value.toFixed(2)} m`
}

/** `2026-09-20 09:12` (ISO-like, used by data tables). */
export function formatIsoDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
