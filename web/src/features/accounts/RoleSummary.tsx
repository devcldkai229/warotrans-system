import type { AccountRole } from '@/shared/api/contracts'
import { t } from '@/shared/i18n'
import { ROLE_DESCRIPTIONS } from './constants'
import { areasOf } from './permissionCatalog'
import { useRoles } from './useRoles'

/**
 * Under the role picker: what the chosen role may do, read from the server's role-permission matrix, so an Admin
 * knows what they are handing out before they save.
 */
export function RoleSummary({ role }: { role: AccountRole }) {
  const roles = useRoles()
  const info = roles.data?.roles.find((item) => item.role === role)

  return (
    <div className="mt-2 rounded-sm bg-container px-3 py-2.5 text-xs text-ink-2" aria-live="polite">
      <p>{ROLE_DESCRIPTIONS[role]}</p>
      {info ? (
        <dl className="mt-2 flex flex-col gap-1">
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted">{t('Can use')}</dt>
            <dd>{areasOf(info.permissions).join(', ') || '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted">{t('Web console')}</dt>
            <dd>{info.permissions.includes('console.access') ? t('Yes') : t('No: works in the mobile app')}</dd>
          </div>
          {info.robotScoped ? (
            <div className="flex gap-2">
              <dt className="shrink-0 text-muted">{t('Robots')}</dt>
              <dd>{t('Only the robots assigned to the account')}</dd>
            </div>
          ) : null}
        </dl>
      ) : roles.isError ? (
        <p className="mt-2 text-red-ink">{t('Could not load the permissions of the roles.')}</p>
      ) : (
        <p className="mt-2 text-muted">{t('Loading roles…')}</p>
      )}
    </div>
  )
}
