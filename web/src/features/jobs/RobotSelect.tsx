import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listRobots } from '@/shared/api/fleet'

export interface RobotSelectProps {
  mapVersionId: string
  value: string
  onChange: (robotId: string) => void
  /** When true, auto-select the first online AVAILABLE enabled robot once candidates load. */
  preferOnlineAvailable?: boolean
  className?: string
  'aria-label'?: string
}

/**
 * Robot picker for Start Job. Filters by the Job's map; empty value means "best available"
 * (backend auto-picks). Optionally defaults to the first online AVAILABLE enabled robot.
 */
export function RobotSelect({
  mapVersionId,
  value,
  onChange,
  preferOnlineAvailable = true,
  className = 'h-8 min-w-0 flex-1 rounded-md bg-container px-2 text-sm',
  'aria-label': ariaLabel = 'Robot',
}: RobotSelectProps) {
  const robotsQuery = useQuery({
    queryKey: ['fleet-robots', 'for-job', mapVersionId],
    queryFn: () => listRobots({ take: 100 }),
    enabled: Boolean(mapVersionId),
  })
  const candidates = useMemo(
    () => (robotsQuery.data?.items ?? []).filter((r) => r.currentMapVersionId === mapVersionId),
    [robotsQuery.data?.items, mapVersionId],
  )

  const [didAutoSelect, setDidAutoSelect] = useState(false)
  useEffect(() => {
    if (!preferOnlineAvailable || didAutoSelect || value || candidates.length === 0) return
    const preferred = candidates.find((r) => r.isOnline && r.status === 'AVAILABLE' && r.isEnabled)
    if (preferred) {
      onChange(preferred.id)
      setDidAutoSelect(true)
    }
  }, [preferOnlineAvailable, didAutoSelect, value, candidates, onChange])

  return (
    <select
      className={className}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
    >
      <option value="">Best available robot</option>
      {candidates.map((r) => (
        <option key={r.id} value={r.id}>
          {r.code} · {r.status} · {r.isOnline ? 'online' : 'offline'}
        </option>
      ))}
    </select>
  )
}
