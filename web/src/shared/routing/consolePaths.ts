/**
 * Routes of the two web portals that share the same screens.
 *
 * - `admin`: the full console under /monitor, /operations, /configure.
 * - `tech`: the Technician portal under /tech, robot screens only (fleet, technical, manual, issues, history, audit,
 *   notifications, and a read-only job page reached from an issue).
 *
 * A shared screen never writes a route by hand: it asks `usePaths()` so a link opened in the Technician portal stays
 * in that portal.
 */
export type Portal = 'admin' | 'tech'

export interface ConsolePaths {
  portal: Portal
  home: string
  fleet: (robotCode?: string) => string
  robotTechnical: (robotCode: string) => string
  robotManual: (robotCode: string) => string
  job: (jobId: string) => string
  issues: (issueId?: string) => string
  robotHistory: (robotCode?: string) => string
  notifications: string
  audit: string
  /**
   * Rewrites an admin route (for example a notification's stored route) into this portal. Null when the portal has
   * no such screen, so the caller can leave the click inert instead of sending a Technician to a refused screen.
   */
  translate: (route: string) => string | null
}

const enc = encodeURIComponent

function historyRoute(base: string, robotCode?: string): string {
  return robotCode ? `${base}?robot=${enc(robotCode)}` : base
}

const ADMIN_PATHS: ConsolePaths = {
  portal: 'admin',
  home: '/monitor/fleet',
  fleet: (robotCode) => (robotCode ? `/monitor/fleet/${robotCode}` : '/monitor/fleet'),
  robotTechnical: (robotCode) => `/monitor/fleet/${robotCode}/technical`,
  robotManual: (robotCode) => `/monitor/fleet/${robotCode}/manual`,
  job: (jobId) => `/monitor/jobs/${jobId}`,
  issues: (issueId) => (issueId ? `/operations/issues/${issueId}` : '/operations/issues'),
  robotHistory: (robotCode) => historyRoute('/operations/robot-history', robotCode),
  notifications: '/operations/notifications',
  audit: '/operations/audit',
  translate: (route) => route,
}

/** Admin route prefix → Technician route prefix. Anything not listed has no screen in the Technician portal. */
const TECH_PREFIXES: [string, string][] = [
  ['/monitor/fleet', '/tech/fleet'],
  ['/monitor/jobs/', '/tech/jobs/'],
  ['/operations/issues', '/tech/issues'],
  ['/operations/robot-history', '/tech/robot-history'],
  ['/operations/notifications', '/tech/notifications'],
  ['/operations/audit', '/tech/audit'],
]

/** True when `route` is `prefix` itself or a sub-route / query of it (so /monitor/fleetX is not a match). */
function startsWithRoute(route: string, prefix: string): boolean {
  if (!route.startsWith(prefix)) return false
  if (prefix.endsWith('/')) return route.length > prefix.length
  const next = route.charAt(prefix.length)
  return next === '' || next === '/' || next === '?' || next === '#'
}

export function toTechRoute(route: string): string | null {
  if (route === '/tech' || route.startsWith('/tech/')) return route
  for (const [from, to] of TECH_PREFIXES) {
    if (startsWithRoute(route, from)) return to + route.slice(from.length)
  }
  return null
}

/** The way back: a Technician route as the same screen in the admin console (every Technician screen has one). */
export function toAdminRoute(route: string): string | null {
  for (const [admin, tech] of TECH_PREFIXES) {
    if (startsWithRoute(route, tech)) return admin + route.slice(tech.length)
  }
  return null
}

const TECH_PATHS: ConsolePaths = {
  portal: 'tech',
  home: '/tech/fleet',
  fleet: (robotCode) => (robotCode ? `/tech/fleet/${robotCode}` : '/tech/fleet'),
  robotTechnical: (robotCode) => `/tech/fleet/${robotCode}/technical`,
  robotManual: (robotCode) => `/tech/fleet/${robotCode}/manual`,
  job: (jobId) => `/tech/jobs/${jobId}`,
  issues: (issueId) => (issueId ? `/tech/issues/${issueId}` : '/tech/issues'),
  robotHistory: (robotCode) => historyRoute('/tech/robot-history', robotCode),
  notifications: '/tech/notifications',
  audit: '/tech/audit',
  translate: toTechRoute,
}

export function pathsFor(portal: Portal): ConsolePaths {
  return portal === 'tech' ? TECH_PATHS : ADMIN_PATHS
}
