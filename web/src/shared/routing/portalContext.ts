import { createContext } from 'react'
import type { Portal } from './consolePaths'

/** Portal the current screen is shown in; set by <PortalScope>, the admin console when unset. */
export const PortalContext = createContext<Portal>('admin')
