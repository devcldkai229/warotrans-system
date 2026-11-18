// Label encoders shared by the app and the web console (web/src/features/labels/labels.ts): Code 128 (set B) bars
// and the QR module matrix, plus the printable HTML sheet. Pure functions; drawn as SVG rects by the views.
import QRCode from 'qrcode';

/** Code 128 symbol widths (bar, space, bar, space, bar, space), values 0..105, then STOP (7 widths). */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const STOP = 106;

/** Code 128 set B: the symbol values (start, data, checksum, stop) for printable ASCII. */
export function code128BValues(text: string): number[] {
  const data = [...text].map(char => {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 126) throw new Error(`"${char}" cannot be printed in Code 128 set B.`);
    return code - 32;
  });
  const checksum = data.reduce((sum, value, index) => sum + value * (index + 1), START_B) % 103;
  return [START_B, ...data, checksum, STOP];
}

/** Bar and space widths in modules, starting with a bar (no quiet zone). */
export function code128B(text: string): number[] {
  return code128BValues(text).flatMap(value => [...PATTERNS[value]].map(Number));
}

export interface QrMatrix { size: number; dark: (x: number, y: number) => boolean }

/** The QR module matrix (error correction M), for drawing as squares. */
export function qrMatrix(text: string): QrMatrix {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  return { size: modules.size, dark: (x, y) => !!modules.get(y, x) };
}

/** Dark QR modules as one SVG path in module units (fast to draw: one element). */
export function qrPath(matrix: QrMatrix): string {
  let path = '';
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) if (matrix.dark(x, y)) path += `M${x} ${y}h1v1h-1z`;
  }
  return path;
}

/** Code 128 bars as one SVG path, `height` units tall, starting at x = `quiet`. Returns the path and total width. */
export function code128Path(text: string, height: number, quiet = 10): { d: string; width: number } {
  let x = quiet;
  let d = '';
  code128B(text).forEach((width, index) => {
    if (index % 2 === 0) d += `M${x} 0h${width}v${height}h-${width}z`;
    x += width;
  });
  return { d, width: x + quiet };
}

export interface PrintLabel { code: string; qr: string; title?: string; subtitle?: string }

const escape = (value: string) => value.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] as string));

/** An A4 sheet of 3 x 8 labels (QR, Code 128, code, title) as printable HTML. */
export function labelSheetHtml(labels: PrintLabel[], heading = 'WaroTrans labels'): string {
  const cells = labels.map(label => {
    const qr = qrMatrix(label.qr);
    const bars = code128Path(label.code, 40);
    return `<div class="label">
  <svg class="qr" viewBox="-2 -2 ${qr.size + 4} ${qr.size + 4}"><rect x="-2" y="-2" width="${qr.size + 4}" height="${qr.size + 4}" fill="#fff"/><path d="${qrPath(qr)}" fill="#000"/></svg>
  <div class="text">
    <div class="code">${escape(label.code)}</div>
    ${label.title ? `<div class="title">${escape(label.title)}</div>` : ''}
    ${label.subtitle ? `<div class="sub">${escape(label.subtitle)}</div>` : ''}
    <svg class="bars" viewBox="0 0 ${bars.width} 40" preserveAspectRatio="none"><path d="${bars.d}" fill="#000"/></svg>
  </div>
</div>`;
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(heading)}</title><style>
  @page { size: A4; margin: 8mm; }
  body { margin: 0; font-family: -apple-system, Segoe UI, Roboto, sans-serif; }
  .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; }
  .label { height: 33mm; box-sizing: border-box; border: 0.2mm dashed #bbb; padding: 2mm; display: flex; gap: 2mm; align-items: center; break-inside: avoid; }
  .qr { width: 27mm; height: 27mm; flex: none; }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1mm; }
  .code { font: 700 4mm/1 ui-monospace, Menlo, Consolas, monospace; letter-spacing: 0.2mm; }
  .title { font-size: 2.8mm; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { font-size: 2.4mm; color: #555; }
  .bars { width: 100%; height: 9mm; }
</style></head><body><div class="sheet">
${cells}
</div></body></html>`;
}
