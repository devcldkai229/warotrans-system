import type { Account } from '@/shared/api/contracts'
import { t } from '@/shared/i18n'
import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { Table, Td, Th, Tr } from '@/shared/ui/Table'
import { ACCOUNT_ROLES, ROLE_DESCRIPTIONS } from '@/features/accounts/constants'
import { permissionGroups } from '@/features/accounts/permissionCatalog'
import { useRoles } from '@/features/accounts/useRoles'
import { SectionHead, SectionNote } from './SectionHead'

/**
 * Roles are the code-only AccountRole enum (ADMIN, STAFF, TECHNICIAN): there is no Role table to add to or edit
 * (rules/00 "do not convert code-only enums into lookup tables"), so this section is read-only. What each role may do is
 * read from the server (RolePermissionMatrix through GET /api/identity/roles), never kept as a second copy here, so
 * the matrix below is exactly what the API enforces.
 */
export function RolesSection({ accounts }: { accounts: Account[] }) {
  const roles = useRoles()
  const matrix = roles.data
  const groups = permissionGroups(matrix?.allPermissions)
  const total = matrix?.allPermissions.length ?? 0

  return (
    <>
      <SectionHead title={t('Roles')} />

      <Table>
        <thead>
          <tr>
            <Th>{t('Role')}</Th>
            <Th>{t('Description')}</Th>
            <Th align="right">{t('Accounts')}</Th>
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

      <h3 className="mt-10 mb-3 text-base font-medium">{t('What each role can do')}</h3>
      {roles.isLoading ? <p className="text-sm text-muted">{t('Loading roles…')}</p> : null}
      {roles.isError ? <p role="alert" className="text-sm text-red-ink">{t('Could not load the permissions of the roles.')}</p> : null}
      {matrix ? (
        <Table>
          <thead>
            <tr>
              <Th>{t('Permission')}</Th>
              {matrix.roles.map((role) => (
                <Th key={role.role} align="right">
                  <span className="block">{role.role}</span>
                  <span className="block font-normal text-muted tabular-nums">{t('{held} of {total}', { held: role.permissions.length, total })}</span>
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <GroupRows key={group.id} title={group.title} items={group.items} roles={matrix.roles} />
            ))}
          </tbody>
        </Table>
      ) : null}
      {matrix?.roles.some((role) => role.robotScoped) ? (
        <SectionNote>
          {t('A robot permission of a role marked for assigned robots only applies to the robots set for each account (Accounts → Robots).')}
        </SectionNote>
      ) : null}
      <SectionNote>{t('Roles are fixed by the system. To change what a person can do, change the role on their account.')}</SectionNote>
    </>
  )
}

function GroupRows({
  title,
  items,
  roles,
}: {
  title: string
  items: { code: string; label: string }[]
  roles: { role: string; permissions: string[] }[]
}) {
  return (
    <>
      <tr>
        <td colSpan={roles.length + 1} className="px-4 pt-6 pb-2 text-xs font-medium text-muted">
          {title}
        </td>
      </tr>
      {items.map((item) => (
        <Tr key={item.code}>
          <Td>
            <span className="block text-ink">{item.label}</span>
            <span className="block font-mono text-[11px] text-muted">{item.code}</span>
          </Td>
          {roles.map((role) => {
            const holds = role.permissions.includes(item.code)
            return (
              <Td key={role.role} align="right">
                {holds ? (
                  <>
                    <Icon name="check" size={16} className="ml-auto text-green-ink" />
                    <span className="sr-only">{t('Allowed')}</span>
                  </>
                ) : (
                  <>
                    <span aria-hidden className="text-muted">—</span>
                    <span className="sr-only">{t('Not allowed')}</span>
                  </>
                )}
              </Td>
            )
          })}
        </Tr>
      ))}
    </>
  )
}
