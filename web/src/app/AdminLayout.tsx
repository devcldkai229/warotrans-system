import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Icon, type IconName } from '@/shared/ui/Icon'
import { initialsOf, useAuth } from '@/features/auth/authContext'
import './admin.css'

interface SidebarItem {
  label: string
  to: string
  icon: IconName
}

interface SidebarGroup {
  label: string
  prefix: string
  items: SidebarItem[]
}

const GROUPS: SidebarGroup[] = [
  {
    label: 'ADMIN',
    prefix: '/admin',
    items: [
      { label: 'Accounts', to: '/admin/accounts', icon: 'user' },
      { label: 'Roles', to: '/admin/roles', icon: 'shield' },
    ],
  },
  {
    label: 'DATA MANAGEMENT',
    prefix: '/data',
    items: [
      { label: 'Product Management', to: '/data/products', icon: 'box' },
      { label: 'Product Categories', to: '/data/categories', icon: 'list' },
      { label: 'Inventory Data', to: '/data/inventory', icon: 'layers' },
      { label: 'Storage Location', to: '/data/storage-locations', icon: 'map' },
    ],
  },
]

/** Sidebar console for the Account and Data management screens (opened from the profile menu). */
export function AdminLayout() {
  const { pathname } = useLocation()
  const { account } = useAuth()
  if (!account) return null

  const group = GROUPS.find((candidate) => pathname.startsWith(candidate.prefix)) ?? GROUPS[0]

  return (
    <div className="admin">
      <aside className="admin__side">
        <Link to="/monitor/fleet" className="admin__brand" aria-label="WaroTrans home">
          <span className="admin__logo">WT</span>
          <span className="admin__brand-text">
            <strong>WAROTRANS</strong>
            <small>FLEET ENGINE</small>
          </span>
        </Link>

        <Link to="/dashboard" className="admin__back">
          <Icon name="arrowLeft" size={14} /> Back to Dashboard
        </Link>

        <p className="admin__group">{group.label}</p>
        <nav className="admin__nav" aria-label={group.label}>
          {group.items.map((item) => (
            <NavLink key={item.to} to={item.to} className="admin__link">
              <Icon name={item.icon} size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="admin__user">
          <span className="admin__avatar">{initialsOf(account.fullName)}</span>
          <span>
            <strong>{account.fullName}</strong>
            <small>{account.role === 'ADMIN' ? 'Administrator' : 'Staff'}</small>
          </span>
        </div>
      </aside>

      <main className="admin__main">
        <Outlet />
      </main>
    </div>
  )
}
