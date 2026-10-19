import { apiFetch } from './client';
import { normalizeWorkflowDisplayName } from './warehouseApi';

export interface RequestInputField {
  key: string;
  dataType: 'STRING' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'UUID' | 'DATETIME' | string;
  required: boolean;
  label: string;
  description: string | null;
}

export interface WorkflowRequestInputSchema {
  workflowId: string;
  workflowInputs: RequestInputField[];
  movementInputs: RequestInputField[];
}

export interface WorkflowListItem {
  id: string;
  code: string;
  name: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | string;
  updatedAt: string;
}

export interface ListWorkflowsResponse {
  items: WorkflowListItem[];
  total: number;
}

export interface WorkflowDetail {
  id: string;
  code: string;
  name: string;
  version: number;
  status: string;
  variables: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  createdAt: string;
  updatedAt: string;
}

export async function listPublishedWorkflows(params?: { code?: string }) {
  const query = new URLSearchParams();
  query.set('status', 'PUBLISHED');
  if (params?.code) query.set('code', params.code);
  const qs = query.toString();
  const res = await apiFetch<ListWorkflowsResponse>(
    `/api/workflow-execution/workflows${qs ? `?${qs}` : ''}`,
  );
  if (res?.items) {
    return {
      ...res,
      items: res.items.map((w) => ({
        ...w,
        name: normalizeWorkflowDisplayName(w.code, w.name),
      })),
    };
  }
  return res;
}

export async function getWorkflow(id: string) {
  const res = await apiFetch<WorkflowDetail>(`/api/workflow-execution/workflows/${id}`);
  return res ? { ...res, name: normalizeWorkflowDisplayName(res.code, res.name) } : res;
}

export function getWorkflowRequestInputSchema(id: string) {
  return apiFetch<WorkflowRequestInputSchema>(
    `/api/workflow-execution/workflows/${id}/request-input-schema`,
  );
}
