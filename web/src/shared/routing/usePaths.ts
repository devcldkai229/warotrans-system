import { useContext } from 'react'
import { pathsFor, type ConsolePaths } from './consolePaths'
import { PortalContext } from './portalContext'

/** Routes of the portal the current screen is shown in; the admin console when no portal is set (tests, old routes). */
export function usePaths(): ConsolePaths {
  return pathsFor(useContext(PortalContext))
}
