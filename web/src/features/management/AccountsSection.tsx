import { useMemo, useState } from 'react'
import type { Account, AccountRole, AccountStatus } from '@/shared/api/contracts'
import { formatIsoDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { SearchInput, FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import type { Tone } from '@/shared/ui/statusTones'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { createAccount, resetAccountPassword, setAccountStatus, updateAccount } from '@/features/accounts/api'
import { RobotScopeDialog } from '@/features/accounts/RobotScopeDialog'
import { AccountFormDialog, type AccountFormValues } from '@/features/accounts/AccountFormDialog'
import { TemporaryPasswordDialog } from '@/features/accounts/TemporaryPasswordDialog'
import { useAuth } from '@/features/auth/authContext'
import { ACCOUNT_ROLES } from '@/features/accounts/constants'
import { AddButton, SectionHead } from './SectionHead'
import { t } from '@/shared/i18n'
const STATUS_TONE: Record<AccountStatus, Tone> = { ACTIVE: 'green', INACTIVE: 'grey', LOCKED: 'red' }

const ROLE_TONE: Record<AccountRole, Tone> = { ADMIN: 'blue', STAFF: 'grey', TECHNICIAN: 'amber' }

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
  const [issued, setIssued] = useState<{ username: string; password: string; reason: 'created' | 'reset' } | null>(null)
  const [scopeFor, setScopeFor] = useState<Account | null>(null)
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
      setNotice(failure instanceof Error ? failure.message : t('The status could not be changed.'))
    } finally {
      setBusyId(null)
    }
  }

  async function resetPassword(account: Account) {
    if (!window.confirm(t('Reset the password of {username}? They will be signed out on every device.', { username: account.username }))) return
    setBusyId(account.id)
    setNotice(null)
    try {
      const reset = await resetAccountPassword(account)
      replace(reset.account)
      setIssued({ username: reset.account.username, password: reset.temporaryPassword, reason: 'reset' })
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : t('The password could not be reset.'))
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
      setIssued({ username: created.account.username, password: created.temporaryPassword, reason: 'created' })
    }
    setNotice(null)
    setEditing(null)
  }

  return (
    <>
      <SectionHead title={t('Accounts')} hint={t('People who can sign in. The role decides what each person may do.')}>
        <SearchInput className="w-72" placeholder={t('Search name, username or email')} value={query} onChange={setQuery} />
        <select
          className={controlClass('pill')}
          aria-label={t('Filter by role')}
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value as AccountRole | '')}
        >
          <option value="">{t('All roles')}</option>
          {ACCOUNT_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <AddButton onClick={() => setEditing('new')}>{t('Add account')}</AddButton>
      </SectionHead>

      {notice ? (
        <div className="mb-3">
          <FormError>{notice}</FormError>
        </div>
      ) : null}

      <Table>
        <thead>
          <tr>
            <Th>{t('Username')}</Th>
            <Th>{t('Full name')}</Th>
            <Th>{t('Email')}</Th>
            <Th>{t('Role')}</Th>
            <Th>{t('Last login')}</Th>
            <Th>{t('Status')}</Th>
            <Th align="right">{t('Actions')}</Th>
          </tr>
        </thead>
        <tbody>
          {visible.map((account) => (
            <Tr key={account.id}>
              <Td>{account.username}</Td>
              <Td tone="strong">{account.fullName}</Td>
              <Td>{account.email}</Td>
              <Td>
                <StatusBadge tone={ROLE_TONE[account.role]}>{account.role}</StatusBadge>
                {account.mustChangePassword ? <span className="ml-2 text-xs text-muted">{t('temporary password')}</span> : null}
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
                  <Button size="sm" onClick={() => setEditing(account)}>{t('Edit')}</Button>
                  {account.role === 'TECHNICIAN' ? (
                    <Button size="sm" variant="ghost" onClick={() => setScopeFor(account)}>{t('Robots')}</Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === account.id || account.id === me?.id}
                    title={account.id === me?.id ? t('Use Change password for your own account.') : undefined}
                    onClick={() => resetPassword(account)}
                  >{t('Reset password')}</Button>
                  {account.status === 'ACTIVE' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === account.id || account.id === me?.id}
                      title={account.id === me?.id ? t('You cannot deactivate your own account.') : undefined}
                      onClick={() => changeStatus(account, 'INACTIVE')}
                    >{t('Deactivate')}</Button>
                  ) : (
                    <Button size="sm" variant="tonal" disabled={busyId === account.id} onClick={() => changeStatus(account, 'ACTIVE')}>{t('Activate')}</Button>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
          {visible.length === 0 ? (
            <EmptyRow colSpan={7}>
              {loadState === 'loading'
                ? t('Loading accounts…')
                : loadState === 'error'
                  ? t('Could not load accounts. Check that the API is running, then reload.')
                  : t('No accounts match this filter.')}
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

      {issued ? (
        <TemporaryPasswordDialog
          username={issued.username}
          password={issued.password}
          reason={issued.reason}
          onClose={() => setIssued(null)}
        />
      ) : null}

      {scopeFor ? <RobotScopeDialog account={scopeFor} onClose={() => setScopeFor(null)} /> : null}
    </>
  )
}
