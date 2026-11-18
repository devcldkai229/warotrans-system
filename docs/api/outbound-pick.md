# Preview and submit an Outbound TR by Product

Staff chooses a Product, a number of boxes and an Outbound gate before reviewing the exact Containers. This flow uses the existing transport workflow, map and role checks. The selection is for the transport request. Stock voucher creation still takes explicit Container IDs after staging.

## Preview

`POST /api/transportation/transport-requests/outbound-pick-preview` requires `transport.create`.

```json
{
  "warehouseId": "<warehouse UUID>",
  "mapVersionId": "<published map UUID>",
  "productId": "<product UUID>",
  "containerCount": 2,
  "destinationEndpointId": "<Outbound gate UUID>"
}
```

Use one Product and one enabled Outbound gate per request, with 1 to 200 boxes. Both the gate and candidate shelves must be available on the published map. The server considers stocked Containers for an active Product in this warehouse, excluding Containers with active transport, pending recovery, or unapplied Warehouse handovers.

FIFO orders by the inbound voucher's `stockPostedAt`. For legacy stock, the fallback is the first recorded shelf delivery or recovery in this warehouse. Boxes without either record are excluded from automatic FIFO. Equal timestamps are ordered by barcode, then Container ID. Barcode creation time does not determine priority.

The response contains `requestedCount`, `isComplete` and `items`. Each item has `barcode`, `sourceStorageLocationCode`, `admittedAt` and a `detail` in the existing Create TR format. The detail includes the actual shelf and level, source endpoint, destination endpoint and null destination storage fields. If fewer than the requested number qualify, `isComplete` is false and `items` contains the eligible subset. Show the shortfall and let Staff adjust the count or Product before reviewing again.

Preview performs no writes and holds no reservation. The app should discard the old preview when Product, count, warehouse, map or destination changes.

## Submit

Use the existing `POST /api/transportation/transport-requests` with the published `OUTBOUND_RETRIEVAL` workflow, required workflow inputs and `details: preview.items.map(item => item.detail)`. Add the following field to select the FIFO path.

```json
{
  "outboundFifo": {
    "productId": "<the preview Product UUID>",
    "containerCount": 2
  }
}
```

Submit the exact reviewed details and sequence numbers. The API recalculates FIFO and compares the reviewed Container IDs, sources, levels, order and destination. When the selection changes, it returns `409 outbound_fifo_selection_changed`. Refresh the preview and ask Staff to review the new list before submitting. The server never commits a reduced or substituted selection.

The successful response is the usual `201 Created` receipt. The request owns its selected Containers while the details remain active. Submissions sharing a Container are serialized before the reservation check, including requests using the existing manual selection format. If submission returns an unknown network result, look for the existing TR before retrying. When creation succeeds but queueing fails, retry queueing that TR by ID.

The Queue and Job start steps use the existing workflow. The issue-voucher picker shows this shipment after delivery has posted as `STAGED_OUTBOUND` at the selected gate. The later issue voucher remains independent of this FIFO selection. See [Container batches and stock vouchers](container-batch-receiving.md).
