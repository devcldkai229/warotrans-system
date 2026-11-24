import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '@/shared/api/client'
import { getMapPublishCheck, publishMapVersion, type MapPublishIssue } from '@/shared/api/navigation'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import { Button } from '@/shared/ui/Button'
import { controlClass } from '@/shared/ui/controlClass'
import { Modal } from '@/shared/ui/Dialog'

interface PublishMapDialogProps {
  mapId: string
  mapCode: string
  onClose: () => void
  onPublished: () => void | Promise<void>
}

const TONE: Record<string, string> = {
  BLOCK: 'border-red/40 bg-red-soft text-red-ink',
  WARN: 'border-amber/40 bg-amber-soft text-amber-ink',
  INFO: 'border-blue/30 bg-blue-soft text-blue-ink',
}

/** The issue in the interface language by its code; the server's English message for a code it does not know. */
const ISSUE_TEXT: Record<string, string> = {
  jobs_running: '{count} Job(s) are running on the current map ({jobs}). Let them finish (or cancel them) first.',
  jobs_move_to_new_map: '{count} Job(s) not started yet ({jobs}) will run on {map}.',
  workflow_place_unknown: 'Workflow {workflow} v{version} ({where}) names a place that no longer exists on any map.',
  workflow_group_missing: 'Workflow {workflow} v{version} ({where}) prefers group {place}, which {map} does not have: robots will use any free endpoint of that type.',
  workflow_place_missing: 'Workflow {workflow} v{version} ({where}) needs {place}, which {map} does not have. Add it (same name) or change the workflow.',
  requests_move_to_new_map: '{count} request(s) not started yet ({requests}) will use {map}.',
  request_place_missing: 'Request {request} uses {places}, which {map} does not have. Add them (same name), or cancel or reject the request.',
  robots_on_old_map: '{count} robot(s) ({robots}) stay on the current map: move them to {map} after publishing (Fleet), then localize them.',
  robot_home_missing: "{robot}'s home endpoint {place} is not on {map}: its Jobs will be refused.",
}

function issueText(issue: MapPublishIssue): string {
  const template = ISSUE_TEXT[issue.code]
  return template && issue.args ? t(template, issue.args) : issue.message
}

const HEADING: Record<string, () => string> = {
  BLOCK: () => t('Breaks on this map'),
  WARN: () => t('Worth knowing'),
  INFO: () => t('Done automatically when publishing'),
}

/**
 * Publishing a map version asks every module first (like OTTO's publish warnings): workflows that name places the new
 * map lacks, Jobs still running on the current map (always refused), requests and Jobs that will move to it, robots on
 * the old map. Only overridable blocks may be published over, with a reason.
 */
export function PublishMapDialog({ mapId, mapCode, onClose, onPublished }: PublishMapDialogProps) {
  const check = useQuery({
    queryKey: ['navigation', 'publish-check', mapId],
    queryFn: () => getMapPublishCheck(mapId),
    staleTime: 0,
  })
  const [reason, setReason] = useState('')
  const report = check.data
  const force = Boolean(report && !report.canPublish && report.canOverride)
  const publish = useMutation({
    mutationFn: () => publishMapVersion(mapId, force ? { force: true, reason: reason.trim() } : undefined),
    onSuccess: async () => {
      await onPublished()
      onClose()
    },
    onError: () => void check.refetch(),
  })

  const groups = (['BLOCK', 'WARN', 'INFO'] as const)
    .map((severity) => ({ severity, items: (report?.issues ?? []).filter((i) => i.severity === severity) }))
    .filter((g) => g.items.length > 0)

  return (
    <Modal
      title={t('Publish {code}', { code: mapCode })}
      subtitle={report?.replacedMapCodes.length
        ? t('Replaces {codes}. Checked against workflows, Jobs, requests and robots.', { codes: report.replacedMapCodes.join(', ') })
        : t('Checked against workflows, Jobs, requests and robots.')}
      onClose={onClose}
      width="w-[680px]"
    >
      <div className="flex flex-col gap-4 px-6 pt-4 pb-6">
        {check.isLoading ? <p className="text-sm text-muted">{t('Checking…')}</p> : null}
        {check.isError ? (
          <p className="text-sm text-red">{check.error instanceof ApiError ? check.error.message : t('The check could not run.')}</p>
        ) : null}
        {report && groups.length === 0 ? (
          <p className="rounded border border-green/40 bg-green-soft px-3 py-2 text-sm text-green-ink">{t('Nothing breaks: every workflow finds its places on this map.')}</p>
        ) : null}
        {groups.map((group) => (
          <section key={group.severity}>
            <h3 className="mb-2 text-sm font-medium">{HEADING[group.severity]()}</h3>
            <ul className="flex flex-col gap-2">
              {group.items.map((issue: MapPublishIssue, index) => (
                <li key={`${issue.code}-${index}`} className={cx('rounded border px-3 py-2 text-sm', TONE[issue.severity])}>
                  {issueText(issue)}
                  {issue.severity === 'BLOCK' && !issue.overridable ? (
                    <span className="mt-1 block text-xs font-medium">{t('Cannot be published over.')}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {force ? (
          <label className="text-sm text-ink-2">{t('Reason to publish anyway')}
            <textarea
              className={cx(controlClass(), 'mt-1 block min-h-20 w-full')}
              value={reason}
              maxLength={500}
              placeholder={t('e.g. EP-QUEUE-B was removed on purpose; the workflow is changed next.')}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        ) : null}
        {publish.isError ? (
          <p className="text-sm text-red">{publish.error instanceof ApiError ? publish.error.message : t('Publish failed')}</p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          {report && (report.canPublish || report.canOverride) ? (
            <Button
              variant={force ? 'outline' : 'primary'}
              disabled={publish.isPending || (force && reason.trim().length < 5)}
              onClick={() => publish.mutate()}
            >
              {publish.isPending ? t('Publishing…') : force ? t('Publish anyway') : t('Publish')}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
