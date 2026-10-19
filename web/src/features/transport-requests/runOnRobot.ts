import { startJob } from '@/shared/api/jobs'
import { createTransportRequest, getTransportRequest, queueTransportRequest } from '@/shared/api/transportRequests'

/**
 * SUBMITTED request → queue (plan its Job) → start the Job.
 * Pass `robotId` to assign explicitly; omit it and the backend picks the best free robot on the map.
 * Returns the started Job id (for the live view).
 */
export async function queueAndStart(transportRequestId: string, robotId?: string): Promise<string> {
  const queued = await queueTransportRequest(transportRequestId)
  const first = queued.jobs[0]
  if (!first) throw new Error('The request was queued but no job was planned.')
  await startJob(first.jobId, robotId)
  return first.jobId
}

/**
 * Demo replay: submit a copy of a finished request (same workflow, map, containers and routes), then run it.
 * Fails with the backend's message when the map is no longer PUBLISHED or a container is busy elsewhere.
 */
export async function runAgain(transportRequestId: string): Promise<{ jobId: string; requestCode: string }> {
  const source = await getTransportRequest(transportRequestId)
  const created = await createTransportRequest({
    warehouseId: source.warehouseId,
    mapVersionId: source.mapVersionId,
    workflowId: source.workflowId,
    workflowInputs: source.workflowInputs ?? {},
    note: `Replay of ${source.requestCode}`,
    details: source.details.map((d) => ({
      sequenceNo: d.sequenceNo,
      containerId: d.containerId,
      sourceStorageLocationId: d.sourceStorageLocationId,
      sourceEndpointId: d.sourceEndpointId,
      sourceLevelNo: d.sourceLevelNo,
      destinationStorageLocationId: d.destinationStorageLocationId,
      destinationEndpointId: d.destinationEndpointId,
      destinationLevelNo: d.destinationLevelNo,
    })),
  })
  const jobId = await queueAndStart(created.id)
  return { jobId, requestCode: created.requestCode }
}
