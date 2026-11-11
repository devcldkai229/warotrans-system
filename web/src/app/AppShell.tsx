import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { cx } from '@/shared/lib/cx'
import { IconButton } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'
import { initialsOf, roleLabel, useAuth } from '@/features/auth/authContext'
import { PERMISSIONS, type Permission } from '@/shared/auth/permissions'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { useTheme } from '@/shared/theme/theme'
import { Wordmark } from './Wordmark'
import { t } from '@/shared/i18n'
import { LanguageSwitcher } from '@/shared/i18n/LanguageSwitcher'

interface NavItem {
  label: string
  to: string
  /** Shown only when the session holds this permission (the API would refuse the screen's calls otherwise). */
  requires: Permission
}

interface NavGroup {
  label: string
  /** Route prefix: the group is active on every screen under it. */
  to: string
  requires?: Permission
  items?: NavItem[]
}

const NAV: NavGroup[] = [
  {
    label: t('Monitor'),
    to: '/monitor',
    items: [
      { label: t('Fleet'), to: '/monitor/fleet', requires: PERMISSIONS.robotRead },
      { label: t('Transport requests'), to: '/monitor/requests', requires: PERMISSIONS.transportRead },
      { label: t('Schedules'), to: '/monitor/schedules', requires: PERMISSIONS.transportRead },
      { label: t('Jobs'), to: '/monitor/jobs', requires: PERMISSIONS.jobRead },
    ],
  },
  {
    label: t('Configure'),
    to: '/configure',
    items: [
      { label: t('Facility'), to: '/configure/facility', requires: PERMISSIONS.mapRead },
      { label: t('Workflows'), to: '/configure/workflows', requires: PERMISSIONS.workflowRead },
    ],
  },
  {
    label: t('Operations'),
    to: '/operations',
    items: [
      { label: t('Issues'), to: '/operations/issues', requires: PERMISSIONS.issueRead },
      { label: t('Notifications'), to: '/operations/notifications', requires: PERMISSIONS.notificationRead },
      { label: t('Audit log'), to: '/operations/audit', requires: PERMISSIONS.auditRead },
    ],
  },
  { label: t('Statistics'), to: '/dashboard', requires: PERMISSIONS.statisticsRead },
]

const MENU_ITEM = 'flex h-9 w-full items-center rounded-sm px-3 text-left text-sm transition-colors duration-200 hover:bg-container-high'

export function AppShell() {
  const { pathname } = useLocation()
  const { account, signOut, can } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  if (!account) return null

  const nav = NAV.flatMap((group) => {
    if (group.requires && !can(group.requires)) return []
    const items = group.items?.filter((item) => can(item.requires))
    if (group.items && !items?.length) return []
    return [{ ...group, items }]
  })
  const mayManage = can(PERMISSIONS.userManage) || can(PERMISSIONS.warehouseWrite)

  return (
    <div className="flex h-svh min-w-[1100px] flex-col bg-surface">
      <header className="relative z-50 flex h-14 flex-none items-center gap-8 border-b border-outline-soft px-6">
        <Link to="/monitor/fleet" aria-label={t('WaroTrans home')}>
          <Wordmark />
        </Link>

        <nav className="flex items-center gap-1" aria-label={t('Main')}>
          {nav.map((group) => {
            const active = pathname.startsWith(group.to)
            return (
              <div key={group.label} className="group relative">
                <NavLink
                  to={group.items ? group.items[0].to : group.to}
                  className={cx(
                    'flex h-9 items-center gap-1.5 rounded-md px-3.5 text-sm font-medium transition-colors duration-200',
                    active ? 'bg-container-high text-ink' : 'text-ink-2 hover:bg-container-high hover:text-ink',
                  )}
                >
                  {group.label}
                  {group.items ? <Icon name="chevronDown" size={14} className="text-muted" /> : null}
                </NavLink>
                {group.items ? (
                  // The top padding bridges the gap to the link, so the menu stays open while the pointer moves down.
                  <div className="invisible absolute top-full left-0 pt-2 opacity-0 transition-opacity duration-200 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                    <div className="min-w-56 rounded-md bg-surface p-2 shadow-float">
                      {group.items.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          className={({ isActive }) => cx(MENU_ITEM, isActive ? 'bg-container-high font-medium text-ink' : 'text-ink-2')}
                        >
                          {item.label}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher compact />
          <IconButton
            aria-label={theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')}
            title={theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')}
            onClick={toggleTheme}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
          </IconButton>
          {can(PERMISSIONS.notificationRead) ? <NotificationBell /> : null}

          <div className="relative">
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-full pr-3 pl-1 text-sm text-ink transition-colors duration-200 hover:bg-container-high"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((open) => !open)}
            >
              <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-medium text-white">
                {initialsOf(account.fullName)}
              </span>
              {account.fullName}
              <Icon name="chevronDown" size={14} className="text-muted" />
            </button>
            {userMenuOpen ? (
              <>
                <div className="fixed inset-0 z-60" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute top-[calc(100%+8px)] right-0 z-61 min-w-56 rounded-md bg-surface p-2 shadow-float" role="menu">
                  <div className="mb-2 border-b border-outline-soft px-3 pt-1 pb-3">
                    <p className="font-medium">{account.fullName}</p>
                    <p className="text-xs text-muted">
                      {account.username}, {roleLabel(account.role)}
                    </p>
                  </div>
                  {mayManage ? (
                    <Link to="/management" role="menuitem" className={MENU_ITEM} onClick={() => setUserMenuOpen(false)}>{t('Management')}</Link>
                  ) : null}
                  <Link to="/change-password" role="menuitem" className={MENU_ITEM} onClick={() => setUserMenuOpen(false)}>{t('Change password')}</Link>
                  <button type="button" role="menuitem" className={cx(MENU_ITEM, 'text-red-ink')} onClick={signOut}>{t('Sign out')}</button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
