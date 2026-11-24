import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listRobots } from '@/shared/api/fleet'
import { labApi, type LabScenario } from '@/shared/api/lab'
import { listTransportRequests } from '@/shared/api/transportRequests'
import { t } from '@/shared/i18n'
import { formatDateTimeFull } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'

const EXECUTOR_HINT: Record<string, string> = {
  ROBOT: 'The robot does it (its gateway must run with LAB_ENABLED); it ends by itself after the TTL.',
  HOST: 'The backend does it.',
  OPERATOR: 'You do it (scan the wrong label, do not confirm, restart the backend); the Lab only records when.',
}

/**
 * Fault Injection Lab (test benches only): inject one fault into a running transport request and watch it end.
 * The injection is written to the request's journal for the replay and for grading; the AI never sees it.
 */
export function LabPage() {
  const qc = useQueryClient()
  const scenarios = useQuery({ queryKey: ['lab', 'scenarios'], queryFn: labApi.scenarios, staleTime: Infinity })
  const injections = useQuery({ queryKey: ['lab', 'injections'], queryFn: labApi.injections, refetchInterval: 3_000 })
  const robots = useQuery({ queryKey: ['lab', 'robots'], queryFn: () => listRobots({ take: 50 }) })
  const requests = useQuery({
    queryKey: ['lab', 'requests'],
    queryFn: () => listTransportRequests({ status: 'IN_PROGRESS', take: 50 }),
    refetchInterval: 10_000,
  })

  const [scenarioId, setScenarioId] = useState('')
  const [robotCode, setRobotCode] = useState('')
  const [requestId, setRequestId] = useState('')
  const [ttl, setTtl] = useState('')
  const [params, setParams] = useState<Record<string, string>>({})
  const scenario: LabScenario | undefined = useMemo(
    () => scenarios.data?.find((s) => s.id === scenarioId),
    [scenarios.data, scenarioId],
  )
  const chooseScenario = (id: string) => {
    const next = scenarios.data?.find((s) => s.id === id)
    setScenarioId(id)
    setParams({ ...(next?.defaultParameters ?? {}) })
    setTtl(next ? String(next.defaultTtlSeconds) : '')
  }

  const refresh = () => void qc.invalidateQueries({ queryKey: ['lab', 'injections'] })
  const inject = useMutation({
    mutationFn: () =>
      labApi.inject({
        scenarioId,
        robotCode: robotCode || null,
        transportRequestId: requestId || null,
        ttlSeconds: ttl ? Number(ttl) : null,
        parameters: params,
      }),
    onSettled: refresh,
  })
  const stop = useMutation({ mutationFn: (id: string) => labApi.stop(id), onSettled: refresh })

  return (
    <div className="grid gap-4 p-4">
      <header>
        <h1 className="text-lg font-semibold">{t('Fault Injection Lab')}</h1>
        <p className="text-sm text-ink-2">
          {t('Test benches only. One fault per transport request; the AI investigates it from the evidence alone.')}
        </p>
      </header>

      <section className="grid gap-3 rounded-md border border-outline bg-surface p-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          {t('Fault')}
          <select className={controlClass()} value={scenarioId} onChange={(e) => chooseScenario(e.target.value)}>
            <option value="">{t('Choose a fault…')}</option>
            {scenarios.data?.map((s) => (
              <option key={s.id} value={s.id}>{`${s.id} · ${s.title}`}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          {t('Robot')}
          <select className={controlClass()} value={robotCode} onChange={(e) => setRobotCode(e.target.value)}>
            <option value="">{t('No robot')}</option>
            {robots.data?.items.map((r) => (
              <option key={r.id} value={r.code}>{`${r.code} · ${r.name}`}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          {t('Transport request (running)')}
          <select className={controlClass()} value={requestId} onChange={(e) => setRequestId(e.target.value)}>
            <option value="">{t('None (file under the robot’s open trip)')}</option>
            {requests.data?.items.map((r) => (
              <option key={r.id} value={r.id}>{r.requestCode}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          {t('Ends after (s)')}
          <input className={controlClass()} inputMode="numeric" value={ttl} onChange={(e) => setTtl(e.target.value)} />
        </label>
        {scenario && (
          <div className="grid gap-2 text-sm md:col-span-2">
            <p>{scenario.description}</p>
            <p className="text-xs text-ink-2">{t(EXECUTOR_HINT[scenario.executor] ?? scenario.executor)}</p>
            {Object.keys(params).map((k) => (
              <label key={k} className="grid gap-1">
                {k}
                <input className={controlClass()} value={params[k]} onChange={(e) => setParams({ ...params, [k]: e.target.value })} />
              </label>
            ))}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 md:col-span-2">
          {inject.error ? <span className="text-xs text-red-ink">{(inject.error as Error).message}</span> : null}
          <Button variant="primary" disabled={!scenarioId || inject.isPending} onClick={() => inject.mutate()}>
            {inject.isPending ? t('Injecting…') : t('Inject')}
          </Button>
        </div>
      </section>

      <section className="rounded-md border border-outline bg-surface">
        <h2 className="border-b border-outline px-4 py-2 text-sm font-semibold">{t('Injections')}</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-2">
            <tr>
              <th className="px-4 py-2">{t('Fault')}</th>
              <th className="px-4 py-2">{t('Robot')}</th>
              <th className="px-4 py-2">{t('Injected')}</th>
              <th className="px-4 py-2">{t('Ends')}</th>
              <th className="px-4 py-2">{t('Status')}</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {injections.data?.map((i) => (
              <tr key={i.id} className="border-t border-outline">
                <td className="px-4 py-2">{`${i.scenarioId} · ${i.title}`}</td>
                <td className="px-4 py-2">{i.robotCode ?? '—'}</td>
                <td className="px-4 py-2">{formatDateTimeFull(i.injectedAt)}</td>
                <td className="px-4 py-2">{formatDateTimeFull(i.clearedAt ?? i.expiresAt)}</td>
                <td className="px-4 py-2">
                  <StatusBadge tone={i.status === 'ACTIVE' ? 'amber' : i.status === 'FAILED' ? 'red' : 'grey'}>{i.status}</StatusBadge>
                  {i.detail ? <span className="ml-2 text-xs text-red-ink">{i.detail}</span> : null}
                </td>
                <td className="px-4 py-2 text-right">
                  {i.status === 'ACTIVE' ? (
                    <Button size="sm" variant="outline" disabled={stop.isPending} onClick={() => stop.mutate(i.id)}>
                      {t('Stop')}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
            {injections.data?.length === 0 ? (
              <tr><td className="px-4 py-3 text-ink-2" colSpan={6}>{t('Nothing injected yet.')}</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  )
}
