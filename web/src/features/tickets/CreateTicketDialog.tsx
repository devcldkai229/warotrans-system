import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/client'
import { createTicket, TICKET_TYPES, updateTicket, type TechnicalTicket, type TicketType } from '@/shared/api/tickets'
import { t } from '@/shared/i18n'
import { Dialog } from '@/shared/ui/Dialog'
import { Field, FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { defaultChecklist, TYPE_HINT, TYPE_LABEL } from './ticketModel'

/**
 * Opens a technical ticket on a robot. The robot's state and health are kept with it by the server, and the ticket
 * starts with the usual checklist for its kind.
 */
export function CreateTicketDialog({
  robotId,
  robotCode,
  initialType = 'INSPECTION',
  initialTitle = '',
  jobId,
  issueId,
  onClose,
  onCreated,
}: {
  robotId: string
  robotCode: string
  initialType?: TicketType
  initialTitle?: string
  jobId?: string
  issueId?: string
  onClose: () => void
  onCreated?: (ticket: TechnicalTicket) => void
}) {
  const queryClient = useQueryClient()
  const [type, setType] = useState<TicketType>(initialType === 'MAINTENANCE' ? 'INSPECTION' : initialType)
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: async () => {
      const ticket = await createTicket(robotId, {
        type,
        title: title.trim() || `${TYPE_LABEL[type]} ${robotCode}`,
        description: description.trim() || undefined,
        jobId,
        issueId,
      })
      const checklist = defaultChecklist(type)
      return checklist.length > 0 ? updateTicket(ticket.id, { checklist }) : ticket
    },
    onSuccess: (ticket) => {
      void queryClient.invalidateQueries({ queryKey: ['tickets'] })
      void queryClient.invalidateQueries({ queryKey: ['robot-history'] })
      onCreated?.(ticket)
      onClose()
    },
    onError: (failure) => setError(failure instanceof ApiError ? failure.message : t('The ticket could not be saved.')),
  })

  return (
    <Dialog
      title={t('New technical ticket for {robot}', { robot: robotCode })}
      submitLabel={t('Open ticket')}
      onClose={onClose}
      onSubmit={() => create.mutate()}
      busy={create.isPending}
    >
      <Field label={t('Kind')} hint={TYPE_HINT[type]}>
        <select className={controlClass()} value={type} onChange={(event) => setType(event.target.value as TicketType)}>
          {TICKET_TYPES.filter((value) => value !== 'MAINTENANCE').map((value) => (
            <option key={value} value={value}>
              {TYPE_LABEL[value]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('Title')}>
        <input
          className={controlClass()}
          value={title}
          maxLength={200}
          placeholder={t('e.g. Lidar data stale after a bump')}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>
      <Field label={t('What was seen / why')}>
        <textarea
          className={controlClass('area', 'min-h-24')}
          value={description}
          maxLength={4000}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <p className="text-xs text-muted">{t('The robot\'s status, battery, position and health are saved with the ticket.')}</p>
      {error ? <FormError>{error}</FormError> : null}
    </Dialog>
  )
}
