import { useMemo, useState } from 'react'
import type { Account, AccountRole, AccountStatus } from '@/shared/api/contracts'
import { formatIsoDateTime } from '@/shared/lib/format'
import { AccountFormDialog } from '@/features/accounts/AccountFormDialog'
import { ACCOUNT_ROLES } from '@/features/accounts/constants'
import { SectionHead } from './SectionHead'

const STATUS_PILL: Record<AccountStatus, { label: string; tone: 'green' | 'grey' | 'red' }> = {
  ACTIVE: { label: 'Active', tone: 'green' },
  INACTIVE: { label: 'Inactive', tone: 'grey' },
  LOCKED: { label: 'Locked', tone: 'red' },
}

interface AccountsSectionProps {
  accounts: Account[]
  setAccounts: (update: (current: Account[]) => Account[]) => void
  loadState: 'loading' | 'ready' | 'error'
}

/** Accounts that can sign in to the console (identity.accounts). */
export function AccountsSection({ accounts, setAccounts, loadState }: AccountsSectionProps) {
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<AccountRole | ''>('')
  const [editing, setEditing] = useState<Account | 'new' | null>(null)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return accounts.filter(
      (account) =>
        (roleFilter === '' || account.role === roleFilter) &&
        (needle === '' ||
          account.username.toLowerCase().includes(needle) ||
          account.email.toLowerCase().includes(needle) ||
          account.fullName.toLowerCase().includes(needle)),
    )
  }, [accounts, query, roleFilter])

  // TODO(backend): the Identity API only lists accounts so far. Create, edit and status changes stay in local state.
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
    <>
      <SectionHead title="Accounts" hint="People who can sign in. The role decides what each person may do.">
        <input placeholder="Search name, username or email…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as AccountRole | '')}>
          <option value="">All roles</option>
          {ACCOUNT_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn--blue" onClick={() => setEditing('new')}>
          + Add account
        </button>
      </SectionHead>

      <table className="mtable">
        <thead>
          <tr>
            <th>Username</th>
            <th>Full name</th>
            <th>Email</th>
            <th>Role</th>
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
                <td className="is-strong">{account.fullName}</td>
                <td>{account.email}</td>
                <td>
                  <span className={`mpill mpill--${account.role === 'ADMIN' ? 'blue' : 'grey'}`}>{account.role}</span>
                </td>
                <td className="is-faint">{formatIsoDateTime(account.lastLoginAt)}</td>
                <td>
                  <span className={`mpill mpill--${pill.tone}`}>{pill.label}</span>
                </td>
                <td>
                  <div className="mrow-actions">
                    <button type="button" className="mbtn" onClick={() => setEditing(account)}>
                      Edit
                    </button>
                    {account.status === 'ACTIVE' ? (
                      <button type="button" className="mbtn mbtn--danger" onClick={() => setStatus(account.id, 'INACTIVE')}>
                        Deactivate
                      </button>
                    ) : (
                      <button type="button" className="mbtn mbtn--ok" onClick={() => setStatus(account.id, 'ACTIVE')}>
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
              <td colSpan={7} className="mtable__empty">
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
    </>
  )
}
