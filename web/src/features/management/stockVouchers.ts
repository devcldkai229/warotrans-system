import { useQuery } from '@tanstack/react-query'
import {
  listStockVouchers,
  type StockVoucherDetail,
  type StockVoucherStatus,
  type StockVoucherType,
} from '@/shared/api/warehouses'
import type { Tone } from '@/shared/ui/statusTones'

export const VOUCHERS_KEY = ['warehouse', 'stock-vouchers'] as const

/** The working Warehouse's vouchers, newest first. Shared by the menu count and the section. */
export function useStockVouchers(warehouseId: string | null) {
  return useQuery({
    queryKey: [...VOUCHERS_KEY, 'list', warehouseId],
    queryFn: () => listStockVouchers({ warehouseId: warehouseId!, take: 200 }),
    enabled: Boolean(warehouseId),
  })
}

export const VOUCHER_TYPE_LABEL: Record<StockVoucherType, string> = {
  INBOUND: 'Inbound',
  OUTBOUND: 'Outbound',
}

export const VOUCHER_TYPE_TONE: Record<StockVoucherType, Tone> = {
  INBOUND: 'blue',
  OUTBOUND: 'purple',
}

export const VOUCHER_STATUS_TONE: Record<StockVoucherStatus, Tone> = {
  DRAFT: 'amber',
  CONFIRMED: 'green',
  CANCELLED: 'grey',
}

/** What "done" means for a line: on a shelf for inbound, issued for outbound. */
export function doneLabel(type: StockVoucherType): string {
  return type === 'INBOUND' ? 'on shelf' : 'issued'
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

/** Opens a plain printable copy of the voucher in a new window and starts the browser's print dialog. */
export function printVoucher(voucher: StockVoucherDetail) {
  const title = voucher.type === 'INBOUND' ? 'PHIẾU NHẬP KHO' : 'PHIẾU XUẤT KHO'
  const rows = voucher.lines
    .map(
      (line) =>
        `<tr><td>${line.lineNo}</td><td>${escapeHtml(line.containerBarcode)}</td><td>${escapeHtml(line.productSku)}</td>` +
        `<td>${escapeHtml(line.productName)}</td><td>${escapeHtml(line.currentStorageLocationCode ?? '—')}` +
        `${line.currentLevelNo ? ` / L${line.currentLevelNo}` : ''}</td></tr>`,
    )
    .join('')
  const summary = voucher.products
    .map((product) => `<tr><td>${escapeHtml(product.productSku)}</td><td>${escapeHtml(product.productName)}</td><td>${product.containerCount}</td></tr>`)
    .join('')
  const meta = [
    ['Số phiếu', voucher.code],
    ['Kho', `${voucher.warehouseCode} · ${voucher.warehouseName}`],
    ['Chứng từ tham chiếu', voucher.referenceNo ?? '—'],
    ['Ngày lập', new Date(voucher.createdAt).toLocaleString('vi-VN')],
    ['Ngày xác nhận', voucher.confirmedAt ? new Date(voucher.confirmedAt).toLocaleString('vi-VN') : 'Chưa xác nhận'],
    ['Ghi chú', voucher.note ?? '—'],
  ]
    .map(([label, value]) => `<div><b>${label}:</b> ${escapeHtml(value)}</div>`)
    .join('')

  const page = window.open('', '_blank', 'width=900,height=700')
  if (!page) return
  page.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(voucher.code)}</title>
<style>
  body { font: 13px/1.5 system-ui, sans-serif; color: #111; margin: 32px; }
  h1 { text-align: center; font-size: 20px; margin: 0 0 4px; }
  .code { text-align: center; color: #555; margin-bottom: 20px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
  th { background: #eee; }
  .signs { display: grid; grid-template-columns: 1fr 1fr 1fr; text-align: center; margin-top: 40px; }
  .signs div { min-height: 90px; }
</style></head><body>
<h1>${title}</h1><div class="code">${escapeHtml(voucher.code)}</div>
<div class="meta">${meta}</div>
<h3>Tổng hợp theo sản phẩm (đơn vị: Container)</h3>
<table><thead><tr><th>SKU</th><th>Sản phẩm</th><th>Số Container</th></tr></thead><tbody>${summary}</tbody>
<tfoot><tr><th colspan="2">Tổng</th><th>${voucher.containerCount}</th></tr></tfoot></table>
<h3>Chi tiết Container</h3>
<table><thead><tr><th>#</th><th>Container</th><th>SKU</th><th>Sản phẩm</th><th>Vị trí hiện tại</th></tr></thead><tbody>${rows}</tbody></table>
<div class="signs"><div><b>Người lập phiếu</b></div><div><b>Thủ kho</b></div><div><b>Người ${voucher.type === 'INBOUND' ? 'giao' : 'nhận'} hàng</b></div></div>
</body></html>`)
  page.document.close()
  page.focus()
  page.print()
}
