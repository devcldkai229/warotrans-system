import { apiFetch, ApiError, getAccessToken } from './client';
import type { IssueReportResponse, IssueStatus, ListIssuesResponse } from '../types/contracts';

const callerToken = () => (typeof getAccessToken === 'function' ? getAccessToken() : undefined);

export async function listIssues(
  filter: { jobId?: string; status?: string; mine?: boolean; take?: number } = {},
  signal?: AbortSignal,
): Promise<ListIssuesResponse> {
  const query = new URLSearchParams();
  if (filter.jobId) query.set('jobId', filter.jobId);
  if (filter.status) query.set('status', filter.status);
  if (filter.mine) query.set('mine', 'true');
  query.set('take', String(Math.min(100, Math.max(1, filter.take ?? 50))));
  const data = await apiFetch<ListIssuesResponse>(`/api/operations/issues?${query}`, { signal });
  if (!data || !Array.isArray(data.items) || typeof data.total !== 'number') {
    throw new ApiError(502, 'issue_list_invalid', 'Could not read issues from the server.');
  }
  return data;
}

export async function getIssue(issueId: string, signal?: AbortSignal): Promise<IssueReportResponse> {
  const issue = await apiFetch<IssueReportResponse>(
    `/api/operations/issues/${encodeURIComponent(issueId)}`,
    { signal },
  );
  if (!issue || issue.id !== issueId) {
    throw new ApiError(502, 'issue_invalid', 'Could not read issue details from the server.');
  }
  return issue;
}

export async function resolveOwnHandoverIssue(
  issueId: string,
  body: { expectedVersion: number; scannedBarcode: string; resolution: string },
): Promise<IssueReportResponse> {
  if (!Number.isInteger(body.expectedVersion) || body.expectedVersion <= 0) {
    throw new ApiError(400, 'issue_resolve_invalid', 'Issue version is missing. Refresh before resolving.');
  }
  const scannedBarcode = body.scannedBarcode.trim();
  if (!scannedBarcode || scannedBarcode.length > 200) {
    throw new ApiError(400, 'issue_handover_barcode_mismatch', 'Scan the expected container barcode to resolve.');
  }
  const resolution = body.resolution.trim();
  if (!resolution || resolution.length > 1000) {
    throw new ApiError(400, 'issue_resolve_invalid', 'Enter a resolution note up to 1000 characters.');
  }
  const issue = await apiFetch<IssueReportResponse>(
    `/api/operations/issues/${encodeURIComponent(issueId)}/resolve-handover`,
    {
      method: 'POST',
      body: JSON.stringify({ expectedVersion: body.expectedVersion, scannedBarcode, resolution }),
    },
    callerToken(),
  );
  if (!issue || issue.id !== issueId) {
    throw new ApiError(502, 'issue_invalid', 'Could not read issue details from the server.');
  }
  return issue;
}

export async function transitionIssue(
  issueId: string,
  body: { status: IssueStatus; expectedVersion: number; resolution?: string | null; scannedBarcode?: string | null },
): Promise<IssueReportResponse> {
  if (!Number.isInteger(body.expectedVersion) || body.expectedVersion <= 0) {
    throw new ApiError(400, 'issue_resolve_invalid', 'Issue version is missing. Refresh before updating.');
  }
  const resolution = body.resolution?.trim() || null;
  if (body.status === 'RESOLVED' && !resolution) {
    throw new ApiError(400, 'issue_resolve_invalid', 'Resolving an issue needs a resolution note.');
  }
  const issue = await apiFetch<IssueReportResponse>(
    `/api/operations/issues/${encodeURIComponent(issueId)}/transition`,
    {
      method: 'POST',
      body: JSON.stringify({
        status: body.status,
        expectedVersion: body.expectedVersion,
        resolution,
        scannedBarcode: body.scannedBarcode?.trim() || null,
      }),
    },
    callerToken(),
  );
  if (!issue || issue.id !== issueId) {
    throw new ApiError(502, 'issue_invalid', 'Could not read issue details from the server.');
  }
  return issue;
}
