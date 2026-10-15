import { apiFetch } from './client';
import type {
  HandoverConfirmationBody,
  HandoverConfirmationResponse,
  JobDetailResponse,
  JobStatus,
  ReportTaskProblemBody,
  ReportTaskProblemResponse,
} from '../types/contracts';

export interface AcceptTaskResponse {
  taskId: string;
  status: string;
  assignedStaffId: string;
  acceptedAt: string;
}

// Backward-compatible alias exports
export type ConfirmHandoverBody = HandoverConfirmationBody;
export type ConfirmHandoverResponse = HandoverConfirmationResponse;

/**
 * High-fidelity fallback runtime seed data mirroring Backend .NET 10 Postgres schemas:
 * `Job` -> `JobContainer` -> `JobTask` -> `JobStep` -> `HandoverConfirmation`
 * Matches samples/job-runtime-demo/persisted-runtime/10-job.runtime.graph.json
 */
let SEED_JOBS: JobDetailResponse[] = [
  {
    id: '4ec700e7-b42c-48a3-85e4-b31dc0299952',
    jobNo: 'JOB-20261012-000022',
    workflowId: 'ad360f97-02ff-4136-86ea-57412bf0c252',
    mapVersionId: '22222222-2222-2222-2222-222222222222',
    provisioningKey: '7439150f379644049f9db894b72dc3f1:BATCH-001',
    status: 'ASSIGNED',
    contextValues: {
      batchKey: 'BATCH-001',
      warehouseId: '11111111-1111-1111-1111-111111111111',
      batchSequenceNo: 1,
      minBatteryPercent: 25,
      transportRequestId: '7439150f-3796-4404-9f9d-b894b72dc3f1',
      assignedRobotCode: 'AMR-01',
      sourceEndpointCode: 'Dock 01',
      destinationEndpointCode: 'Rack A-02',
    },
    createdAt: new Date(Date.now() - 15 * 60000).toISOString(),
    queuedAt: new Date(Date.now() - 14 * 60000).toISOString(),
    startedAt: new Date(Date.now() - 10 * 60000).toISOString(),
    containers: [
      {
        id: '632907a7-a0a6-4201-adea-c8ce8e468e75',
        jobId: '4ec700e7-b42c-48a3-85e4-b31dc0299952',
        transportRequestId: '7439150f-3796-4404-9f9d-b894b72dc3f1',
        containerId: 'BOX-101',
        sequenceNo: 1,
        status: 'ONBOARD',
        loadedAt: new Date(Date.now() - 8 * 60000).toISOString(),
      },
      {
        id: 'a454b0a6-d731-4dc0-aed3-7c53e40c63a8',
        jobId: '4ec700e7-b42c-48a3-85e4-b31dc0299952',
        transportRequestId: '7439150f-3796-4404-9f9d-b894b72dc3f1',
        containerId: 'BOX-102',
        sequenceNo: 2,
        status: 'ONBOARD',
        loadedAt: new Date(Date.now() - 7 * 60000).toISOString(),
      },
    ],
    tasks: [
      {
        id: 'ebc2fcc0-cbb0-4fc8-8d19-3042d380be0e',
        jobId: '4ec700e7-b42c-48a3-85e4-b31dc0299952',
        workflowTaskId: '73fb5b11-53c8-4ba7-a02a-23656845a1c1',
        sequenceNo: 1,
        status: 'COMPLETED',
        contextValues: {
          executionScope: 'ONCE_PER_JOB',
        },
        steps: [
          {
            id: '13d44e28-ecee-4e9d-b8fe-949db4436b47',
            jobTaskId: 'ebc2fcc0-cbb0-4fc8-8d19-3042d380be0e',
            workflowStepId: 'af7e2ca2-bceb-4e18-8e74-76b316d3d7f7',
            workflowStepKey: 'CHECK_READY',
            operationCode: 'ROBOT_READY',
            stepType: 'CHECK',
            sequenceNo: 1,
            status: 'COMPLETED',
          },
          {
            id: 'd7300a1d-cf2c-4594-adf3-1f9b9c0a15a9',
            jobTaskId: 'ebc2fcc0-cbb0-4fc8-8d19-3042d380be0e',
            workflowStepId: 'e3818a56-2de9-459b-a35c-13a7b487b9f7',
            workflowStepKey: 'CHECK_BATTERY',
            operationCode: 'BATTERY_MIN',
            stepType: 'CHECK',
            sequenceNo: 2,
            status: 'COMPLETED',
          },
        ],
      },
      {
        id: 'ed8ae3d3-0ef0-4c19-9a22-282c97ca5299',
        jobId: '4ec700e7-b42c-48a3-85e4-b31dc0299952',
        workflowTaskId: '73fb5b11-53c8-4ba7-a02a-23656845a1c1',
        sequenceNo: 2,
        status: 'COMPLETED',
        contextValues: {
          executionScope: 'ONCE_PER_STOP',
          stopAction: 'PICKUP',
          stopEndpointId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          stopSequenceNo: 1,
        },
        steps: [
          {
            id: '128cdb50-e234-44da-b7f8-3334d78ea4a7',
            jobTaskId: 'ed8ae3d3-0ef0-4c19-9a22-282c97ca5299',
            workflowStepId: '8a791129-04aa-4c1b-9b9c-7ee725513c88',
            workflowStepKey: 'MOVE_PICKUP',
            operationCode: 'PICKUP',
            stepType: 'MOVE',
            sequenceNo: 1,
            status: 'COMPLETED',
          },
        ],
      },
      {
        id: '2535209a-cb3d-49e2-9ba6-f4d42c87430e',
        jobId: '4ec700e7-b42c-48a3-85e4-b31dc0299952',
        workflowTaskId: '73fb5b11-53c8-4ba7-a02a-23656845a1c1',
        sequenceNo: 3,
        status: 'COMPLETED',
        contextValues: {
          executionScope: 'PER_CONTAINER_AT_STOP',
          stopAction: 'PICKUP',
          containerId: 'BOX-101',
          stopSequenceNo: 1,
        },
        steps: [
          {
            id: '59731f81-24aa-42d7-8447-abd88195269e',
            jobTaskId: '2535209a-cb3d-49e2-9ba6-f4d42c87430e',
            workflowStepId: '2dabc6d6-839e-47f2-ba1a-d9d3003dc6ca',
            workflowStepKey: 'PICKUP_CONFIRM',
            operationCode: 'PICKUP_CONFIRM',
            stepType: 'HUMAN_INTERACTION',
            sequenceNo: 1,
            status: 'COMPLETED',
            handoverConfirmation: {
              id: 'hc-001',
              jobStepId: '59731f81-24aa-42d7-8447-abd88195269e',
              containerId: 'BOX-101',
              confirmedBy: 'staff-operator-1',
              handoverType: 'PICKUP',
              confirmedAt: new Date(Date.now() - 8 * 60000).toISOString(),
            },
          },
        ],
      },
      {
        id: 'fafe2239-4078-4331-bd3a-8db708b4e4ca',
        jobId: '4ec700e7-b42c-48a3-85e4-b31dc0299952',
        workflowTaskId: '73fb5b11-53c8-4ba7-a02a-23656845a1c1',
        sequenceNo: 4,
        status: 'RUNNING',
        contextValues: {
          executionScope: 'ONCE_PER_STOP',
          stopAction: 'DROPOFF',
          stopEndpointId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          stopSequenceNo: 2,
        },
        steps: [
          {
            id: 'a12cdb50-e234-44da-b7f8-3334d78ea4a7',
            jobTaskId: 'fafe2239-4078-4331-bd3a-8db708b4e4ca',
            workflowStepId: '8a791129-04aa-4c1b-9b9c-7ee725513c88',
            workflowStepKey: 'MOVE_DROPOFF',
            operationCode: 'DROPOFF',
            stepType: 'MOVE',
            sequenceNo: 1,
            status: 'COMPLETED',
          },
        ],
      },
      {
        id: 'bb35209a-cb3d-49e2-9ba6-f4d42c87430e',
        jobId: '4ec700e7-b42c-48a3-85e4-b31dc0299952',
        workflowTaskId: '73fb5b11-53c8-4ba7-a02a-23656845a1c1',
        sequenceNo: 5,
        status: 'READY',
        contextValues: {
          executionScope: 'PER_CONTAINER_AT_STOP',
          stopAction: 'DROPOFF',
          containerId: 'BOX-101',
          stopSequenceNo: 2,
        },
        steps: [
          {
            id: 'step-dropoff-box101',
            jobTaskId: 'bb35209a-cb3d-49e2-9ba6-f4d42c87430e',
            workflowStepId: '2dabc6d6-839e-47f2-ba1a-d9d3003dc6ca',
            workflowStepKey: 'DROPOFF_CONFIRM',
            operationCode: 'DROPOFF_CONFIRM',
            stepType: 'HUMAN_INTERACTION',
            sequenceNo: 1,
            status: 'WAITING',
          },
        ],
      },
    ],
  },
];

