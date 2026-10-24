import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { AdminNotification } from '@/shared/api/contracts'
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '@/shared/api/notifications'
import { cx } from '@/shared/lib/cx'
import { formatRelativeTime } from '@/shared/lib/format'
import { useNotificationsHub } from '@/shared/realtime/useNotificationsHub'
import { IconButton } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'
import { ToneDot } from '@/shared/ui/StatusBadge'
import type { Tone } from '@/shared/ui/statusTones'

const TYPE_TONE: Record<AdminNotification['type'], Tone> = {
  ALERT: 'red',
  WARNING: 'amber',
  INFO: 'blue',
  ASSIGNMENT: 'blue',
  SYSTEM: 'grey',
}

/** Where a notification leads: the live page of its job, the fleet for a robot, the request list for a request. */
function targetOf(notification: AdminNotification): string | null {
  if (notification.entityType === 'JOB' && notification.entityId) return `/monitor/live/${notification.entityId}`
  if (notification.entityType === 'ROBOT') return '/monitor/fleet'
  if (notification.entityType === 'REQUEST') return '/monitor/requests'
  return null
}

/** The bell in the top bar: unread count, and a list of what needs an admin (failed jobs, offline robots …). */
export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const inbox = useQuery({
    queryKey: ['notifications'],
    queryFn: () => listNotifications({ take: 30 }),
    // The hub pushes new ones at once; the poll is the fallback when the connection is down.
    refetchInterval: 60_000,
  })

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }, [queryClient])
  useNotificationsHub({ notificationCreated: refresh })

  const markRead = useMutation({ mutationFn: markNotificationRead, onSuccess: refresh })
  const markAllRead = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: refresh })

  const unread = inbox.data?.unreadCount ?? 0
  const items = inbox.data?.items ?? []

  function openNotification(notification: AdminNotification) {
    if (!notification.isRead) markRead.mutate(notification.id)
    const target = targetOf(notification)
    if (target) {
      setOpen(false)
      navigate(target)
    }
  }

  return (
    <div className="relative">
      <IconButton
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="bell" size={18} />
        {unread > 0 ? (
          <span className="absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 text-[10px] leading-none font-medium text-white ring-2 ring-surface">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </IconButton>

      {open ? (
        <>
          <div className="fixed inset-0 z-60" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Notifications"
            className="absolute top-[calc(100%+8px)] right-0 z-61 w-[420px] overflow-hidden rounded-md bg-surface shadow-float"
          >
            <header className="flex items-center justify-between gap-3 border-b border-outline-soft px-4 py-3">
              <h2 className="text-base font-medium">Notifications</h2>
              <button
                type="button"
                className="text-xs text-ink-2 transition-colors hover:text-ink disabled:text-muted disabled:hover:text-muted"
                disabled={unread === 0 || markAllRead.isPending}
                onClick={() => markAllRead.mutate()}
              >
                Mark all as read
              </button>
            </header>

            <div className="max-h-[28rem] overflow-y-auto">
              {inbox.error ? (
                <p role="alert" className="px-4 py-6 text-sm text-red-ink">
                  {(inbox.error as Error).message}
                </p>
              ) : inbox.isLoading ? (
                <p className="px-4 py-6 text-sm text-muted">Loading…</p>
              ) : items.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted">Nothing needs your attention.</p>
              ) : (
                <ul>
                  {items.map((notification) => (
                    <li key={notification.id} className="border-b border-outline-soft last:border-b-0">
                      <button
                        type="button"
                        className={cx(
                          'flex w-full gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-container-high',
                          !notification.isRead && 'bg-container',
                        )}
                        onClick={() => openNotification(notification)}
                      >
                        <span className="mt-1.5 flex-none">
                          <ToneDot tone={notification.resolvedAt ? 'grey' : TYPE_TONE[notification.type]} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cx(
                              'block truncate text-sm',
                              notification.isRead ? 'text-ink-2' : 'font-medium text-ink',
                            )}
                          >
                            {notification.title}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-xs text-ink-2">{notification.content}</span>
                          <span className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                            {formatRelativeTime(notification.createdAt)}
                            {notification.resolvedAt ? (
                              <span className="rounded-full bg-container-high px-2 py-0.5 text-ink-2">Resolved</span>
                            ) : null}
                          </span>
                        </span>
                        {!notification.isRead ? (
                          <span aria-label="Unread" className="mt-2 size-2 flex-none rounded-full bg-blue" />
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
