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

/** Words a technician reads instead of the codes (translated with t()). */
export const EVIDENCE_LABEL: Record<string, string> = {
  OPEN: 'Recording',
  FINALIZING: 'Finishing',
  FINALIZED: 'Complete',
  PARTIAL: 'Incomplete',
}

export const VIDEO_LABEL: Record<string, string> = {
  READY: 'Video ready',
  PROCESSING: 'Video processing',
  PARTIAL: 'Partial video',
  MISSING: 'No video',
}

export const SEVERITY_LABEL: Record<string, string> = {
  INFO: 'Info',
  WARNING: 'Warning',
  ERROR: 'Error',
  CRITICAL: 'Critical',
}
