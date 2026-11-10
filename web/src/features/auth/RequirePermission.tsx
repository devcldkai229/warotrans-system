import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '@/shared/i18n'
import { holdsPermission as holds, type Permission } from '@/shared/auth/permissions'
import { Button } from '@/shared/ui/Button'
import { useAuth } from './authContext'

type Needs = Permission | Permission[]

/**
 * Shows its children only to a session that holds the permission (WEB-MGMT-01). It hides what the server would refuse
 * anyway; the server still decides on every request. Never test a role name instead: the permission list is what the
 * server enforces for this token.
 */
export function Can({ permission, children, fallback = null }: { permission: Needs; children: ReactNode; fallback?: ReactNode }) {
  const { can } = useAuth()
  return holds(can, permission) ? <>{children}</> : <>{fallback}</>
}

/** Route guard: a person who types the address of a screen their role does not include lands here, not on a wall of 403s. */
export function RequirePermission({ permission, children }: { permission: Needs; children: ReactNode }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  if (holds(can, permission)) return <>{children}</>

  return (
    <div className="grid h-full min-h-[24rem] place-items-center px-6">
      <div className="max-w-md text-center" role="alert">
        <h1 className="text-xl font-book">{t('You do not have access to this page')}</h1>
        <p className="mt-2 text-sm text-ink-2">{t('Your role does not include it. Ask an administrator if you need it.')}</p>
        <Button className="mt-5" variant="tonal" onClick={() => navigate(-1)}>
          {t('Go back')}
        </Button>
      </div>
    </div>
  )
}
