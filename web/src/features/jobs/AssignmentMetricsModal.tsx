import { Modal } from '@/shared/ui/Dialog'
import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { humanize } from '@/shared/lib/format'
import { ROBOT_STATUS_TONE } from '@/shared/ui/statusTones'
import { Table, Td, Th, Tr } from '@/shared/ui/Table'
import type { DispatchDecision } from '@/shared/api/contracts'

interface AssignmentMetricsModalProps {
  jobNo: string
  /** Null when the backend has no DispatchDecision for this Job. */
  decision: DispatchDecision | null
  onClose: () => void
}

// Shows what the dispatcher recorded in DispatchDecision.candidateEvaluations. The backend ranks candidates by
// status and battery only, so no workload / distance / score columns are shown.
export function AssignmentMetricsModal({ jobNo, decision, onClose }: AssignmentMetricsModalProps) {
  return (
    <Modal
      title="Robot assignment"
      subtitle={`Candidates the dispatcher evaluated for ${jobNo}`}
      width="w-[640px]"
      onClose={onClose}
    >
      <div className="px-6 pt-4 pb-6">
        {decision ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th className="pl-0">Robot</Th>
                  <Th>Status</Th>
                  <Th align="right">Battery</Th>
                  <Th align="right" className="pr-0">
                    Result
                  </Th>
                </tr>
              </thead>
              <tbody>
                {decision.candidates.map((row) => (
                  <Tr key={row.robotCode}>
                    <Td tone="strong" className="pl-0">
                      {row.robotCode}
                    </Td>
                    <Td>
                      <StatusBadge tone={ROBOT_STATUS_TONE[row.status]}>{row.status}</StatusBadge>
                    </Td>
                    <Td align="right">{row.batteryPercent}%</Td>
                    <Td align="right" className="pr-0">
                      {row.selected ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-green-ink">
                          <Icon name="check" size={14} strokeWidth={2.25} /> Selected
                        </span>
                      ) : (
                        '—'
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <p className="mt-4 text-xs text-muted">Decision type: {humanize(decision.type).toLowerCase()}</p>
          </>
        ) : (
          <p className="text-sm text-muted">No dispatch decision has been recorded for this job yet.</p>
        )}
      </div>
    </Modal>
  )
}
