/** `45s`, `12m 05s`, `2h 10m`: a Job takes minutes, a Request can take hours. */
export function compactDuration(seconds: number | null) {
  if (seconds === null) return '—'
  const total = Math.round(seconds)
  if (total < 60) return `${total}s`
  if (total < 3600) return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`
  return `${Math.floor(total / 3600)}h ${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}m`
}

/** `87.5%`, or `—` when the history covers none of the period. */
export function percent(value: number | null, digits = 1) {
  return value === null ? '—' : `${value.toFixed(digits)}%`
}
