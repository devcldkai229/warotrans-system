import { useMemo, useState } from 'react'
import type { Account, AccountRole, AccountStatus } from '@/shared/api/contracts'
import { formatIsoDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { SearchInput, FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import type { Tone } from '@/shared/ui/statusTones'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { createAccount, setAccountStatus, updateAccount } from '@/features/accounts/api'
import { AccountFormDialog, type AccountFormValues } from '@/features/accounts/AccountFormDialog'
import { TemporaryPasswordDialog } from '@/features/accounts/TemporaryPasswordDialog'
import { useAuth } from '@/features/auth/authContext'
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
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null)
  const { account: me } = useAuth()

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

  function replace(updated: Account) {
    setAccounts((current) => current.map((account) => (account.id === updated.id ? updated : account)))
  }

  async function changeStatus(account: Account, status: 'ACTIVE' | 'INACTIVE') {
    setBusyId(account.id)
    setNotice(null)
    try {
      replace(await setAccountStatus(account, status))
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : 'The status could not be changed.')
    } finally {
      setBusyId(null)
    }
  }

  // Rejects when the API refuses (e.g. the username is taken): the dialog shows the message and stays open.
  async function save(values: AccountFormValues) {
    if (editing && editing !== 'new') {
      replace(await updateAccount(editing, { email: values.email, fullName: values.fullName, role: values.role }))
    } else {
      const created = await createAccount(values)
      setAccounts((current) => [...current, created.account].sort((a, b) => a.username.localeCompare(b.username)))
      setIssued({ username: created.account.username, password: created.temporaryPassword })
    }
    setNotice(null)
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

      {notice ? (
        <div className="mb-3">
          <FormError>{notice}</FormError>
        </div>
      ) : null}

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
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === account.id || account.id === me?.id}
                      title={account.id === me?.id ? 'You cannot deactivate your own account.' : undefined}
                      onClick={() => changeStatus(account, 'INACTIVE')}
                    >
                      Deactivate
                    </Button>
                  ) : (
                    <Button size="sm" variant="tonal" disabled={busyId === account.id} onClick={() => changeStatus(account, 'ACTIVE')}>
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
          currentAccountId={me?.id ?? null}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}

      {issued ? <TemporaryPasswordDialog username={issued.username} password={issued.password} onClose={() => setIssued(null)} /> : null}
    </>
  )
}
