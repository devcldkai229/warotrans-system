import type { MappingGridMessage, MappingPose, MappingSessionStatus } from '@/shared/api/mapping'
import { t } from '@/shared/i18n'

/** Decoded live map: one byte per cell, rows bottom-up as the robot sent them. */
export interface MappingGrid {
  width: number
  height: number
  resolution: number
  originX: number
  originY: number
  cells: Uint8Array
  knownAreaM2: number
}

export const UNKNOWN = 255

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/** zlib (RFC 1950, what Python's zlib.compress writes) is the browser's 'deflate' format. */
export async function inflateZlib(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function decodeGrid(message: MappingGridMessage): Promise<MappingGrid> {
  if (message.encoding !== 'zlib+base64') throw new Error(`unsupported encoding ${message.encoding}`)
  const cells = await inflateZlib(base64ToBytes(message.cells))
  if (cells.length !== message.width * message.height) {
    throw new Error(`grid has ${cells.length} cells, expected ${message.width}x${message.height}`)
  }
  return {
    width: message.width,
    height: message.height,
    resolution: message.resolution,
    originX: message.originX,
    originY: message.originY,
    cells,
    knownAreaM2: message.knownAreaM2,
  }
}

/** Grey level of one cell as map_saver draws it: free white, occupied black, unknown grey; in between shaded. */
export function cellShade(value: number): number {
  if (value === UNKNOWN) return 205
  if (value >= 65) return 0
  if (value <= 25) return 254
  return Math.round(254 - (value / 100) * 254)
}

/** RGBA pixels, top row first (image order), for a canvas of width x height. */
export function gridToRgba(grid: MappingGrid): Uint8ClampedArray<ArrayBuffer> {
  const { width, height, cells } = grid
  const out = new Uint8ClampedArray(new ArrayBuffer(width * height * 4))
  for (let row = 0; row < height; row++) {
    const src = (height - 1 - row) * width
    for (let col = 0; col < width; col++) {
      const shade = cellShade(cells[src + col])
      const i = (row * width + col) * 4
      out[i] = shade
      out[i + 1] = shade
      out[i + 2] = shade
      out[i + 3] = 255
    }
  }
  return out
}

/** Map-frame metres → pixel of the grid image (column, row from the top). */
export function worldToPixel(grid: Pick<MappingGrid, 'height' | 'resolution' | 'originX' | 'originY'>, x: number, y: number) {
  return {
    col: (x - grid.originX) / grid.resolution,
    row: grid.height - (y - grid.originY) / grid.resolution,
  }
}

/** Where the robot is: inside the mapped area, on its edge, or not known yet. */
export function poseInsideGrid(grid: MappingGrid | null, pose: MappingPose | null): boolean {
  if (!grid || !pose) return false
  const { col, row } = worldToPixel(grid, pose.x, pose.y)
  return col >= 0 && row >= 0 && col <= grid.width && row <= grid.height
}

export function formatElapsed(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const total = Math.max(0, Math.round(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** What the operator may do in each state. */
export function mappingActions(status: MappingSessionStatus) {
  return {
    canDrive: status === 'MAPPING',
    canFinish: status === 'MAPPING',
    canCancel: status === 'STARTING' || status === 'MAPPING',
    waiting: status === 'STARTING' || status === 'SAVING' || status === 'CANCELLING',
    closed: status === 'COMPLETED' || status === 'CANCELLED' || status === 'FAILED',
  }
}

export const mappingSessionKey = (id: string) => ['mapping', 'session', id] as const
export const mappingPreviewKey = (id: string) => ['mapping', 'preview', id] as const
export const mappingRobotsKey = (warehouseId: string) => ['mapping', 'robots', warehouseId] as const
export const openMappingSessionsKey = (warehouseId: string) => ['mapping', 'open', warehouseId] as const

/** Why a robot cannot build a map now, in words. */
const REASON_TEXT: Record<string, () => string> = {
  robot_disabled: () => t('Disabled'),
  robot_offline: () => t('Offline'),
  robot_in_maintenance: () => t('In maintenance'),
  robot_busy: () => t('Running a command or a Job'),
  robot_motion_held: () => t('Held by STOP'),
  robot_manual_mode: () => t('Driven by someone else'),
  mapping_session_open: () => t('Already building a map'),
}

export const mappingReasonText = (code: string) => REASON_TEXT[code]?.() ?? code
