import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { ROBOT_STATUS_TONE } from '@/shared/ui/statusTones'
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
    <div className="modal" role="presentation" onClick={onClose}>
      <div
        className="modal__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2 id="assign-title">Robot Assignment</h2>
            <p>Candidates evaluated by the dispatcher for {jobNo}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </header>

        {decision ? (
          <>
            <table>
              <thead>
                <tr>
                  <th>Robot</th>
                  <th>Status</th>
                  <th>Battery</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {decision.candidates.map((row) => (
                  <tr key={row.robotCode} className={row.selected ? 'is-assigned' : undefined}>
                    <td>
                      <strong>{row.robotCode}</strong>
                    </td>
                    <td>
                      <StatusBadge tone={ROBOT_STATUS_TONE[row.status]}>{row.status}</StatusBadge>
                    </td>
                    <td>{row.batteryPercent}%</td>
                    <td className="modal__score">
                      {row.selected ? (
                        <span className="modal__assigned">
                          <Icon name="check" size={10} /> Selected
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="modal__note">Decision type: {decision.type}</p>
          </>
        ) : (
          <p className="modal__note">No dispatch decision has been recorded for this Job yet.</p>
        )}
      </div>
    </div>
  )
}
