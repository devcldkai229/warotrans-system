import { apiFetch } from './client';
import type { WorkflowListItemDto, WorkflowDetailDto, WorkflowRequestInputSchemaDto, RequestInputFieldDto } from '../types/contracts';
export type WorkflowListItem = WorkflowListItemDto;
export type WorkflowDetail = WorkflowDetailDto;
export type WorkflowRequestInputSchema = WorkflowRequestInputSchemaDto;
export type RequestInputField = RequestInputFieldDto;
export interface ListWorkflowsResponse { items: WorkflowListItem[]; total: number }
export function listPublishedWorkflows(params?: { code?: string }) {
  const query = new URLSearchParams({ status: 'PUBLISHED' });
  if (params?.code) query.set('code', params.code);
  return apiFetch<ListWorkflowsResponse>(`/api/workflow-execution/workflows?${query}`);
}
export function getWorkflow(id: string) {
  return apiFetch<WorkflowDetail>(`/api/workflow-execution/workflows/${id}`);
}
export function getWorkflowRequestInputSchema(id: string) {
  return apiFetch<WorkflowRequestInputSchema>(`/api/workflow-execution/workflows/${id}/request-input-schema`);
}
