import { labelSheetHtml, type PrintLabel } from './labels'

/** QR payload of a label (app: shared/scan/scanCodes.ts qrPayload): WT:C:<container>, WT:V:<voucher>. */
export function qrPayload(kind: 'CONTAINER' | 'VOUCHER', code: string): string {
  return `WT:${kind === 'CONTAINER' ? 'C' : 'V'}:${code.trim()}`
}

export function containerLabels(codes: string[], title?: string, subtitle?: string): PrintLabel[] {
  return codes.map((code) => ({ code, qr: qrPayload('CONTAINER', code), title, subtitle }))
}

/** Opens an A4 sheet of labels in a new window and the browser's print dialog. */
export function printLabelSheet(labels: PrintLabel[], heading = 'WaroTrans labels') {
  const page = window.open('', '_blank', 'width=900,height=700')
  if (!page) return
  page.document.write(labelSheetHtml(labels, heading).replace('</body>', '<script>window.onload = () => window.print()</script></body>'))
  page.document.close()
}
