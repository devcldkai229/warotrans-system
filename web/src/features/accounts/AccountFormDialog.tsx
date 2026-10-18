import { useState } from 'react'
import type { Account, AccountRole } from '@/shared/api/contracts'
import { Dialog } from '@/shared/ui/Dialog'
import { Field, FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { ACCOUNT_ROLES } from './constants'

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
      setError('Username, email and full name are required.')
      return
    }
    if (!account && !USERNAME_PATTERN.test(values.username)) {
      setError('The username needs 3 to 50 characters: lower case letters, digits, "." "_" or "-".')
      return
    }
    if (!/^[^\s@]+@[^\s@]+$/.test(values.email)) {
      setError('Enter a valid email address.')
      return
    }
    if (!account && existingUsernames.includes(values.username)) {
      setError('This username is already in use.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await onSave(values)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The account could not be saved.')
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={account ? 'Edit account' : 'Add account'}
      submitLabel={account ? 'Save changes' : 'Create account'}
      busy={busy}
      onClose={onClose}
      onSubmit={submit}
    >
      <Field
        label="Username"
        hint={account ? 'The username is the sign-in name and cannot be changed.' : 'Lower case letters, digits, "." "_" or "-".'}
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
      <Field label="Email">
        <input className={controlClass()} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </Field>
      <Field label="Full name">
        <input className={controlClass()} value={fullName} autoFocus={account !== null} onChange={(event) => setFullName(event.target.value)} />
      </Field>
      <Field
        label="Role"
        hint={
          isSelf
            ? 'You cannot change your own role.'
            : roleChanges
              ? 'Changing the role signs this person out of every device.'
              : account
                ? undefined
                : 'A temporary password is generated and shown once after the account is created.'
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
