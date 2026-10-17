/** Ring gauge of the robot's real forward speed (telemetry odometry). */
export function Speedometer({ speed, max }: { speed: number | null; max: number }) {
  const value = Math.abs(speed ?? 0)
  const r = 44
  const circumference = 2 * Math.PI * r
  const fraction = Math.min(1, max > 0 ? value / max : 0)
  return (
    <div className="relative grid size-[116px] place-items-center rounded-full bg-surface shadow-float">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 116 116">
        <circle cx="58" cy="58" r={r} fill="none" className="stroke-container-high" strokeWidth="8" />
        <circle
          cx="58"
          cy="58"
          r={r}
          fill="none"
          className="stroke-green transition-[stroke-dasharray] duration-300"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${circumference * fraction} ${circumference}`}
        />
      </svg>
      <div className="text-center leading-none">
        <div className="text-2xl font-book text-ink tabular-nums">{speed === null ? '—' : value.toFixed(2)}</div>
        <div className="mt-1 text-xs text-muted">m/s</div>
      </div>
    </div>
  )
}
