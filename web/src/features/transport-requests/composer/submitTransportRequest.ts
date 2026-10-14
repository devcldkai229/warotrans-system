import { createTransportRequest, type CreateTransportRequestResponse } from '@/shared/api/transportRequests'
import { toCreateRequestBody } from './toCreateRequestBody'
import type { TransportRequestDraft } from './types'

export interface SubmitResult {
  ok: true
  id: string
  requestCode: string
  response: CreateTransportRequestResponse
}

/** POST TransportRequest + Details. Does not queue or plan Jobs. */
export async function submitTransportRequest(
  draft: TransportRequestDraft,
  staffInputTypes: Record<string, string> = {},
): Promise<SubmitResult> {
  const response = await createTransportRequest(toCreateRequestBody(draft, staffInputTypes))
  return {
    ok: true,
    id: response.id,
    requestCode: response.requestCode,
    response,
  }
}
