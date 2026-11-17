import { Outlet } from 'react-router-dom'
import type { Portal } from './consolePaths'
import { PortalContext } from './portalContext'

/** Route element that puts every screen below it in `portal`, so their links stay in that portal. */
export function PortalScope({ portal }: { portal: Portal }) {
  return (
    <PortalContext.Provider value={portal}>
      <Outlet />
    </PortalContext.Provider>
  )
}
