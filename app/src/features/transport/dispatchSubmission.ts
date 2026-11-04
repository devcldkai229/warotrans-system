import { createTransportRequest, queueTransportRequest, type CreateTransportRequestBody } from '../../shared/api/transportApi';

/** Keep the created request available when the separate queue command fails. */
export async function submitDispatch(body: CreateTransportRequestBody, autoQueue: boolean) {
  const created = await createTransportRequest(body);
  if (!autoQueue) return { created, queued: null, queueError: null };
  try {
    return { created, queued: await queueTransportRequest(created.id), queueError: null };
  } catch (error) {
    return { created, queued: null, queueError: error instanceof Error ? error.message : 'The request was submitted but could not be queued.' };
  }
}
