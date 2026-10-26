import type { RequestInputField } from '../../shared/api/workflowApi';

/** Request progress alone does not identify a waiting handover or recovery job. */
export function requestStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    SUBMITTED: 'Submitted', QUEUED: 'Queued', IN_PROGRESS: 'In Progress',
    PARTIALLY_COMPLETED: 'Partially Completed', COMPLETED: 'Completed',
    CANCELLED: 'Cancelled', REJECTED: 'Rejected', FAILED: 'Failed',
  };
  return labels[status] || status;
}

/** Parse only the staff fields declared by the selected server workflow. */
export function parseStaffInputs(fields: RequestInputField[], values: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const value = (values[field.key] || '').trim();
    if (!value) {
      if (field.required) throw new Error(`${field.label || field.key} is required.`);
      continue;
    }
    switch (field.dataType) {
      case 'INTEGER':
      case 'DECIMAL': {
        const number = Number(value);
        if (!Number.isFinite(number) || (field.dataType === 'INTEGER' && !Number.isInteger(number))) {
          throw new Error(`${field.label} must be a valid ${field.dataType.toLowerCase()}.`);
        }
        result[field.key] = number;
        break;
      }
      case 'BOOLEAN':
        if (!['true', 'false'].includes(value.toLowerCase())) throw new Error(`${field.label} must be true or false.`);
        result[field.key] = value.toLowerCase() === 'true';
        break;
      case 'UUID':
        if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value) || /^0{8}(?:-0{4}){3}-0{12}$/.test(value)) {
          throw new Error(`${field.label} must be a valid ID.`);
        }
        result[field.key] = value;
        break;
      case 'DATETIME':
        if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`${field.label} must be an ISO date and time.`);
        result[field.key] = new Date(value).toISOString();
        break;
      case 'STRING': result[field.key] = value; break;
      default: throw new Error(`The server field type ${field.dataType} is not supported.`);
    }
  }
  return result;
}
