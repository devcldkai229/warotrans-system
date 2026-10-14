import { apiFetch } from './client';

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

export function listPublishedWorkflows(params?: { code?: string }) {
  const query = new URLSearchParams();
  query.set('status', 'PUBLISHED');
  if (params?.code) query.set('code', params.code);
  const qs = query.toString();
  return apiFetch<ListWorkflowsResponse>(
    `/api/workflow-execution/workflows${qs ? `?${qs}` : ''}`,
  );
}

export function getWorkflow(id: string) {
  return apiFetch<WorkflowDetail>(`/api/workflow-execution/workflows/${id}`);
}

export function getWorkflowRequestInputSchema(id: string) {
  return apiFetch<WorkflowRequestInputSchema>(
    `/api/workflow-execution/workflows/${id}/request-input-schema`,
  );
}
