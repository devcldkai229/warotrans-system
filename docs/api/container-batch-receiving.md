# Container batches and stock vouchers

Updated 2026-11-18.

Staff enters the Products, box counts and contents before creating Containers and barcodes.

## Route and compatibility

Use the existing `POST /api/warehouse/containers`, with the existing authenticated `ContainerCreate` permission. ADMIN and STAFF retain access through the current role matrix.

| Request | Result |
| --- | --- |
| Existing single shape, without `groups` | Existing `201 Created`, Location header and single Container response |
| New receiving shape, `groups` supplied, including one box | `200 OK`, batch receipt; first success has `replayed: false`, retry has `replayed: true` |

Legacy example remains valid:

```json
{ "productId": "11111111-1111-1111-1111-111111111111" }
```

The legacy shape retains its previous optional supplier barcode, initial location/level and DRAFT inbound voucher attachment behavior. It has no new quantity guarantee; legacy Container quantities remain `null`. Mobile Stock Vouchers should use the new grouped shape even for **one** box.

Unknown JSON members are rejected with 400, including misspelled count fields, so an intended multi-box request cannot silently become a legacy single-box create.

## Receiving request

Use real warehouse and Product IDs and the server-created DRAFT inbound voucher ID in this example. Generate `requestId` once and retain it for the submission and every retry. Concurrent requests with the same ID wait for one write and then replay the stored receipt.

```json
{
  "warehouseId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "requestId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  "stockVoucherId": "dddddddd-dddd-dddd-dddd-dddddddddddd",
  "containerCount": 10,
  "groups": [
    {
      "groupKey": "product-a",
      "productId": "11111111-1111-1111-1111-111111111111",
      "containerCount": 6,
      "quantityPerContainer": 24,
      "unit": "pcs",
      "quantityOverrides": [
        { "containerNo": 2, "quantity": 18 }
      ]
    },
    {
      "groupKey": "product-b",
      "productId": "22222222-2222-2222-2222-222222222222",
      "containerCount": 4,
      "quantityPerContainer": 12,
      "unit": "pcs"
    }
  ]
}
```

This creates six boxes of Product A (five containing 24 pieces and box 2 containing 18), plus four boxes of Product B containing 12 pieces each. Root `containerCount` must equal the sum of group counts; it counts boxes, not pieces.

Rules:

- Active warehouse; all Products must exist and be active.
- 1–9999 boxes total. Counts are positive integers; at least one group is required.
- `groupKey`: client-generated, unique within the request after trimming, case-sensitive, at most 64 characters. Keep it stable through retries.
- `quantityPerContainer`: positive, at most `999999999999999.999`, with at most 3 decimal places (`decimal(18,3)`).
- `unit`: required nonblank string, at most 32 characters after trimming. Currently descriptive; there is no unit conversion/catalog validation.
- `quantityOverrides`: optional; `containerNo` is **1-based within its group**, unique and in range. Quantity follows the same precision/positivity rules. Override only the boxes that differ from the default.
- Optional `supplierPackageBarcode` belongs on each group, at most 128 characters; missing/blank falls back to the Product supplier barcode. This is separate from the unique WaroTrans barcode.
- Do not mix `groups` with root `productId`, root supplier barcode or `initialLevelNo`.
- `stockVoucherId` is optional for backward compatibility with unlinked batches. **Mobile inbound should supply it.** The voucher must be INBOUND, DRAFT, and belong to `warehouseId`; the actor also needs `VoucherWrite`. Containers and all their StockVoucherLines are created in one transaction, including batches over 200. Do not call the legacy add-lines API after a successful linked batch. Its old per-call limit remains separate.
- Omit `initialStorageLocationId` for new batches. A supplied location returns 400 `batch_initial_location_not_supported`. A replay of an old request still resolves its existing receipt.

## Receipt and idempotency

The response contains `requestId`, `warehouseId`, `containerCount`, `replayed`, `items`, and nullable `stockVoucher`. For linked batches, `stockVoucher` is the full server detail, including every persisted line with its real Container barcode, contents and line ID. Existing lines or other batches on that voucher are also included. Each item contains:

