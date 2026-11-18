import type { Tone } from '@/shared/ui/statusTones'

/** Evidence completeness (not the delivery result: that one is shown as the request's own status). */
export const EVIDENCE_TONE: Record<string, Tone> = {
  OPEN: 'blue',
  FINALIZING: 'teal',
  FINALIZED: 'green',
  PARTIAL: 'amber',
}

export const SEVERITY_TONE: Record<string, Tone> = {
  INFO: 'grey',
  WARNING: 'amber',
  ERROR: 'red',
  CRITICAL: 'rose',
}

export const VIDEO_TONE: Record<string, Tone> = {
  READY: 'green',
  PROCESSING: 'teal',
  PARTIAL: 'amber',
  MISSING: 'grey',
}
