import { NavLink, Outlet } from 'react-router-dom'
import './layout.css'

export function AppLayout() {
  return (
    <div className="app-shell">
      <aside className="app-nav">
        <div className="app-brand">
          <img src="/logo_wrt.png" alt="WaroTrans" className="h-10 w-auto object-contain" />
        </div>
        <nav>
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/workflows">Workflow templates</NavLink>
        </nav>
      </aside>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
