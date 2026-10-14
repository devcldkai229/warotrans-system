import type { TransportRequestDraft } from './types'

export interface SubmitResult {
  ok: true
  requestCode: string
  /** Mock payload — not persisted. */
  draft: TransportRequestDraft
}

/**
 * UI-only submit. Does not call the backend.
 * TODO(backend): POST TransportRequest + details; replace this adapter.
 */
export async function submitTransportRequest(draft: TransportRequestDraft): Promise<SubmitResult> {
  const requestCode = `TR-DRAFT-${Date.now().toString(36).toUpperCase()}`
  console.info('[TransportRequestComposer] TODO(backend) submitTransportRequest', { requestCode, draft })
  await Promise.resolve()
  return { ok: true, requestCode, draft }
}
