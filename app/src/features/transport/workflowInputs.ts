import type { JsonValue, RequestInputFieldDto } from '../../shared/types/contracts';
export function coerceWorkflowInputs(fields: RequestInputFieldDto[], values: Record<string, string>): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const field of fields) {
    const raw = values[field.key]?.trim() ?? '';
    if (!raw) { if (field.required) throw new Error(`${field.label} Is Required.`); continue; }
    switch (field.dataType) {
      case 'INTEGER':
        if (!/^[+-]?\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error(`${field.label} Must Be An Integer.`);
        result[field.key] = Number(raw); break;
      case 'DECIMAL':
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw) || !Number.isFinite(Number(raw))) throw new Error(`${field.label} Must Be A Number.`);
        result[field.key] = Number(raw); break;
      case 'BOOLEAN':
        if (raw !== 'true' && raw !== 'false') throw new Error(`${field.label} Must Be True Or False.`);
        result[field.key] = raw === 'true'; break;
      case 'UUID':
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) throw new Error(`${field.label} Must Be A UUID.`);
        result[field.key] = raw; break;
      case 'DATETIME':
        if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw) || !Number.isFinite(Date.parse(raw))) throw new Error(`${field.label} Must Be An ISO Date With Time Zone.`);
        result[field.key] = new Date(raw).toISOString(); break;
      case 'STRING': result[field.key] = raw; break;
      default: throw new Error(`Unsupported Input Type: ${field.dataType} (${field.label}).`);
    }
  }
  return result;
}
export function optionalLevel(raw: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  if (!/^\d+$/.test(raw.trim()) || !Number.isInteger(value) || value < 1 || value > 32767) throw new Error('Level Must Be An Integer From 1 To 32767.');
  return value;
}
