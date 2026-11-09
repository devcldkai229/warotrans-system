import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Wordmark } from '@/app/Wordmark'
import { ApiError } from '@/shared/api/client'
import { Button } from '@/shared/ui/Button'
import { Field, FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { ConsoleAccessError, useAuth } from './authContext'
import { MIN_PASSWORD_LENGTH as MIN_LENGTH, passwordProblem } from './passwordPolicy'

const DEFAULT_ROUTE = '/monitor/fleet'
function describeError(error: unknown): string {
  if (error instanceof ConsoleAccessError) return error.message
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'current_password_incorrect':
        return 'The current password is incorrect.'
      case 'password_contains_username':
        return 'The password must not contain your username.'
      case 'validation_failed':
        return error.message
      default:
        return 'The password could not be changed. Try again.'
    }
  }
  return 'Cannot reach the server. Check your connection and try again.'
}

/**
 * IDN-01: shown instead of the console while the account holds a temporary password, and reachable from the user
 * menu at any time. Changing the password signs every other device out.
 */
export function ChangePasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { status, account, capabilities, changePassword, signOut } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status === 'loading') {
    return (
      <div className="grid min-h-svh place-items-center text-sm text-muted" role="status">
        Restoring session…
      </div>
    )
  }
  if (!account) return <Navigate to="/login" replace />

  const forced = capabilities?.mustChangePassword ?? false
  const from = (location.state as { from?: string } | null)?.from ?? DEFAULT_ROUTE

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting || !account) return
    const problem = passwordProblem(next, confirm, account.username)
    if (problem) {
      setError(problem)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await changePassword(current, next)
      navigate(from === '/change-password' ? DEFAULT_ROUTE : from, { replace: true })
    } catch (caught) {
      setError(describeError(caught))
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-svh place-items-center bg-surface px-6 py-16">
      <main className="flex w-full max-w-sm flex-col items-center text-center">
        <Wordmark size="lg" />
        <h1 className="mt-10 text-3xl font-normal">{forced ? 'Choose your own password' : 'Change password'}</h1>
        <p className="mt-3 text-sm text-ink-2">
          {forced
            ? 'You signed in with a temporary password. Replace it before using the console.'
            : 'Other devices signed in to this account will be signed out.'}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex w-full flex-col gap-4 text-left">
          <Field label={forced ? 'Temporary password' : 'Current password'}>
            <input
              type="password"
              className={controlClass('lg')}
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          </Field>
          <Field label="New password" hint={`At least ${MIN_LENGTH} characters, with a letter and a digit.`}>
            <input
              type="password"
              className={controlClass('lg')}
              value={next}
              onChange={(event) => setNext(event.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>
          <Field label="Repeat new password">
            <input
              type="password"
              className={controlClass('lg')}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>

          {error ? <FormError>{error}</FormError> : null}

          <Button type="submit" variant="primary" size="lg" block className="mt-2" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save password'}
          </Button>
          {forced ? (
            <Button variant="ghost" block onClick={signOut}>
              Sign out
            </Button>
          ) : (
            <Button variant="ghost" block onClick={() => navigate(-1)}>
              Cancel
            </Button>
          )}
        </form>
      </main>
    </div>
  )
}
