export const MAX_ISSUE_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_ISSUE_PHOTOS = 4;

export type IssuePhotoMimeType = 'image/jpeg' | 'image/png';

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function detectPhotoMimeType(bytes: Uint8Array): IssuePhotoMimeType | null {
  if (!bytes || bytes.byteLength < 3) return null;
  if (JPEG_MAGIC.every((b, i) => bytes[i] === b)) {
    return 'image/jpeg';
  }
  if (bytes.byteLength >= PNG_MAGIC.length && PNG_MAGIC.every((b, i) => bytes[i] === b)) {
    return 'image/png';
  }
  return null;
}

export function validatePhotoUploadBytes(
  bytes: Uint8Array,
): { ok: true; mimeType: IssuePhotoMimeType } | { ok: false; code: string; message: string } {
  if (!bytes || bytes.byteLength === 0) {
    return {
      ok: false,
      code: 'issue_photo_invalid',
      message: 'Select a JPEG or PNG image up to 2 MiB.',
    };
  }
  if (bytes.byteLength > MAX_ISSUE_PHOTO_BYTES) {
    return {
      ok: false,
      code: 'issue_photo_too_large',
      message: 'Use a JPEG or PNG photo up to 2 MiB.',
    };
  }
  const mimeType = detectPhotoMimeType(bytes);
  if (!mimeType) {
    return {
      ok: false,
      code: 'issue_photo_type_unsupported',
      message: 'Select a JPEG or PNG image up to 2 MiB.',
    };
  }
  return { ok: true, mimeType };
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = (() => {
  const table = new Int16Array(128);
  table.fill(-1);
  for (let i = 0; i < BASE64_ALPHABET.length; i += 1) {
    table[BASE64_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

export function decodeBase64ToBytes(rawBase64: string): Uint8Array {
  const comma = rawBase64.indexOf(',');
  const cleaned = (comma >= 0 && rawBase64.slice(0, comma).includes('base64')
    ? rawBase64.slice(comma + 1)
    : rawBase64
  ).replace(/\s+/g, '');
  if (!cleaned) return new Uint8Array(0);
  const eqIndex = cleaned.indexOf('=');
  if (eqIndex >= 0) {
    const padding = cleaned.slice(eqIndex);
    if (padding.length > 2 || /[^=]/.test(padding) || cleaned.length % 4 !== 0) {
      throw new Error('Invalid base64 padding');
    }
  }
  const body = eqIndex >= 0 ? cleaned.slice(0, eqIndex) : cleaned;
  if (body.length % 4 === 1) {
    throw new Error('Invalid base64 string');
  }
  const outputLength = Math.floor((body.length * 3) / 4);
  const out = new Uint8Array(outputLength);
  let outIndex = 0;
  for (let i = 0; i < body.length; i += 4) {
    const c0 = body.charCodeAt(i);
    const c1 = body.charCodeAt(i + 1);
    const c2 = i + 2 < body.length ? body.charCodeAt(i + 2) : -1;
    const c3 = i + 3 < body.length ? body.charCodeAt(i + 3) : -1;
    const v0 = c0 < 128 ? BASE64_LOOKUP[c0] : -1;
    const v1 = c1 < 128 ? BASE64_LOOKUP[c1] : -1;
    const v2 = c2 === -1 ? 0 : (c2 < 128 ? BASE64_LOOKUP[c2] : -1);
    const v3 = c3 === -1 ? 0 : (c3 < 128 ? BASE64_LOOKUP[c3] : -1);
    if (v0 < 0 || v1 < 0 || v2 < 0 || v3 < 0) {
      throw new Error('Invalid base64 character');
    }
    const triple = (v0 << 18) | (v1 << 12) | (v2 << 6) | v3;
    out[outIndex++] = (triple >> 16) & 0xff;
    if (c2 !== -1) out[outIndex++] = (triple >> 8) & 0xff;
    if (c3 !== -1) out[outIndex++] = triple & 0xff;
  }
  return out;
}

export function encodeBytesToBase64(bytes: Uint8Array): string {
  if (!bytes || bytes.byteLength === 0) return '';
  const chunks: string[] = [];
  for (let i = 0; i < bytes.byteLength; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.byteLength;
    const hasB2 = i + 2 < bytes.byteLength;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    chunks.push(
      BASE64_ALPHABET[(triple >> 18) & 0x3f]
      + BASE64_ALPHABET[(triple >> 12) & 0x3f]
      + (hasB1 ? BASE64_ALPHABET[(triple >> 6) & 0x3f] : '=')
      + (hasB2 ? BASE64_ALPHABET[triple & 0x3f] : '='),
    );
  }
  return chunks.join('');
}

export function isIssuePhotoPath(uri: string | null | undefined): uri is string {
  if (typeof uri !== 'string') return false;
  const trimmed = uri.trim();
  return /^\/api\/operations\/issues\/[^/]+\/evidence\/photos\/[^/]+$/.test(trimmed);
}

export function createIssuePhotoId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const rand = Math.floor(Math.random() * 16);
    const nibble = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return nibble.toString(16);
  });
}
