import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Wordmark } from '@/app/Wordmark'
import { ApiError } from '@/shared/api/client'
import { useTheme } from '@/shared/theme/theme'
import { Button, IconButton } from '@/shared/ui/Button'
import { Field, FormError } from '@/shared/ui/Field'
import { Icon } from '@/shared/ui/Icon'
import { controlClass } from '@/shared/ui/controlClass'
import { ConsoleAccessError, useAuth } from './authContext'
import { DotField } from './DotField'

const DEFAULT_ROUTE = '/monitor/fleet'

/** Turns a failed sign-in into the message shown under the form. Backend `code` values come from the Identity module. */
function describeSignInError(error: unknown): string {
  if (error instanceof ConsoleAccessError) return error.message
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'invalid_credentials':
        return 'Incorrect username or password.'
      case 'account_locked':
        return 'This account is locked. Contact an administrator.'
      case 'account_inactive':
        return 'This account is not active. Contact an administrator.'
      case 'validation_failed':
        return 'Enter both username and password.'
      default:
        return 'Sign-in failed. Try again.'
    }
  }
  return 'Cannot reach the server. Check your connection and try again.'
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { status, signIn } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: string } | null)?.from ?? DEFAULT_ROUTE

  // Already signed in (for example after a reload on /login): go straight to the console.
  if (status === 'authenticated') return <Navigate to={from} replace />

  // Wait for cookie restore — signing in while refresh is in flight can rotate/overwrite the cookie
  // and surface a misleading "Incorrect username or password".
  if (status === 'loading') {
    return (
      <div className="grid min-h-svh place-items-center text-sm text-muted" role="status">
        Restoring session…
      </div>
    )
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await signIn(username.trim(), password)
      navigate(from, { replace: true })
    } catch (caught) {
      setError(describeSignInError(caught))
      setSubmitting(false)
    }
  }

  return (
    <div className="relative grid min-h-svh place-items-center overflow-hidden bg-surface px-6 py-16">
      <DotField />

      <IconButton
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        tone="surface"
        className="absolute top-5 right-5 z-10"
        onClick={toggleTheme}
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
      </IconButton>

      <main className="relative w-full max-w-xl">
        {/* A soft pool of the card colour behind the form keeps the text readable over the dots. */}
        <div className="pointer-events-none absolute -inset-x-24 -inset-y-20 bg-[radial-gradient(closest-side,var(--color-surface)_68%,transparent)]" />

        <div className="relative flex flex-col items-center text-center">
          <Wordmark size="lg" />
          <h1 className="mt-10 text-4xl font-normal sm:text-5xl">Sign in to the console</h1>
          <p className="mt-4 text-base text-ink-2">For warehouse administrators. Staff accounts use the mobile app.</p>

          <form onSubmit={handleSubmit} className="mt-10 flex w-full max-w-sm flex-col gap-4 text-left">
            <Field label="Username">
              <input
                className={controlClass('lg')}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                className={controlClass('lg')}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>

            {error ? <FormError>{error}</FormError> : null}

            <Button type="submit" variant="primary" size="lg" block className="mt-2" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
      </main>
    </div>
  )
}
