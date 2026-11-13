# Container receiving API — Product and quantity before barcode

Updated: 2026-11-13. Owner: BE. FE integration: Antigravity.

User decision: Staff enters the full batch (Products, number of boxes, contents of each box), then creates the Containers and their barcodes. This supersedes the earlier barcode-first/allocation proposal in the mobile handoff. There is no Product-less Container or separate barcode reservation API/table.

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

The UUIDs below are illustrative; use real warehouse/Product IDs. `requestId` must be generated once and retained for this submission and any retry.

```json
{
  "warehouseId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "requestId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
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
- Do not mix `groups` with root `productId`, root supplier barcode, `initialLevelNo` or `stockVoucherId`.
- Omit `initialStorageLocationId`; the server uses its configured Inbound. If supplied, it must match that configuration.

## Receipt and idempotency

The response contains `requestId`, `warehouseId`, `containerCount`, `replayed`, and `items`. Each item contains:

| Field | Meaning |
| --- | --- |
| `id`, `barcode` | Persisted Container ID and unique WaroTrans barcode (`CTN-yyyyMMdd-...`) |
| `productId` | Product in this box |
| `groupKey`, `containerNo` | Stable mapping to the submitted group and box, suitable for printed labels |
| `contentsQuantity`, `contentsUnit` | Effective quantity/unit after overrides |
| `supplierPackageBarcode` | Supplier barcode, if any |
| `status` | `CREATED` on first success |
| `currentStorageLocationId`, `currentEndpointId` | Configured Inbound on first success |
| `createdAt` | Persisted UTC timestamp |

Order is request-group order, then increasing `containerNo`. Render/print only the **successfully returned** persisted IDs/barcodes. Client previews must not invent them.

Retry the same payload with the same `requestId` and same account, including after a timeout or unknown network result. The server returns the same Container IDs/barcodes and creates no extra boxes, including when identical requests arrive concurrently. Differences in decimal scale or override ordering do not change effective intent. Changing group order, Product, quantity, unit, warehouse or explicit location does change intent.

Reusing a `requestId` for a different payload/account returns 409 `container_creation_request_conflict`. When a user deliberately changes an already submitted batch, first resolve the prior outcome, then start a genuinely new operation with a new ID. Do not auto-generate a new ID on network failure or conflict.

A replay reads **current** Container status/location; it does not move existing goods back to Inbound or reset them to CREATED. Replay succeeds even if the Product or receiving configuration has since become unavailable. Partial receipt data returns 409 `container_creation_receipt_incomplete`; it is not silently replenished. This receipt is retained on Container rows; they must not be hard-deleted to recycle a request ID.

## Server Inbound configuration and deployment

There is currently no canonical Inbound endpoint type in the Navigation schema. The server therefore requires an explicit warehouse-to-StorageLocation mapping instead of guessing by code/name or accepting an arbitrary client location.

```json
{
  "WarehouseReceiving": {
    "InboundStorageLocations": {
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa": "cccccccc-cccc-cccc-cccc-cccccccccccc"
    }
  }
}
```

An environment configuration key has the form `WarehouseReceiving__InboundStorageLocations__<warehouse-uuid>` and the value is the real StorageLocation UUID. Use canonical dashed warehouse UUID keys. Empty defaults are intentional: no demo/production IDs are hardcoded.

The configured StorageLocation must be active, belong to that warehouse, and point to an enabled WAYPOINT on its PUBLISHED map. Warehouse reads this through the existing `IMapEndpointCatalog` boundary. After publishing/rebinding maps, verify this configuration still identifies the intended receiving dock.

| Condition | HTTP / code |
| --- | --- |
| Invalid request/count/quantity | 400 `validation_failed` (unknown/malformed JSON: 400) |
| Explicit location differs from configured Inbound | 400 `container_receiving_location_mismatch` |
| Missing/inactive warehouse or Product | 404 `warehouse_not_found` / `product_not_found` |
| No configured Inbound | 409 `inbound_location_not_configured` |
| Wrong/inactive receiving StorageLocation | 409 `inbound_location_invalid` |
| Endpoint unavailable/disabled/not on published map | 409 `inbound_endpoint_unavailable` |
| Missing authentication / permission | 401 / 403 |

Apply Warehouse migration `20261113083127_AddContainerBatchContents` before deploying the changed API, using the environment's normal migration procedure. It adds nullable contents/receipt columns, a filtered unique request/ordinal index and integrity checks on the existing Container table. No backfilled Product/quantity is invented for old data. The migration has been exercised in both directions on disposable PostgreSQL with a legacy row retained. It has **not** been applied to the shared/demo database by this task.

## Boundaries and next FE step

Creating a new receiving batch is atomic. A database failure on any box leaves no box from that attempt. Code allocation uses a separate sequence transaction: failed/concurrent losing attempts may leave gaps in code numbering; a code is never reused or returned as a successful Container before the Container commit.

This operation does **not** create a stock voucher, post inventory, create a Transport Request or dispatch a Job. After receipt success, FE should retain the returned Container IDs/barcodes, support label printing/reprinting, and use them to create the inbound voucher. If voucher creation fails, retry that step using the existing Containers; do not recreate the batch.

`GET /api/warehouse/containers/{id}`, the barcode lookup, Container lists and stock voucher detail lines now expose nullable `contentsQuantity` / `contentsUnit`. The Container detail additionally exposes `creationRequestId`, `creationGroupKey`, `creationGroupOrdinal`. Null on old data means unknown, not zero. Quantity is descriptive goods per box; existing InventoryStock counts boxes.

The later voucher-confirmation work must enforce the agreed receipt/issue posting rules (inbound stock on voucher effectiveness; outbound selected boxes all staged at Outbound) and prevent transport before the required stock admission. This batch API upgrade does not declare that remaining BE work complete. FE capability flags should only be enabled after the backend/migration/configuration in the target environment are verified.

## Verification

- Unit suite: 847 passed, 3 existing skips, 0 failed.
- Architecture suite: 11 passed, 0 failed.
- Isolated PostgreSQL suite: 7 passed, 0 failed. `ContainerBatchPostgresTests` covers migration/legacy compatibility, real endpoint/auth/validation, contents persistence, concurrent retries, all-or-none rollback, shared code-sequence concurrency and real published-map endpoint checks.

For integration verification, point `WAROTRANS_CONTAINER_TEST_POSTGRES` at a **disposable** PostgreSQL server whose user can create databases, then run only:

```sh
dotnet test backend/tests/WaroTrans.IntegrationTests/WaroTrans.IntegrationTests.csproj \
  --filter 'FullyQualifiedName~ContainerBatchPostgresTests'
```

Each test creates/drops only a randomly named database it owns. It does not use the application's integration fixture/reset/seed or start robot, MQTT or notification services. Without that explicit variable these tests are skipped.
