import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '@/shared/ui/Icon'
import { useAuth } from './authContext'
import { FACILITIES, GATEWAY_STATUS, MOCK_ACCOUNT } from './mock'
import { FacilityTwinMap } from './FacilityTwinMap'
import './auth.css'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn } = useAuth()
  const [facility, setFacility] = useState(FACILITIES[0].code)
  const [employeeId, setEmployeeId] = useState('ADM-0007')
  const [password, setPassword] = useState('password123')
  const [remember, setRemember] = useState(true)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    // Mock: any credentials sign in as the Admin account. TODO(backend): POST /api/identity/login.
    signIn(MOCK_ACCOUNT)
    const from = (location.state as { from?: string } | null)?.from
    navigate(from ?? '/monitor/fleet', { replace: true })
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
            Enter credentials or tap employee badge to access administrative mission control
          </p>

          <form onSubmit={handleSubmit} className="login__form">
            <label className="login__field">
              <span>Facility Cluster</span>
              <select value={facility} onChange={(event) => setFacility(event.target.value)}>
                {FACILITIES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code} · {item.name} ({item.city})
                  </option>
                ))}
              </select>
            </label>
            <label className="login__field">
              <span>Employee ID</span>
              <input
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                autoComplete="username"
              />
            </label>
            <label className="login__field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>

            <div className="login__options">
              <label className="login__remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                Remember workstation (Shift 8h)
              </label>
              <a href="#forgot" onClick={(event) => event.preventDefault()}>
                Forgot key?
              </a>
            </div>

            <button type="submit" className="login__submit">
              Sign In to Console <Icon name="arrowRight" size={16} />
            </button>
          </form>

          <div className="login__rfid">
            <span className="login__rfid-icon">
              <Icon name="info" size={18} />
            </span>
            <div>
              <strong>RFID Card Reader Ready</strong>
              <span>Tap employee RFID badge on desktop Zebra scanner for single-tap login</span>
            </div>
          </div>

          <p className="login__footer">
            WaroTrans Enterprise v2.4.0-prod · ROS2 Nav2 Hardware Bridge · TLS 1.3
          </p>
        </section>
      </main>
    </div>
  )
}
