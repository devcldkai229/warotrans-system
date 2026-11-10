import type { StockVoucherDetail } from '@/shared/api/warehouses'
import { newLocalId } from './labels'
import { emptyDraft, type ComposerContainer, type TransportRequestDraft } from './types'

/** A draft the composer opens with, plus the Containers it uses so they stay selectable. */
export interface ComposerPrefill {
  draft: TransportRequestDraft
  containers: ComposerContainer[]
}

/**
 * "Dispatch robots" from a confirmed stock voucher: one movement per Container not done yet. The source is the
 * Container's current shelf when it has one (outbound); staff still pick the workflow and the destinations.
 */
export function voucherPrefill(voucher: StockVoucherDetail, mapVersionId: string): ComposerPrefill {
  const lines = voucher.lines.filter((line) => !line.done)
  return {
    draft: {
      ...emptyDraft(),
      warehouseId: voucher.warehouseId,
      mapVersionId,
      note: voucher.referenceNo ? `${voucher.code} · ${voucher.referenceNo}` : voucher.code,
      movements: lines.map((line, index) => ({
        localId: newLocalId(),
        sequenceNo: index + 1,
        containerId: line.containerId,
        sourceStorageLocationId: line.currentStorageLocationId,
        sourceEndpointId: line.currentEndpointId ?? '',
        sourceLevelNo: line.currentLevelNo,
        destinationStorageLocationId: null,
        destinationEndpointId: '',
        destinationLevelNo: null,
        sourceAutoFilled: Boolean(line.currentEndpointId),
      })),
    },
    containers: lines.map((line) => ({
      id: line.containerId,
      barcode: line.containerBarcode,
      productName: line.productName,
      sku: line.productSku,
      status: line.containerStatus,
      currentStorageLocationId: line.currentStorageLocationId,
      currentLocationCode: line.currentStorageLocationCode,
      currentLocationName: line.currentStorageLocationCode,
      currentLevelNo: line.currentLevelNo,
      currentEndpointId: line.currentEndpointId,
      currentEndpointCode: null,
      currentEndpointName: null,
    })),
  }
}
