import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Icon } from '@/shared/ui/Icon'
import { initialsOf, useAuth } from '@/features/auth/authContext'
import './AppShell.css'

interface NavGroup {
  label: string
  to: string
  icon: 'radio' | 'settings' | 'sliders'
  items?: { label: string; to: string }[]
}

const NAV: NavGroup[] = [
  {
    label: 'Monitor',
    to: '/monitor',
    icon: 'radio',
    items: [
      { label: 'Fleet', to: '/monitor/fleet' },
      { label: 'Transport Requests', to: '/monitor/requests' },
    ],
  },
  {
    label: 'Configure',
    to: '/configure',
    icon: 'settings',
    items: [{ label: 'Facility', to: '/configure/facility' }],
  },
  { label: 'Statistics', to: '/dashboard', icon: 'sliders' },
]

export function AppShell() {
  const { pathname } = useLocation()
  const { account, signOut } = useAuth()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  if (!account) return null

  return (
    <div className="shell">
      <header className="shell__bar">
        <Link to="/monitor/fleet" className="shell__brand" aria-label="WaroTrans home">
          <span className="shell__logo">WT</span>
          <span className="shell__brand-text">
            <span className="shell__brand-name">
              WARO<span>TRANS</span>
            </span>
            <span className="shell__brand-sub">FLEET ENGINE</span>
          </span>
        </Link>

        <nav className="shell__nav" aria-label="Main">
          {NAV.map((group) => (
            <div key={group.label} className="shell__nav-group">
              <NavLink
                to={group.items ? group.items[0].to : group.to}
                className={`shell__nav-link${pathname.startsWith(group.to) ? ' is-active' : ''}`}
              >
                <Icon name={group.icon} size={14} />
                {group.label}
              </NavLink>
              {group.items ? (
                <div className="shell__menu">
                  {group.items.map((item) => (
                    <NavLink key={item.to} to={item.to} className="shell__menu-item">
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </nav>

        <div className="shell__right">
          <button type="button" className="shell__bell" aria-label="Notifications">
            <Icon name="bell" size={18} />
            <span className="shell__bell-dot" />
          </button>
          <div className="shell__user-wrap">
            <button
              type="button"
              className="shell__user"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((open) => !open)}
            >
              <span className="shell__avatar">{initialsOf(account.fullName)}</span>
              <span className="shell__user-text">
                <strong>{account.fullName}</strong>
                <span>{account.role === 'ADMIN' ? 'Administrator' : 'Staff'}</span>
              </span>
              <Icon name="chevronDown" size={14} />
            </button>
            {userMenuOpen ? (
              <>
                <div className="shell__backdrop" onClick={() => setUserMenuOpen(false)} />
                <div className="shell__usermenu" role="menu">
                  <div className="shell__usermenu-head">
                    <strong>{account.fullName}</strong>
                    <span>{account.username}</span>
                  </div>
                  {account.role === 'ADMIN' ? (
                    <Link to="/management" role="menuitem" onClick={() => setUserMenuOpen(false)}>
                      Management
                    </Link>
                  ) : null}
                  <button type="button" role="menuitem" className="is-danger" onClick={signOut}>
                    Sign out
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </header>
      <div className="shell__body">
        <Outlet />
      </div>
    </div>
  )
}
