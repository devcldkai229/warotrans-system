import * as Print from 'expo-print';
import { labelSheetHtml, type PrintLabel } from './labels';
import { qrPayload } from './scanCodes';

/** Container labels for printing: the QR carries WT:C:<code>, the Code 128 the bare code. */
export function containerLabels(codes: string[], title?: string, subtitle?: string): PrintLabel[] {
  return codes.map(code => ({ code, qr: qrPayload('CONTAINER', code), title, subtitle }));
}

/** Opens the system print dialog (which can also save or share a PDF) with an A4 sheet of labels. */
export async function printLabels(labels: PrintLabel[], heading?: string): Promise<void> {
  await Print.printAsync({ html: labelSheetHtml(labels, heading) });
}
