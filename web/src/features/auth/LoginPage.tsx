import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { Icon } from '@/shared/ui/Icon'
import { ConsoleAccessError, useAuth } from './authContext'
import { GATEWAY_STATUS } from './mock'
import { FacilityTwinMap } from './FacilityTwinMap'
import './auth.css'

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
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: string } | null)?.from ?? DEFAULT_ROUTE

  // Already signed in (for example after a reload on /login): go straight to the console.
  if (status === 'authenticated') return <Navigate to={from} replace />

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
    <div className="login">
      <header className="login__bar">
        <div className="login__brand">
          <span className="login__logo">WT</span>
          <span className="login__brand-text">
            <span className="login__brand-name">
              WARO<span>TRANS</span>
            </span>
            <span className="login__brand-sub">FLEET ENGINE</span>
          </span>
        </div>
        <div className="login__status">
          <span className="login__chip">
            <span className="dot" />
            {GATEWAY_STATUS.label}
          </span>
          <span className="login__time">
            Cluster Time: <strong>{GATEWAY_STATUS.clusterTime}</strong>
          </span>
        </div>
      </header>

      <main className="login__split">
        <section className="login__card login__twin">
          <FacilityTwinMap />
        </section>

        <section className="login__card login__auth">
          <h1>Sign In to Fleet Manager</h1>
          <p className="login__sub">
            Enter your credentials to access administrative mission control
          </p>

          <form onSubmit={handleSubmit} className="login__form">
            <label className="login__field">
              <span>Username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </label>
            <label className="login__field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            {error ? (
              <p className="login__error" role="alert">
                {error}
              </p>
            ) : null}

            <button type="submit" className="login__submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign In to Console'} <Icon name="arrowRight" size={16} />
            </button>
          </form>

          <p className="login__footer">
            WaroTrans Enterprise v2.4.0-prod · ROS2 Nav2 Hardware Bridge · TLS 1.3
          </p>
        </section>
      </main>
    </div>
  )
}
