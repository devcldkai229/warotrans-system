// What a scanned code is. Kept in step with web/src/features/labels/scanCodes.ts.
//
// Printed labels carry the bare code in Code 128 and a prefixed payload in the QR (WT:<kind>:<code>) so a QR is never
// ambiguous; a typed or Code 128 code is recognised by its shape.

export type ScanKind = 'CONTAINER' | 'VOUCHER' | 'REQUEST' | 'JOB' | 'LOCATION' | 'PRODUCT';

export interface ScannedCode { kind: ScanKind; code: string; raw: string }

const QR_KINDS: Record<string, ScanKind> = { C: 'CONTAINER', V: 'VOUCHER', R: 'REQUEST', J: 'JOB', L: 'LOCATION', P: 'PRODUCT' };
const QR_LETTER: Record<ScanKind, string> = { CONTAINER: 'C', VOUCHER: 'V', REQUEST: 'R', JOB: 'J', LOCATION: 'L', PRODUCT: 'P' };

/** The QR payload printed on a label: WT:C:C181126001, WT:V:PN-20261118-000001, WT:L:SHELF-A-1. */
export function qrPayload(kind: ScanKind, code: string): string {
  return `WT:${QR_LETTER[kind]}:${code.trim()}`;
}

/** Recognise a scanned or typed code. Unknown shapes are treated as a product barcode (the server decides). */
export function classifyCode(raw: string): ScannedCode | null {
  const value = raw.trim();
  if (!value) return null;
  const prefixed = /^WT:([CVRJLP]):(.+)$/i.exec(value);
  if (prefixed) return { kind: QR_KINDS[prefixed[1].toUpperCase()], code: prefixed[2].trim(), raw: value };
  const upper = value.toUpperCase();
  if (/^C\d{9,}$/.test(upper) || /^CTN-\d{8}-\d{6}$/.test(upper)) return { kind: 'CONTAINER', code: upper, raw: value };
  if (/^(PN|PX)-[A-Z0-9-]+$/.test(upper)) return { kind: 'VOUCHER', code: upper, raw: value };
  if (/^R\d{9,}$/.test(upper) || /^REQ-\d{8}-\d{6}$/.test(upper)) return { kind: 'REQUEST', code: upper, raw: value };
  if (/^J\d{9,}$/.test(upper) || /^JOB-\d{8}-\d{6}$/.test(upper)) return { kind: 'JOB', code: upper, raw: value };
  if (/^SHELF-[A-Z0-9-]+$/.test(upper)) return { kind: 'LOCATION', code: upper, raw: value };
  return { kind: 'PRODUCT', code: value, raw: value };
}

export const SCAN_KIND_LABEL: Record<ScanKind, string> = {
  CONTAINER: 'Container', VOUCHER: 'Stock voucher', REQUEST: 'Transport request', JOB: 'Job', LOCATION: 'Shelf', PRODUCT: 'Product',
};

/**
 * Client half of "no double scans": the camera reports the same code many times a second, and a hand may scan the
 * same label twice. A code accepted within `windowMs` is dropped. The server refuses real duplicates on its own
 * (a used label, an already confirmed step).
 */
export function createScanGuard(windowMs = 2000, now: () => number = Date.now) {
  const seen = new Map<string, number>();
  return (code: string): boolean => {
    const key = code.trim().toUpperCase();
    const at = now();
    const last = seen.get(key);
    if (last !== undefined && at - last < windowMs) return false;
    seen.set(key, at);
    return true;
  };
}