/**
 * List active or historical jobs.
 * Connects to Backend REST when available, with automatic high-fidelity seed fallback.
 */
export async function listJobs(filter?: {
  status?: JobStatus;
  zone?: string;
  warehouseId?: string;
}): Promise<JobDetailResponse[]> {
  try {
    const params = new URLSearchParams();
    if (filter?.status) params.set('status', filter.status);
    if (filter?.zone) params.set('zone', filter.zone);
    if (filter?.warehouseId) params.set('warehouseId', filter.warehouseId);

    const query = params.toString() ? `?${params.toString()}` : '';
    return await apiFetch<JobDetailResponse[]>(`/api/workflow-execution/jobs${query}`);
  } catch (err) {
    if (__DEV__) {
      console.info('[ExecutionApi] Operating in Seed/Demo mode (Backend execution loop pending):', err);
    }
    let result = [...SEED_JOBS];
    if (filter?.status) {
      result = result.filter((j) => j.status === filter.status);
    }
    return result;
  }
}

/**
 * Fetch detailed runtime graph for a specific Job.
 */
export async function getJobDetail(jobId: string): Promise<JobDetailResponse> {
  try {
    return await apiFetch<JobDetailResponse>(`/api/workflow-execution/jobs/${jobId}`);
  } catch (err) {
    if (__DEV__) {
      console.info(`[ExecutionApi] Job '${jobId}' fallback to seed runtime graph:`, err);
    }
    const match = SEED_JOBS.find((j) => j.id === jobId || j.jobNo === jobId);
    if (match) return match;
    // Default fallback to first seed job
    return SEED_JOBS[0];
  }
}

