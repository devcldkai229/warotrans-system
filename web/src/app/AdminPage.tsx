import type { ReactNode } from 'react'

export interface AdminStat {
  label: string
  value: string | number
  tone?: 'green' | 'muted'
}

interface AdminPageProps {
  title: string
  subtitle: string
  stats: AdminStat[]
  children: ReactNode
}

/** Header + stat cards + content card shared by every admin/data screen. */
export function AdminPage({ title, subtitle, stats, children }: AdminPageProps) {
  return (
    <>
      <header className="apage__head">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </header>
      <div className="apage__body">
        <div className="apage__stats" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
          {stats.map((stat) => (
            <div key={stat.label} className="apage__stat">
              <span>{stat.label}</span>
              <strong className={stat.tone ? `is-${stat.tone}` : undefined}>{stat.value}</strong>
            </div>
          ))}
        </div>
        <section className="apage__card">{children}</section>
      </div>
    </>
  )
}
