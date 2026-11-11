import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/authContext'
import type { Robot } from '@/shared/api/contracts'
import { listIssues } from '@/shared/api/operations'
import { PERMISSIONS } from '@/shared/auth/permissions'
import { t } from '@/shared/i18n'
import { formatRelativeTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { Dialog } from '@/shared/ui/Dialog'
import { Field, FormError } from '@/shared/ui/Field'
import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { controlClass } from '@/shared/ui/controlClass'
import { acknowledgeFault, findAcknowledgement } from './robotFault'

/**
 * WEB-FLEET-04: the robot's current error and whether somebody has acknowledged it. Shown only while the robot reports
 * an error. An acknowledgement says "seen, I have it"; it never clears the error (see robotFault.ts for what it is made
 * of and its limits).
 */
export function RobotFaultCard({ robot }: { robot: Pick<Robot, 'id' | 'code' | 'errorCode'> }) {
  const { account, can } = useAuth()
  const queryClient = useQueryClient()
  const code = robot.errorCode?.trim() || null
  const mayRead = can(PERMISSIONS.issueRead)
  // Recording one creates an Issue, hands it to the person and acknowledges it.
  const mayAcknowledge = can(PERMISSIONS.issueCreate) && can(PERMISSIONS.issueManage)

  const issues = useQuery({
    queryKey: ['issues', 'robot-fault', robot.id],
    queryFn: () => listIssues({ robotId: robot.id, take: 50 }),
    enabled: code !== null && mayRead,
    refetchInterval: 15_000,
    retry: false,
  })

  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const acknowledge = useMutation({
    mutationFn: () =>
      acknowledgeFault({ robotId: robot.id, code: code!, accountId: account!.id, fullName: account!.fullName, reason }),
    onSuccess: () => {
      setAsking(false)
      setReason('')
      void queryClient.invalidateQueries({ queryKey: ['issues'] })
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: ['issues', 'robot-fault', robot.id] }),
  })

  if (code === null) return null

  const found = issues.data ? findAcknowledgement(issues.data.items, robot.id, code) : null
  const acknowledged = found?.state === 'acknowledged'

  return (
    <section
      aria-label={t('Robot error')}
      className={`rounded-md p-4 ${acknowledged ? 'bg-amber-soft text-amber-ink' : 'bg-red-soft text-red-ink'}`}
    >
      <div className="flex gap-3">
        <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <strong className="font-medium">{t('The robot reports an error')}</strong>
          <p className="mt-0.5 font-mono text-xs break-words">{code}</p>

          {found === null ? (
            mayRead && issues.isError ? <p className="mt-2 text-xs text-ink-2">{t('Issues are not available to you.')}</p> : null
          ) : found.state === 'acknowledged' ? (
            <p className="mt-2 text-xs text-ink-2">
              {found.by
                ? t('Acknowledged by {name} {age}.', { name: found.by, age: formatRelativeTime(found.issue.reportedAt) })
                : t('Acknowledged {age}.', { age: formatRelativeTime(found.issue.reportedAt) })}
              {found.reason ? <span className="mt-0.5 block text-ink">{found.reason}</span> : null}
              <Link to={`/operations/issues/${found.issue.id}`} className="mt-1 inline-flex items-center gap-2 underline-offset-2 hover:underline">
                {found.issue.code}
                <StatusBadge tone="grey">{found.issue.status}</StatusBadge>
              </Link>
            </p>
          ) : found.state === 'pending' ? (
            <p className="mt-2 text-xs text-ink-2">
              {t('The acknowledgement was started but not finished.')}{' '}
              <Link to={`/operations/issues/${found.issue.id}`} className="underline-offset-2 hover:underline">
                {found.issue.code}
              </Link>
            </p>
          ) : (
            <p className="mt-2 text-xs text-ink-2">
              {found.closed
                ? t('An earlier acknowledgement ({issue}) is {status}, but the robot still reports this error.', {
                    issue: found.closed.code,
                    status: found.closed.status.toLowerCase(),
                  })
                : t('Nobody has acknowledged this error yet.')}
            </p>
          )}

          <p className="mt-2 text-[11px] text-ink-2">
            {t('Acknowledging records that someone has seen it. It does not clear the error: that ends when the robot stops reporting it.')}
          </p>

          {mayAcknowledge && !acknowledged && found !== null ? (
            <Button className="mt-3" variant="primary" size="sm" onClick={() => setAsking(true)}>
              <Icon name="check" size={14} /> {found.state === 'pending' ? t('Finish acknowledging') : t('Acknowledge error')}
            </Button>
          ) : null}
        </div>
      </div>

      {asking ? (
        <Dialog
          title={t('Acknowledge the error of {code}', { code: robot.code })}
          submitLabel={t('Acknowledge')}
          busy={acknowledge.isPending}
          onClose={() => {
            setAsking(false)
            acknowledge.reset()
          }}
          onSubmit={() => acknowledge.mutate()}
        >
          <p className="text-sm text-ink-2">
            {t('This records that you have seen "{error}" and are dealing with it. It is saved as an issue assigned to you.', { error: code })}
          </p>
          <Field label={t('What did you see or do? (optional)')}>
            <textarea
              className={controlClass()}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              autoFocus
            />
          </Field>
          {acknowledge.isError ? <FormError>{(acknowledge.error as Error).message || t('The error could not be acknowledged.')}</FormError> : null}
        </Dialog>
      ) : null}
    </section>
  )
}