| Field | Meaning |
| --- | --- |
| `id`, `barcode` | Persisted Container ID and unique WaroTrans barcode (`CTN-yyyyMMdd-...`) |
| `productId` | Product in this box |
| `groupKey`, `containerNo` | Stable mapping to the submitted group and box, suitable for printed labels |
| `contentsQuantity`, `contentsUnit` | Effective quantity/unit after overrides |
| `supplierPackageBarcode` | Supplier barcode, if any |
| `status` | `CREATED` on first success |
| `currentStorageLocationId`, `currentEndpointId` | Both null on first success |
| `createdAt` | Persisted UTC timestamp |

Order is request-group order, then increasing `containerNo`. Render/print only the **successfully returned** persisted IDs/barcodes. Client previews must not invent them.

Retry the same payload with the same `requestId` and same account, including after a timeout or unknown network result. The server returns the same Container IDs/barcodes and creates no extra boxes, including when identical requests arrive concurrently. Decimal scale, override ordering and surrounding whitespace on `labelBarcode` are normalized. Group order, Product, quantity, unit, warehouse, target voucher, explicit location and the selected pre-printed label are part of the request intent.

Reusing a `requestId` for a different payload/account returns 409 `container_creation_request_conflict`. When a user deliberately changes an already submitted batch, first resolve the prior outcome, then start a genuinely new operation with a new ID. Do not auto-generate a new ID on network failure or conflict.

A replay of a linked batch also reads the **current** voucher detail, even after confirmation or cancellation. It does not recreate intentionally removed lines or change the voucher. A replay reads **current** Container status/location; it does not move existing goods back to Inbound or reset them to CREATED. Replay succeeds even if the Product has since become unavailable. Partial receipt data returns 409 `container_creation_receipt_incomplete`; it is not silently replenished. This receipt is retained on Container rows; they must not be hard-deleted to recycle a request ID.

## Inbound

1. Create an INBOUND draft with `POST /api/warehouse/stock-vouchers`. The metadata-only create has no idempotency key. Persist the returned voucher ID before creating the batch.
2. Create the batch with `groups`, `stockVoucherId` and a stable `requestId`. Every Container starts `CREATED` with null location and endpoint. The response includes the linked draft and its lines.
3. Call `POST /api/warehouse/stock-vouchers/{id}/confirm` with no body. A successful confirmation sets `stockPostedAt`, marks each Container admitted to this warehouse and leaves it `CREATED` with null location and endpoint. Every line needs complete contents and an active Product. Active transport, a conflicting voucher or incompatible custody blocks the entire confirmation.
4. Use `INBOUND_PUTAWAY` with any enabled Inbound gate on the current published map as `sourceEndpointId`, and a shelf as `destinationStorageLocationId` with its matching `destinationEndpointId`. The shelf balance and Container status/location update when robot delivery posts. Retried handovers preserve a single stock allocation per Container.

A gate is an enabled Navigation `WAYPOINT` with an `INBOUND` or `OUTBOUND` token in its endpoint code, separated by a hyphen, underscore or space. Codes such as `EP-INBOUND-A` and `EP-OUTBOUND-02` allow multiple gates per published map. The old `WarehouseReceiving:InboundStorageLocations` setting and dedicated setup script were retired.

`GET /api/warehouse/inventory?warehouseId=...` returns `warehouseContainerCount` and `unallocatedContainerCount` for the whole warehouse, independent of pagination and search. New admitted Containers count immediately as unallocated. Putaway turns that admission into an `InventoryStock` balance at the destination without increasing the warehouse total. While booked stock is in transit or staged, the balance stays at its last accounting location. Read Container status, location and endpoint for physical custody.

## Outbound

