import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AI_ENABLED, aiApi } from '@/shared/api/ai'
import { t } from '@/shared/i18n'
import { Button } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'

/**
 * Runs the AI's rules on this journal and opens its case (the AI investigates with the journal's full evidence:
 * events, every robot's trajectory and plans, the recordings). Shown only when the build enables the AI.
 */
export function InvestigateWithAiButton({ journalId }: { journalId: string }) {
  const navigate = useNavigate()
  const run = useMutation({
    mutationFn: () => aiApi.fromJournal(journalId),
    onSuccess: (found) => {
      if (found.caseId) navigate(`/tech/incidents/${found.caseId}`)
    },
  })
  if (!AI_ENABLED) return null
  return (
    <span className="flex items-center gap-2">
      <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate()}>
        <Icon name="search" size={14} />
        {run.isPending ? t('Investigating…') : t('Investigate with AI')}
      </Button>
      {run.error ? <span className="text-xs text-red-ink">{(run.error as Error).message}</span> : null}
    </span>
  )
}
