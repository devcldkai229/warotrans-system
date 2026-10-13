import type { Account } from '@/shared/api/contracts'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { Table, Td, Th, Tr } from '@/shared/ui/Table'
import { ACCOUNT_ROLES, ROLE_DESCRIPTIONS } from '@/features/accounts/constants'
import { SectionHead, SectionNote } from './SectionHead'

/**
 * Roles are the code-only AccountRole enum (ADMIN, STAFF): there is no Role table to add to or edit
 * (rules/00 "do not convert code-only enums into lookup tables"), so this section is read-only.
 */
export function RolesSection({ accounts }: { accounts: Account[] }) {
  return (
    <>
      <SectionHead title="Roles" hint="What each kind of account is allowed to do." />

      <Table>
        <thead>
          <tr>
            <Th>Role</Th>
            <Th>Description</Th>
            <Th align="right">Accounts</Th>
          </tr>
        </thead>
        <tbody>
          {ACCOUNT_ROLES.map((role) => (
            <Tr key={role}>
              <Td>
                <StatusBadge tone={role === 'ADMIN' ? 'blue' : 'grey'}>{role}</StatusBadge>
              </Td>
              <Td>{ROLE_DESCRIPTIONS[role]}</Td>
              <Td align="right" tone="strong">
                {accounts.filter((account) => account.role === role).length}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <SectionNote>Roles are fixed by the system. To change what a person can do, change the role on their account.</SectionNote>
    </>
  )
}
