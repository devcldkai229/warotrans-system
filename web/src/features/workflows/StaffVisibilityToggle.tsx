import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/client'
import { setWorkflowStaffVisibility } from '@/shared/api/workflows'
import { t } from '@/shared/i18n'
import { StatusBadge } from '@/shared/ui/StatusBadge'

/**
 * Whether Staff accounts see this workflow and its Jobs. A setting of the workflow code (every version), changed at
 * any time, published or not: robot care workflows (charging, return to park) are hidden from the warehouse floor.
 */
export function StaffVisibilityToggle({ workflowId, staffVisible, canWrite }: { workflowId: string; staffVisible: boolean; canWrite: boolean }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (next: boolean) => setWorkflowStaffVisibility(workflowId, next),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workflows'] })
      void queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] })
    },
  })

  if (!canWrite) {
    return staffVisible ? null : <StaffHiddenBadge />
  }

  return (
    <span className="inline-flex items-center gap-2">
      <label className="wf-staff-visibility inline-flex cursor-pointer items-center gap-1.5" title={t('Staff accounts see this workflow and its Jobs. Admins and Technicians always do.')}>
        <input
          type="checkbox"
          checked={mutation.isPending ? Boolean(mutation.variables) : staffVisible}
          disabled={mutation.isPending}
          onChange={(event) => mutation.mutate(event.target.checked)}
        />
        {t('Visible to Staff')}
      </label>
      {mutation.error ? (
        <span className="text-xs text-red-ink">
          {mutation.error instanceof ApiError ? mutation.error.message : t('Could not save.')}
        </span>
      ) : null}
    </span>
  )
}

export function StaffHiddenBadge() {
  return (
    <span title={t('Hidden from Staff accounts: only Admins and Technicians see it and its Jobs.')}>
      <StatusBadge tone="grey">{t('Admins / Technicians only')}</StatusBadge>
    </span>
  )
}
