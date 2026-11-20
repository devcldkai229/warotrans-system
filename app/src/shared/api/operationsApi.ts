import {
  apiFetch,
  ApiError,
  getAccessToken,
  getApiBaseUrl,
  getFreshAccessToken,
} from './client';
import {
  encodeBytesToBase64,
  isIssuePhotoPath,
  type IssuePhotoMimeType,
  validatePhotoUploadBytes,
} from '../../features/safety/issuePhotoData';
import type {
  HazardType,
  IssueReportResponse,
  IssueSeverity,
  IssueStatus,
  ListIssuesResponse,
} from '../types/contracts';

const callerToken = () => (typeof getAccessToken === 'function' ? getAccessToken() : undefined);

const VALID_HAZARD_TYPES = new Set<HazardType>([
  'LIQUID_SPILL',
  'FALLEN_CARGO',
  'FACILITY_WORK',
  'FORKLIFT_TRAFFIC',
  'OTHER',
]);
const VALID_HAZARD_SEVERITIES = new Set<IssueSeverity>(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export interface ReportWarehouseHazardBody {
  requestId: string;
  mapVersionId: string;
  hazardType: HazardType;
  severity: IssueSeverity;
  description: string;
  edgeId?: string | null;
  zoneId?: string | null;
  endpointId?: string | null;
}

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

export async function reportWarehouseHazard(
  body: ReportWarehouseHazardBody,
): Promise<IssueReportResponse> {
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  const mapVersionId = typeof body.mapVersionId === 'string' ? body.mapVersionId.trim() : '';
  if (!requestId || !mapVersionId || !VALID_HAZARD_TYPES.has(body.hazardType) || !VALID_HAZARD_SEVERITIES.has(body.severity)) {
    throw new ApiError(400, 'hazard_request_invalid', 'Select hazard type, severity, and a published warehouse map.');
  }
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!description || description.length > 2000) {
    throw new ApiError(400, 'hazard_description_invalid', 'Describe the hazard in 1 to 2000 characters.');
  }
  const edgeId = typeof body.edgeId === 'string' && body.edgeId.trim() ? body.edgeId.trim() : null;
  const zoneId = typeof body.zoneId === 'string' && body.zoneId.trim() ? body.zoneId.trim() : null;
  const endpointId = typeof body.endpointId === 'string' && body.endpointId.trim() ? body.endpointId.trim() : null;
  const locationCount = [edgeId, zoneId, endpointId].filter(Boolean).length;
  if (locationCount !== 1) {
    throw new ApiError(400, 'hazard_location_invalid', 'Select one active corridor, zone, or station on the published map.');
  }
  const created = await apiFetch<IssueReportResponse>(
    '/api/operations/hazards',
    {
      method: 'POST',
      body: JSON.stringify({
        requestId,
        mapVersionId,
        hazardType: body.hazardType,
        severity: body.severity,
        description,
        edgeId,
        zoneId,
        endpointId,
      }),
    },
    callerToken(),
  );
  if (!created || typeof created.id !== 'string' || typeof created.code !== 'string' || !created.hazard?.locationCode) {
    throw new ApiError(502, 'issue_invalid', 'Could not read hazard ticket details from the server.');
  }
  return created;
}

export async function uploadIssuePhoto(
  issueId: string,
  photoId: string,
  expectedVersion: number,
  bytes: Uint8Array,
  mimeType?: IssuePhotoMimeType,
): Promise<IssueReportResponse> {
  const trimmedPhotoId = typeof photoId === 'string' ? photoId.trim() : '';
  if (!trimmedPhotoId || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new ApiError(400, 'issue_photo_request_invalid', 'Provide a photo UUID and the current issue version.');
  }
  const checked = validatePhotoUploadBytes(bytes);
  if (!checked.ok) {
    throw new ApiError(checked.code === 'issue_photo_too_large' ? 413 : 400, checked.code, checked.message);
  }
  if (mimeType && mimeType !== checked.mimeType) {
    throw new ApiError(400, 'issue_photo_invalid', 'The photo bytes do not match the content type.');
  }
  const query = new URLSearchParams({
    photoId: trimmedPhotoId,
    expectedVersion: String(expectedVersion),
  });
  const updated = await apiFetch<IssueReportResponse>(
    `/api/operations/issues/${encodeURIComponent(issueId)}/evidence/photos?${query}`,
    {
      method: 'POST',
      headers: { 'Content-Type': checked.mimeType },
      body: bytes as unknown as BodyInit,
    },
    callerToken(),
  );
  if (!updated || updated.id !== issueId) {
    throw new ApiError(502, 'issue_invalid', 'Could not read issue details from the server.');
  }
  return updated;
}

export async function readAuthorizedIssuePhotoDataUrl(
  uri: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!isIssuePhotoPath(uri)) {
    throw new ApiError(400, 'issue_photo_not_found', 'Invalid issue photo path.');
  }
  const token = typeof getFreshAccessToken === 'function' ? await getFreshAccessToken(30) : callerToken();
  if (!token) {
    throw new ApiError(401, 'unauthenticated', 'Your session could not be verified. Please sign in again.');
  }
  const baseUrl = typeof getApiBaseUrl === 'function' ? getApiBaseUrl().replace(/\/+$/, '') : '';
  const response = await fetch(`${baseUrl}${uri.trim()}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!response.ok) {
    throw new ApiError(response.status, 'issue_photo_not_found', 'Could not load photo');
  }
  const rawType = response.headers.get('content-type')?.split(';', 2)[0].trim().toLowerCase();
  const buffer = new Uint8Array(await response.arrayBuffer());
  const mime = rawType === 'image/jpeg' || rawType === 'image/png' ? rawType : validatePhotoUploadBytes(buffer);
  const resolvedMime = typeof mime === 'string' ? mime : mime.ok ? mime.mimeType : null;
  if (!resolvedMime) {
    throw new ApiError(502, 'issue_photo_invalid', 'Could not load photo');
  }
  return `data:${resolvedMime};base64,${encodeBytesToBase64(buffer)}`;
}
