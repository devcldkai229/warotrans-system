import { useState } from 'react'
import type { Account, AccountRole } from '@/shared/api/contracts'
import { Dialog } from '@/shared/ui/Dialog'
import { Field, FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { ACCOUNT_ROLES } from './constants'
import { t } from '@/shared/i18n'
export type AccountFormValues = Pick<Account, 'username' | 'email' | 'fullName' | 'role'>

interface AccountFormDialogProps {
  /** Account being edited; null creates a new one. */
  account: Account | null
  existingUsernames: string[]
  /** The signed-in Admin: their own role cannot be changed here, so they cannot lock themselves out. */
  currentAccountId: string | null
  onClose: () => void
  /** Saves through the API. A rejection (e.g. "username already in use") is shown in the form. */
  onSave: (values: AccountFormValues) => Promise<void>
}

const USERNAME_PATTERN = /^[a-z0-9._-]{3,50}$/

export function AccountFormDialog({ account, existingUsernames, currentAccountId, onClose, onSave }: AccountFormDialogProps) {
  const [username, setUsername] = useState(account?.username ?? '')
  const [email, setEmail] = useState(account?.email ?? '')
  const [fullName, setFullName] = useState(account?.fullName ?? '')
  const [role, setRole] = useState<AccountRole>(account?.role ?? 'STAFF')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isSelf = account !== null && account.id === currentAccountId
  const roleChanges = account !== null && role !== account.role

  async function submit() {
    const values = { username: username.trim(), email: email.trim(), fullName: fullName.trim(), role }
    if (!values.username || !values.email || !values.fullName) {
      setError(t('Username, email and full name are required.'))
      return
    }
    if (!account && !USERNAME_PATTERN.test(values.username)) {
      setError(t('The username needs 3 to 50 characters: lower case letters, digits, "." "_" or "-".'))
      return
    }
    if (!/^[^\s@]+@[^\s@]+$/.test(values.email)) {
      setError(t('Enter a valid email address.'))
      return
    }
    if (!account && existingUsernames.includes(values.username)) {
      setError(t('This username is already in use.'))
      return
    }

    setBusy(true)
    setError(null)
    try {
      await onSave(values)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('The account could not be saved.'))
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={account ? t('Edit account') : t('Add account')}
      submitLabel={account ? t('Save changes') : t('Create account')}
      busy={busy}
      onClose={onClose}
      onSubmit={submit}
    >
      <Field
        label={t('Username')}
        hint={account ? t('The username is the sign-in name and cannot be changed.') : t('Lower case letters, digits, "." "_" or "-".')}
      >
        <input
          className={controlClass()}
          value={username}
          disabled={account !== null}
          autoFocus={account === null}
          autoCapitalize="none"
          onChange={(event) => setUsername(event.target.value.toLowerCase())}
        />
      </Field>
      <Field label={t('Email')}>
        <input className={controlClass()} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </Field>
      <Field label={t('Full name')}>
        <input className={controlClass()} value={fullName} autoFocus={account !== null} onChange={(event) => setFullName(event.target.value)} />
      </Field>
      <Field
        label={t('Role')}
        hint={
          isSelf
            ? t('You cannot change your own role.')
            : roleChanges
              ? t('Changing the role signs this person out of every device.')
              : account
                ? undefined
                : t('A temporary password is generated and shown once after the account is created.')
        }
      >
        <select
          className={controlClass()}
          value={role}
          disabled={isSelf}
          onChange={(event) => setRole(event.target.value as AccountRole)}
        >
          {ACCOUNT_ROLES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </Field>
      {error ? <FormError>{error}</FormError> : null}
    </Dialog>
  )
}