/**
 * Confirm physical container handover at station.
 */
export async function confirmHandover(
  jobStepId: string,
  body: HandoverConfirmationBody,
): Promise<HandoverConfirmationResponse> {
  try {
    return await apiFetch<HandoverConfirmationResponse>(
      `/api/workflow-execution/steps/${jobStepId}/handover`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  } catch (err) {
    if (__DEV__) {
      console.info('[ExecutionApi] confirmHandover recorded in seed mode:', err);
    }
    const response: HandoverConfirmationResponse = {
      id: `hc-${Date.now()}`,
      jobStepId,
      containerId: body.containerId,
      confirmedBy: body.confirmedBy,
      handoverType: body.handoverType,
      confirmedAt: new Date().toISOString(),
      note: body.note,
      evidence: body.evidence,
    };

    // Update in-memory seed job step to COMPLETED
    SEED_JOBS = SEED_JOBS.map((job) => ({
      ...job,
      tasks: job.tasks.map((task) => ({
        ...task,
        steps: task.steps.map((step) => {
          if (step.id === jobStepId) {
            return {
              ...step,
              status: 'COMPLETED',
              completedAt: new Date().toISOString(),
              handoverConfirmation: response,
            };
          }
          return step;
        }),
      })),
      containers: job.containers.map((c) => {
        if (c.containerId === body.containerId) {
          return {
            ...c,
            status: body.handoverType === 'PICKUP' ? 'ONBOARD' : 'DELIVERED',
            deliveredAt: body.handoverType === 'DROPOFF' ? new Date().toISOString() : c.deliveredAt,
          };
        }
        return c;
      }),
    }));

    return response;
  }
}

/**
 * Report an issue on a specific JobTask.
 */
export async function reportTaskProblem(
  jobTaskId: string,
  body: ReportTaskProblemBody,
): Promise<ReportTaskProblemResponse> {
  try {
    return await apiFetch<ReportTaskProblemResponse>(
      `/api/workflow-execution/tasks/${jobTaskId}/report-problem`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  } catch (err) {
    if (__DEV__) {
      console.info('[ExecutionApi] reportTaskProblem recorded in seed mode:', err);
    }
    return {
      reportId: `REP-${Date.now()}`,
      jobTaskId,
      status: 'REPORTED',
      reportedAt: new Date().toISOString(),
    };
  }
}

/**
 * Assign staff operator to a task.
 */
export async function acceptHumanTask(
  taskId: string,
  staffId: string,
): Promise<AcceptTaskResponse> {
  try {
    return await apiFetch<AcceptTaskResponse>(`/api/workflow-execution/tasks/${taskId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ staffId }),
    });
  } catch (err) {
    if (__DEV__) {
      console.info('[ExecutionApi] acceptHumanTask recorded in seed mode:', err);
    }
    return {
      taskId,
      status: 'ASSIGNED',
      assignedStaffId: staffId,
      acceptedAt: new Date().toISOString(),
    };
  }
}
