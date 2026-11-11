import type { Robot } from '@/shared/api/contracts'
import type { RobotHealth, RobotHealthItem } from '@/shared/api/fleet'
import { msg, t } from '@/shared/i18n'

/**
 * BOTH-09 / RB-02: what the Technical dashboard shows, worked out from the robot's own reports. Nothing is invented:
 * a value the robot did not measure stays empty and says so, and what it stopped reporting is marked stale.
 */

/** live: measured and recent. stale: the source stopped reporting. not_measured: the robot has no such reading. not_reported: the robot never sent this item. */
export type Freshness = 'live' | 'stale' | 'not_measured' | 'not_reported'

export type HealthLevel = RobotHealthItem['level']

export interface HealthRow {
  key: string
  label: string
  /** The robot's own level for it; null for an item it never sent. */
  level: HealthLevel | null
  freshness: Freshness
  /** "6.8 Hz", "52 C"; null when there is nothing measured to show. */
  value: string | null
  /** What the robot said about it (e.g. "no thermal sensor"). */
  message: string | null
  measuredAt: string | null
}

export type GroupId = 'sensors' | 'navigation' | 'computer'

export interface HealthGroup {
  id: GroupId
  title: string
  rows: HealthRow[]
}

const LABELS: Record<string, string> = {
  lidar: msg('LiDAR'),
  odometry: msg('Odometry'),
  imu: msg('IMU'),
  ultrasonic: msg('Ultrasonic'),
  tf_localization: msg('Localization (TF)'),
  nav2: msg('Nav2'),
  cpu_load: msg('CPU load'),
  cpu_temperature: msg('CPU temperature'),
  memory_available: msg('Memory available'),
}

const NAVIGATION = new Set(['tf_localization', 'nav2'])
const COMPUTER = new Set(['cpu_load', 'cpu_temperature', 'memory_available'])

/**
 * Items every robot reports (the health contract's fixed ones). Sensors are whatever topics the robot is configured
 * with, so a sensor that is absent is not a fault; one of these absent means the robot does not report it.
 */
const BASELINE = ['tf_localization', 'nav2', 'cpu_load', 'cpu_temperature', 'memory_available']

const TITLES: Record<GroupId, string> = {
  sensors: msg('Sensors'),
  navigation: msg('Localization and navigation'),
  computer: msg('Computer'),
}

export function healthItemLabel(name: string): string {
  const known = LABELS[name]
  if (known) return t(known)
  const words = name.replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function groupOf(name: string): GroupId {
  if (NAVIGATION.has(name)) return 'navigation'
  if (COMPUTER.has(name)) return 'computer'
  return 'sensors'
}

function formatValue(item: Pick<RobotHealthItem, 'value' | 'unit'>): string | null {
  if (item.value === null || item.value === undefined) return null
  const rounded = Number.isInteger(item.value) ? String(item.value) : String(Number(item.value.toFixed(2)))
  return item.unit ? `${rounded} ${item.unit}` : rounded
}

function freshnessOf(item: RobotHealthItem, snapshotStale: boolean): Freshness {
  if (snapshotStale || item.level === 'STALE') return 'stale'
  if (item.level === 'UNKNOWN') return 'not_measured'
  return 'live'
}

/**
 * The rows of every group, from one health snapshot. With no snapshot at all (the robot never reported) there are no
 * groups: the page says so instead of listing a wall of "unknown".
 */
export function buildHealthGroups(health: RobotHealth | null | undefined): HealthGroup[] {
  if (!health || health.receivedAt === null) return []

  const rows = new Map<string, HealthRow>()
  for (const item of health.items) {
    rows.set(item.name, {
      key: item.name,
      label: healthItemLabel(item.name),
      level: item.level,
      freshness: freshnessOf(item, health.stale),
      value: formatValue(item),
      message: item.message,
      measuredAt: item.measuredAt,
    })
  }
  for (const name of BASELINE) {
    if (!rows.has(name)) {
      rows.set(name, { key: name, label: healthItemLabel(name), level: null, freshness: 'not_reported', value: null, message: null, measuredAt: null })
    }
  }

  const order: GroupId[] = ['sensors', 'navigation', 'computer']
  return order
    .map((id) => ({ id, title: t(TITLES[id]), rows: [...rows.values()].filter((row) => groupOf(row.key) === id) }))
    .filter((group) => group.rows.length > 0)
}

export interface HealthCounts {
  live: number
  warn: number
  error: number
  stale: number
  notMeasured: number
  notReported: number
}

/** How many rows are in each state (a live row counts as warn or error when the robot says so). */
export function countHealth(groups: HealthGroup[]): HealthCounts {
  const counts: HealthCounts = { live: 0, warn: 0, error: 0, stale: 0, notMeasured: 0, notReported: 0 }
  for (const row of groups.flatMap((group) => group.rows)) {
    if (row.freshness === 'stale') counts.stale += 1
    else if (row.freshness === 'not_measured') counts.notMeasured += 1
    else if (row.freshness === 'not_reported') counts.notReported += 1
    else if (row.level === 'ERROR') counts.error += 1
    else if (row.level === 'WARN') counts.warn += 1
    else counts.live += 1
  }
  return counts
}

/** "5 s ago", "3 min ago", "2 h ago"; "—" when there is no time. */
export function formatAge(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—'
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return t('{seconds} s ago', { seconds })
  if (seconds < 3600) return t('{minutes} min ago', { minutes: Math.round(seconds / 60) })
  if (seconds < 86_400) return t('{hours} h ago', { hours: Math.round(seconds / 3600) })
  return t('{days} days ago', { days: Math.round(seconds / 86_400) })
}

export function ageSeconds(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null
  return Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000))
}

/** A reading older than this is shown stale. The robot sends telemetry several times a second, heartbeats every few. */
export const TELEMETRY_STALE_SECONDS = 15
export const HEARTBEAT_STALE_SECONDS = 30
export const BATTERY_STALE_SECONDS = 120

/** live / stale for a timestamp the robot keeps refreshing; not_reported when it never has one. */
export function freshnessOfTime(iso: string | null | undefined, staleAfterSeconds: number, now: Date = new Date()): Freshness {
  const age = ageSeconds(iso, now)
  if (age === null) return 'not_reported'
  return age > staleAfterSeconds ? 'stale' : 'live'
}

export interface BatteryReading {
  percent: number | null
  voltage: string | null
  mode: string | null
  confidence: string | null
  charging: boolean
  measuredAt: string | null
  freshness: Freshness
}

/** The battery as the robot reported it. A missing value is null, never 0. */
export function readBattery(robot: Pick<Robot, 'batteryPercent' | 'batteryVoltage' | 'batteryEstimationMode' | 'batteryConfidence' | 'batteryMeasuredAt' | 'status'>, now: Date = new Date()): BatteryReading {
  return {
    percent: robot.batteryPercent ?? null,
    voltage: robot.batteryVoltage === null || robot.batteryVoltage === undefined ? null : `${Number(robot.batteryVoltage.toFixed(2))} V`,
    mode: robot.batteryEstimationMode ?? null,
    confidence: robot.batteryConfidence ?? null,
    charging: robot.status === 'CHARGING',
    measuredAt: robot.batteryMeasuredAt ?? null,
    freshness: robot.batteryPercent === null || robot.batteryPercent === undefined ? 'not_reported' : freshnessOfTime(robot.batteryMeasuredAt, BATTERY_STALE_SECONDS, now),
  }
}
