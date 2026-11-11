import { useMemo, useState } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { SectionHead, SectionNote } from '@/features/management/SectionHead'
import type { AdminNotification } from '@/shared/api/contracts'
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '@/shared/api/notifications'
import { formatIsoDateTime, formatRelativeTime, humanize } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge, ToneDot } from '@/shared/ui/StatusBadge'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { notificationTarget, TYPE_TONE } from './notificationTarget'
import { localizedNotificationText } from './notificationText'

import { t } from '@/shared/i18n'
const PAGE_SIZE = 30
const TYPES: AdminNotification['type'][] = ['ALERT', 'WARNING', 'INFO', 'ASSIGNMENT', 'SYSTEM']

/**
 * WEB-NOTIF-01: the whole inbox, not just the newest few the bell shows. Filter by unread and type, page back through
 * older ones, open what a notification is about. Read state is the server's, shared with the bell: both use the
 * `['notifications']` query key, so reading here updates the bell and the other way round.
 */
export function NotificationsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [type, setType] = useState<AdminNotification['type'] | ''>('')

  const inbox = useInfiniteQuery({
    queryKey: ['notifications', 'page', unreadOnly, type],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listNotifications({ unreadOnly, type: type || undefined, skip: pageParam, take: PAGE_SIZE }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((count, page) => count + page.items.length, 0)
      return last.items.length > 0 && loaded < last.total ? loaded : undefined
    },
    // The hub invalidates this on every new notification; the poll covers a dropped connection.
    refetchInterval: 60_000,
  })

  // A notification raised while paging shifts the later pages by one, so the same one can arrive twice.
  const items = useMemo(() => {
    const seen = new Set<string>()
    return (inbox.data?.pages ?? []).flatMap((page) => page.items).filter((item) => !seen.has(item.id) && seen.add(item.id))
  }, [inbox.data])
  const total = inbox.data?.pages[0]?.total ?? 0
  const unreadCount = inbox.data?.pages[0]?.unreadCount ?? 0

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['notifications'] })
  const markRead = useMutation({ mutationFn: markNotificationRead, onSuccess: refresh })
  const markAllRead = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: refresh })

  function open(notification: AdminNotification) {
    const target = notificationTarget(notification)
    if (!notification.isRead) markRead.mutate(notification.id)
    if (target) navigate(target)
  }

  const filtered = unreadOnly || type !== ''

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1100px] px-10 pt-8 pb-16">
        <SectionHead
          title={t('Notifications')}
          hint={unreadCount > 0 ? t('{unreadCount} unread', { unreadCount }) : t('Everything raised for you, newest first.')}
        >
          <div role="group" aria-label={t('Show')} className="flex gap-1">
            <Button size="sm" variant={unreadOnly ? 'ghost' : 'tonal'} aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>{t('All')}</Button>
            <Button size="sm" variant={unreadOnly ? 'tonal' : 'ghost'} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>{t('Unread')}</Button>
          </div>
          <select
            className={controlClass('pill')}
            aria-label={t('Filter by type')}
            value={type}
            onChange={(event) => setType(event.target.value as AdminNotification['type'] | '')}
          >
            <option value="">{t('All types')}</option>
            {TYPES.map((value) => (
              <option key={value} value={value}>
                {humanize(value)}
              </option>
            ))}
          </select>
          <Button variant="outline" disabled={unreadCount === 0 || markAllRead.isPending} onClick={() => markAllRead.mutate()}>{t('Mark all as read')}</Button>
        </SectionHead>

        <Table>
          <thead>
            <tr>
              <Th className="w-8" />
              <Th>{t('Notification')}</Th>
              <Th>{t('Type')}</Th>
              <Th>{t('When')}</Th>
              <Th align="right">
                <span className="sr-only">{t('Actions')}</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {items.map((notification) => {
              const target = notificationTarget(notification)
              return (
                <Tr key={notification.id} className={notification.isRead ? undefined : 'bg-container'}>
                  <Td className="align-top">
                    {notification.isRead ? null : <span aria-label={t('Unread')} className="mt-1.5 block size-2 rounded-full bg-blue" />}
                  </Td>
                  <Td className="max-w-[520px] align-top">
                    <div className={notification.isRead ? 'text-ink-2' : 'font-medium text-ink'}>{localizedNotificationText(notification).title}</div>
                    <p className="mt-0.5 text-xs whitespace-pre-line text-ink-2">{localizedNotificationText(notification).content}</p>
                  </Td>
                  <Td className="align-top">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <ToneDot tone={notification.resolvedAt ? 'grey' : TYPE_TONE[notification.type]} />
                        {humanize(notification.type)}
                      </span>
                      {notification.resolvedAt ? <StatusBadge tone="grey">{t('Resolved')}</StatusBadge> : null}
                    </span>
                    {notification.kind ? <div className="mt-1 text-[11px] text-muted">{humanize(notification.kind)}</div> : null}
                  </Td>
                  <Td tone="faint" className="align-top whitespace-nowrap tabular-nums">
                    <span title={formatIsoDateTime(notification.createdAt)}>{formatRelativeTime(notification.createdAt)}</span>
                  </Td>
                  <Td align="right" className="align-top whitespace-nowrap">
                    <div className="flex justify-end gap-1.5">
                      {notification.isRead ? null : (
                        <Button size="sm" variant="ghost" disabled={markRead.isPending} onClick={() => markRead.mutate(notification.id)}>{t('Mark as read')}</Button>
                      )}
                      {target ? (
                        <Button size="sm" variant="tonal" onClick={() => open(notification)}>{t('Open')}</Button>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              )
            })}
            {inbox.isLoading ? <EmptyRow colSpan={5}>{t('Loading notifications…')}</EmptyRow> : null}
            {inbox.isError ? <EmptyRow colSpan={5}>{(inbox.error as Error).message}</EmptyRow> : null}
            {!inbox.isLoading && !inbox.isError && items.length === 0 ? (
              <EmptyRow colSpan={5}>{filtered ? t('No notifications match these filters.') : t('Nothing needs your attention.')}</EmptyRow>
            ) : null}
          </tbody>
        </Table>

        {items.length > 0 ? (
          <div className="mt-6 flex items-center justify-between gap-4">
            <SectionNote>{t('Showing {shown} of {total}', { shown: items.length, total })}</SectionNote>
            {inbox.hasNextPage ? (
              <Button variant="outline" disabled={inbox.isFetchingNextPage} onClick={() => void inbox.fetchNextPage()}>
                {inbox.isFetchingNextPage ? t('Loading…') : t('Load more')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
