import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { cx } from '@/shared/lib/cx'
import { Icon } from '@/shared/ui/Icon'
import { initialsOf, useAuth } from '@/features/auth/authContext'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { Wordmark } from './Wordmark'

interface NavGroup {
  label: string
  /** Route prefix: the group is active on every screen under it. */
  to: string
  items?: { label: string; to: string }[]
}

const NAV: NavGroup[] = [
  {
    label: 'Monitor',
    to: '/monitor',
    items: [
      { label: 'Fleet', to: '/monitor/fleet' },
      { label: 'Transport requests', to: '/monitor/requests' },
    ],
  },
  {
    label: 'Configure',
    to: '/configure',
    items: [
      { label: 'Facility', to: '/configure/facility' },
      { label: 'Workflows', to: '/configure/workflows' },
    ],
  },
  { label: 'Statistics', to: '/dashboard' },
]

const MENU_ITEM = 'flex h-9 w-full items-center rounded-sm px-3 text-left text-sm transition-colors duration-200 hover:bg-container-high'

export function AppShell() {
  const { pathname } = useLocation()
  const { account, signOut } = useAuth()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  if (!account) return null

  return (
    <div className="flex h-svh min-w-[1100px] flex-col bg-surface">
      <header className="relative z-50 flex h-14 flex-none items-center gap-8 px-6">
        <Link to="/monitor/fleet" aria-label="WaroTrans home">
          <Wordmark />
        </Link>

        <nav className="flex items-center gap-1" aria-label="Main">
          {NAV.map((group) => {
            const active = pathname.startsWith(group.to)
            return (
              <div key={group.label} className="group relative">
                <NavLink
                  to={group.items ? group.items[0].to : group.to}
                  className={cx(
                    'flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm transition-colors duration-200',
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
          <NotificationBell />

          <div className="relative">
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-full pr-3 pl-1 text-sm text-ink transition-colors duration-200 hover:bg-container-high"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((open) => !open)}
            >
              <span className="grid size-7 place-items-center rounded-full bg-ink text-xs font-medium text-surface">
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
                      {account.username}, {account.role === 'ADMIN' ? 'administrator' : 'staff'}
                    </p>
                  </div>
                  {account.role === 'ADMIN' ? (
                    <Link to="/management" role="menuitem" className={MENU_ITEM} onClick={() => setUserMenuOpen(false)}>
                      Management
                    </Link>
                  ) : null}
                  <button type="button" role="menuitem" className={cx(MENU_ITEM, 'text-red-ink')} onClick={signOut}>
                    Sign out
                  </button>
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
