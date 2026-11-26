import type { InventoryStockView } from '@/shared/api/contracts'
import { formatIsoDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Dialog'
import { ContainerList, DetailFooter, Facts } from './CatalogDetail'
import { t } from '@/shared/i18n'

/**
 * The Containers behind one stock row: this product at this location and level. Read-only, like the Inventory table:
 * stock changes only through the Container lifecycle.
 */
export function InventoryRowDialog({ row, onClose }: { row: InventoryStockView; onClose: () => void }) {
  return (
    <Modal title={row.productName} subtitle={`${row.sku} · ${row.locationCode} · ${t('Level')} ${row.levelNo}`} onClose={onClose} width="w-[860px]">
      <div className="px-6 py-5">
        <Facts
          items={[
            { label: t('Product'), value: `${row.productName} (${row.sku})` },
            { label: t('Location'), value: `${row.locationCode} · ${t('Level')} ${row.levelNo}` },
            { label: t('Containers'), value: row.containerCount },
            { label: t('Updated'), value: formatIsoDateTime(row.updatedAt) },
          ]}
        />
        <ContainerList productId={row.productId} storageLocationId={row.storageLocationId} levelNo={row.levelNo} showProduct={false} />
        <p className="mt-3 text-xs text-muted">{t('Stock changes only when containers are put away, picked or moved, so it cannot be edited here.')}</p>
      </div>
      <DetailFooter>
        <Button variant="ghost" onClick={onClose}>
          {t('Close')}
        </Button>
      </DetailFooter>
    </Modal>
  )
}
