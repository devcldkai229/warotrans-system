import type { Account } from '@/shared/api/contracts'
import { ACCOUNT_ROLES, ROLE_DESCRIPTIONS } from '@/features/accounts/constants'
import { SectionHead } from './SectionHead'

/**
 * Roles are the code-only AccountRole enum (ADMIN, STAFF): there is no Role table to add to or edit
 * (rules/00 "do not convert code-only enums into lookup tables"), so this section is read-only.
 */
export function RolesSection({ accounts }: { accounts: Account[] }) {
  return (
    <>
      <SectionHead title="Roles" hint="What each kind of account is allowed to do." />

      <table className="mtable">
        <thead>
          <tr>
            <th>Role</th>
            <th>Description</th>
            <th className="is-right">Accounts</th>
          </tr>
        </thead>
        <tbody>
          {ACCOUNT_ROLES.map((role) => (
            <tr key={role}>
              <td>
                <span className={`mpill mpill--${role === 'ADMIN' ? 'blue' : 'grey'}`}>{role}</span>
              </td>
              <td>{ROLE_DESCRIPTIONS[role]}</td>
              <td className="is-right is-strong">{accounts.filter((account) => account.role === role).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mnote">Roles are fixed by the system. To change what a person can do, change the role on their account.</p>
    </>
  )
}
