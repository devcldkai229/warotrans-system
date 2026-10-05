import { AdminPage } from '@/app/AdminPage'
import { ACCOUNT_ROLES, ROLE_DESCRIPTIONS } from './constants'
import { ACCOUNTS } from './mock'

// Roles are the code-only AccountRole enum (ADMIN, STAFF); there is no Role table to add to or edit
// (rules/00 "do not convert code-only enums into lookup tables"), so this screen is read-only.
export function RolesPage() {
  return (
    <AdminPage
      title="Roles"
      subtitle="Access roles such as ADMIN and STAFF (AccountRole)"
      stats={[
        { label: 'Total roles', value: ACCOUNT_ROLES.length },
        { label: 'Accounts linked', value: ACCOUNTS.length },
      ]}
    >
      <div className="atoolbar">
        <h2>Roles</h2>
      </div>
      <table className="atable">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Accounts</th>
          </tr>
        </thead>
        <tbody>
          {ACCOUNT_ROLES.map((role) => (
            <tr key={role}>
              <td>
                <span className={`apill apill--${role === 'ADMIN' ? 'blue' : 'grey'}`}>{role}</span>
              </td>
              <td>{ROLE_DESCRIPTIONS[role]}</td>
              <td>{ACCOUNTS.filter((account) => account.role === role).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="anote">Roles are fixed by the system. To change what a person can do, change the role on their account.</p>
    </AdminPage>
  )
}