1. Create a TR to collect a `STORED` Container from its shelf and deliver it to an enabled Outbound gate on the published map. Use `destinationEndpointId` with a null `destinationStorageLocationId`. This route is allowed before any OUTBOUND voucher exists.
2. After delivery posts, `GET /api/warehouse/containers?warehouseId=...&eligibleOnly=false&status=STAGED_OUTBOUND` returns candidates. Their `currentEndpointId` is the gate where they were delivered and their `currentStorageLocationId` is null. Filter out `inActiveTransport` in the UI. The warehouse total remains unchanged.
3. Create an OUTBOUND draft. Send `{ "containerIds": [...] }` to `POST /api/warehouse/stock-vouchers/{id}/lines`, up to 200 IDs per call. The endpoint adds only IDs absent from this draft, so repeating the same selection returns the same lines. Only explicit Container IDs are accepted. Product/count picking for forming TRs remains separate.
4. Confirm the draft after reviewing all selected lines. The server checks that each box is staged at an enabled Outbound gate of this warehouse, is free of active transport and belongs to no other live OUTBOUND voucher. A voucher can include boxes from several TRs or gates. A failing line rejects the entire confirmation.
5. Success deducts every selected box from its accounting slot, records an `ISSUED` movement with its previous gate, clears physical location and endpoint and sets `stockPostedAt` with `CONFIRMED`. Repeating confirmation returns the same posting timestamp and current detail. The transaction commits all deductions, movements and status changes together.

Common 400 errors include `voucher_container_not_at_outbound`, `container_contents_incomplete` and `inbound_source_not_gate`. Common 409 errors include `voucher_container_in_transport`, `voucher_container_on_other_voucher`, `inventory_balance_missing`, `inbound_stock_not_posted` and `outbound_stock_not_posted`. The last two errors identify an older CONFIRMED voucher with no posting receipt. Older OUTBOUND drafts require their selected rows to be staged before confirmation. Goods already on a robot when upgrading from the old stock-debit workflow may require reconciliation if their accounting slot was removed before the new flow.

## Warehouse synchronization after a handover

`GET /api/transportation/transport-requests/{id}` includes `details[].warehouseSync` for confirmed handovers in the Execution outbox as well as postings already queued by Transportation. `pickup` and `delivery` are each nullable. A posting contains `jobId`, `status`, `recordedAt`, `postedAt` and `nextAttemptAt`.

- `PENDING` means the handover was recorded and Warehouse still has to apply it.
- `RETRYING` means an attempt to queue or apply the posting failed and the server will try again. Repeated Warehouse posting failures raise a separate issue.
- `POSTED` means the Warehouse posting completed. `postedAt` is present even when an earlier attempt failed.

A missing posting means this endpoint has no receipt for the handover. A completed Job or transport detail can coexist with a pending Warehouse posting. Refresh the transport request to read the new posting status while the server retries.

## Product creation during receiving

`POST /api/warehouse/products` requires `product.create`, granted to Admin and Staff. The request takes `categoryId` for an existing category, `sku`, `name`, and optional `supplierBarcode` and `description`. The API returns the active Product on `201`. A duplicate returns `409 product_sku_taken` or `409 product_supplier_barcode_taken`. The app can select the returned Product for the batch immediately after the operator submits the Product form.

## Deployment

Apply Warehouse migrations through `20261118054034_AddGateStagingAndUnlocatedReceiving` before running the updated BE. The migration adds Container warehouse ownership and endpoint custody, records endpoint IDs for movements and preserves existing booked balances. Apply Transportation migrations through `20261120075239_IndexStockPostingsByRequest` to index the handover status lookup. Coordinate the upgrade with completion of in-flight TRs, especially pickups made under the old accounting rules.

Apply WorkflowExecution migration `20261121065048_QueueStockHandovers` before activating handover confirmation on the updated BE. It creates the Execution outbox for new handovers. Reconcile any older handovers with a missing Warehouse posting against their original Job and Container movements before proceeding with those goods.

Mobile FE can use both directions on the updated BE. For outbound, replace the shelf/`STORED` preview predicate with `STAGED_OUTBOUND` and display the returned endpoint. For inbound, render null location as None and select a gate only when composing putaway.
