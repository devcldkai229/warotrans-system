import { useMemo, useState } from 'react'
import type { Account, AccountRole, AccountStatus } from '@/shared/api/contracts'
import { formatIsoDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { SearchInput } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import type { Tone } from '@/shared/ui/statusTones'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { AccountFormDialog } from '@/features/accounts/AccountFormDialog'
import { ACCOUNT_ROLES } from '@/features/accounts/constants'
import { AddButton, SectionHead } from './SectionHead'

const STATUS_TONE: Record<AccountStatus, Tone> = { ACTIVE: 'green', INACTIVE: 'grey', LOCKED: 'red' }

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
        <SearchInput className="w-72" placeholder="Search name, username or email" value={query} onChange={setQuery} />
        <select
          className={controlClass('pill')}
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value as AccountRole | '')}
        >
          <option value="">All roles</option>
          {ACCOUNT_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <AddButton onClick={() => setEditing('new')}>Add account</AddButton>
      </SectionHead>

      <Table>
        <thead>
          <tr>
            <Th>Username</Th>
            <Th>Full name</Th>
            <Th>Email</Th>
            <Th>Role</Th>
            <Th>Last login</Th>
            <Th>Status</Th>
            <Th align="right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {visible.map((account) => (
            <Tr key={account.id}>
              <Td>{account.username}</Td>
              <Td tone="strong">{account.fullName}</Td>
              <Td>{account.email}</Td>
              <Td>
                <StatusBadge tone={account.role === 'ADMIN' ? 'blue' : 'grey'}>{account.role}</StatusBadge>
              </Td>
              <Td tone="faint" className="tabular-nums">
                {formatIsoDateTime(account.lastLoginAt)}
              </Td>
              <Td>
                <StatusBadge tone={STATUS_TONE[account.status]} withDot>
                  {account.status}
                </StatusBadge>
              </Td>
              <Td>
                <div className="flex justify-end gap-1.5">
                  <Button size="sm" onClick={() => setEditing(account)}>
                    Edit
                  </Button>
                  {account.status === 'ACTIVE' ? (
                    <Button size="sm" variant="ghost" onClick={() => setStatus(account.id, 'INACTIVE')}>
                      Deactivate
                    </Button>
                  ) : (
                    <Button size="sm" variant="tonal" onClick={() => setStatus(account.id, 'ACTIVE')}>
                      Activate
                    </Button>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
          {visible.length === 0 ? (
            <EmptyRow colSpan={7}>
              {loadState === 'loading'
                ? 'Loading accounts…'
                : loadState === 'error'
                  ? 'Could not load accounts. Check that the API is running, then reload.'
                  : 'No accounts match this filter.'}
            </EmptyRow>
          ) : null}
        </tbody>
      </Table>

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
