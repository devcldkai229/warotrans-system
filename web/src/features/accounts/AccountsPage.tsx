import { useEffect, useMemo, useState } from 'react'
import { AdminPage } from '@/app/AdminPage'
import type { Account, AccountRole, AccountStatus } from '@/shared/api/contracts'
import { formatIsoDateTime } from '@/shared/lib/format'
import { AccountFormDialog } from './AccountFormDialog'
import { ACCOUNT_ROLES } from './constants'
import { listAccounts } from './api'

const STATUS_PILL: Record<AccountStatus, { label: string; tone: 'green' | 'grey' | 'red' }> = {
  ACTIVE: { label: 'Active', tone: 'green' },
  INACTIVE: { label: 'Inactive', tone: 'grey' },
  LOCKED: { label: 'Locked', tone: 'red' },
}

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<AccountRole | ''>('')
  const [editing, setEditing] = useState<Account | 'new' | null>(null)

  useEffect(() => {
    let cancelled = false
    listAccounts()
      .then((items) => {
        if (cancelled) return
        setAccounts(items)
        setLoadState('ready')
      })
      .catch(() => {
        if (!cancelled) setLoadState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return accounts.filter(
      (account) =>
        (roleFilter === '' || account.role === roleFilter) &&
        (needle === '' ||
          account.username.toLowerCase().includes(needle) ||
          account.email.toLowerCase().includes(needle)),
    )
  }, [accounts, query, roleFilter])

  const active = accounts.filter((account) => account.status === 'ACTIVE').length
  const notActive = accounts.length - active

  // TODO(backend): the Identity API only lists accounts so far. Create, edit and status changes below stay in
  // local state and are lost on reload; the API will own these transitions once the endpoints exist.
  function setStatus(id: string, status: AccountStatus) {
    setAccounts((current) => current.map((account) => (account.id === id ? { ...account, status } : account)))
  }

  function save(values: Pick<Account, 'username' | 'email' | 'fullName' | 'role'>) {
    if (editing && editing !== 'new') {
      const target = editing
      setAccounts((current) => current.map((account) => (account.id === target.id ? { ...account, ...values } : account)))
    } else {
      setAccounts((current) => [
        ...current,
        { id: `draft-account-${current.length + 1}`, ...values, status: 'ACTIVE', lastLoginAt: null },
      ])
    }
    setEditing(null)
  }

  return (
    <AdminPage
      title="Accounts"
      subtitle="Manage system user accounts (Account)"
      stats={[
        { label: 'Total accounts', value: accounts.length },
        { label: 'Active', value: active, tone: 'green' },
        { label: 'Inactive / locked', value: notActive, tone: 'muted' },
        { label: 'Roles', value: ACCOUNT_ROLES.length },
      ]}
    >
      <div className="atoolbar">
        <div className="atoolbar__filters">
          <input
            placeholder="Search username or email..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as AccountRole | '')}>
            <option value="">All roles</option>
            {ACCOUNT_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn--blue" onClick={() => setEditing('new')}>
          + Add Account
        </button>
      </div>

      <table className="atable">
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Role</th>
            <th>Full name</th>
            <th>Last login</th>
            <th>Status</th>
            <th className="is-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((account) => {
            const pill = STATUS_PILL[account.status]
            return (
              <tr key={account.id}>
                <td>{account.username}</td>
                <td>{account.email}</td>
                <td>
                  <span className={`apill apill--${account.role === 'ADMIN' ? 'blue' : 'grey'}`}>{account.role}</span>
                </td>
                <td className="is-strong">{account.fullName}</td>
                <td className="is-faint">{formatIsoDateTime(account.lastLoginAt)}</td>
                <td>
                  <span className={`apill apill--${pill.tone}`}>{pill.label}</span>
                </td>
                <td>
                  <div className="arow-actions">
                    <button type="button" className="abtn" onClick={() => setEditing(account)}>
                      Edit
                    </button>
                    {account.status === 'ACTIVE' ? (
                      <button type="button" className="abtn abtn--danger" onClick={() => setStatus(account.id, 'INACTIVE')}>
                        Deactivate
                      </button>
                    ) : (
                      <button type="button" className="abtn abtn--ok" onClick={() => setStatus(account.id, 'ACTIVE')}>
                        Activate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
          {visible.length === 0 ? (
            <tr>
              <td colSpan={7} className="atable__empty">
                {loadState === 'loading'
                  ? 'Loading accounts…'
                  : loadState === 'error'
                    ? 'Could not load accounts. Check that the API is running and reload.'
                    : 'No accounts match the filter'}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {editing ? (
        <AccountFormDialog
          account={editing === 'new' ? null : editing}
          existingUsernames={accounts.map((account) => account.username)}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </AdminPage>
  )
}
