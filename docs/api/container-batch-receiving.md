# Container receiving API — Product and quantity before barcode

Updated: 2026-11-17. Owner: BE. FE integration: Antigravity.

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

The UUIDs below are illustrative; use real warehouse/Product IDs and the ID of the server-created DRAFT inbound voucher. `requestId` must be generated once and retained for this submission and any retry.

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
- Omit `initialStorageLocationId`; the server uses its configured Inbound. If supplied, it must match that configuration.

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
| `currentStorageLocationId`, `currentEndpointId` | Configured Inbound on first success |
| `createdAt` | Persisted UTC timestamp |

Order is request-group order, then increasing `containerNo`. Render/print only the **successfully returned** persisted IDs/barcodes. Client previews must not invent them.

Retry the same payload with the same `requestId` and same account, including after a timeout or unknown network result. The server returns the same Container IDs/barcodes and creates no extra boxes, including when identical requests arrive concurrently. Differences in decimal scale or override ordering do not change effective intent. Changing group order, Product, quantity, unit, warehouse, target voucher or explicit location does change intent.

Reusing a `requestId` for a different payload/account returns 409 `container_creation_request_conflict`. When a user deliberately changes an already submitted batch, first resolve the prior outcome, then start a genuinely new operation with a new ID. Do not auto-generate a new ID on network failure or conflict.

A replay of a linked batch also reads the **current** voucher detail, even after confirmation or cancellation. It does not recreate intentionally removed lines or change the voucher. A replay reads **current** Container status/location; it does not move existing goods back to Inbound or reset them to CREATED. Replay succeeds even if the Product or receiving configuration has since become unavailable. Partial receipt data returns 409 `container_creation_receipt_incomplete`; it is not silently replenished. This receipt is retained on Container rows; they must not be hard-deleted to recycle a request ID.

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

Apply both Warehouse migrations before running the changed API:

1. `20261113083127_AddContainerBatchContents`: nullable contents/creation-receipt columns on Container.
2. `20261114101712_AddAtomicInboundVoucherPosting`: creation-voucher link, inbound stock-admission link, accounting location/level and `StockVoucher.stockPostedAt`, with integrity checks/FKs. No new domain tables.

Neither migration invents quantities or admissions for legacy Containers or backfills document-only confirmations as posted stock.

For local Development, `appsettings.Development.json` explicitly maps Kho ONE (`55c88958-d994-48d3-ae5d-11991476673f`) to receiving StorageLocation `473896d8-f634-4807-9c89-e2c264a30eae`. Run `backend/scripts/configure-kho-one-inbound.sql` on the intended dev database after migration. It creates only that location on the existing enabled `EP-INBOUND` of Kho ONE's published map. It refuses absent/ambiguous endpoints or a conflicting existing location; it never creates/publishes a map or guesses another warehouse. Production defaults remain empty.

Start the BE from **feature/stock-voucher-backend** (or a branch containing it), with `ASPNETCORE_ENVIRONMENT=Development` to load this dev mapping. Starting an older checkout or another environment will not use these changes/configuration.

## Mobile inbound workflow and capability gates

1. `POST /api/warehouse/stock-vouchers` with warehouse/type metadata to obtain a real INBOUND DRAFT. Persist its returned ID before allocation. This existing metadata-only create is not an idempotent operation: do not blindly auto-retry it after an unknown network result.
2. `POST /api/warehouse/containers` with `stockVoucherId`, full `groups`, total count, warehouse and stable `requestId`. Receive every new Container **and** the voucher's complete lines in the same committed result. Stock is still unchanged. Print/reprint only persisted returned barcodes.
3. `POST /api/warehouse/stock-vouchers/{id}/confirm` with no body. INBOUND confirmation validates the complete line set and writes stock/document/admission markers in one transaction.
4. Retry the same batch request after an unknown batch result, or the same confirm endpoint after an unknown confirm result. Both are idempotent, including concurrent calls. Reopen server voucher detail to reconcile; never create a fresh batch to recover an already committed one.
5. Only after posting, create the inbound TR/putaway. Admission keeps Container lifecycle status CREATED/PACKED until movement; the existing TR voucher check and a receiving-batch movement guard prevent putaway before admission.

FE can enable `mobileCapabilities.createContainer = true` for this integrated receiving flow and `mobileCapabilities.confirmStockVoucher = true` **with an INBOUND-only action guard**, once running against this BE/migrated/configured environment. This change is BE-owned; Antigravity owns the FE switch/integration and iPhone acceptance. It does not assert the FE flags have already been edited or that the iPhone test has run.

**OUTBOUND confirmation remains unavailable** and returns 501 `outbound_stock_posting_not_supported`. Do not expose its Confirm action through a global flag. Staged eligibility and outbound/TR posting remain the next work item.

## Inbound confirmation and putaway accounting

Confirm requires a nonempty INBOUND DRAFT, active warehouse and Products, complete positive contents/unit, every Container physically at its configured Inbound (level null/1), matching line Products, no active transport and no conflicting live inbound voucher/admission. It fails the entire operation if any line is ineligible. No FIFO substitution or partial success.

On first success: `status = CONFIRMED`, immutable `confirmedBy`/`confirmedAt`, and nonnull **`stockPostedAt`**. InventoryStock increases by the number of boxes per Product at Inbound, level 1. Quantities inside boxes remain descriptive, not InventoryStock counts. Detail GET and batch receipt include `stockPostedAt`; `doneCount` continues to mean robot progress, not stock admission.

A retry of a posted confirmation returns the same posting timestamp and current detail before mutable Product/location eligibility checks. A legacy CONFIRMED voucher with null `stockPostedAt` returns 409 `inbound_stock_not_posted` and requires reconciliation; the server does not pretend that its old document-only confirmation posted stock. Cancelled vouchers cannot be confirmed, and confirmed vouchers cannot be edited/cancelled through draft actions.

New Containers retain `InboundStockVoucherId` and an accounting location/level. At pickup physical `CurrentStorageLocationId` becomes null/IN_TRANSIT, but the counted balance stays at the last accounting location while the robot carries it. At shelf delivery/recovery, the same transaction subtracts the old accounting slot and adds the destination slot, then updates physical location and status. Total warehouse stock stays constant during pickup, transport, putaway, recovery and relocation; duplicate delivery events do not add stock again. Per-location InventoryStock is this accounting allocation, **not an assertion that every counted box is physically on that shelf during transport**. Use Container custody/status for physical tracking.

Endpoint-only drops of admitted goods retain stock and enter HOLD; they do not issue goods. Missing/inconsistent balances or invalid cross-warehouse transfer destinations fail for reconciliation rather than silently adding a second copy. Old unposted legacy boxes retain their earlier movement behavior; they are not silently migrated into the new admission model.

Additional confirm errors include 400 `container_contents_incomplete` / `voucher_product_inactive` / `voucher_container_not_eligible`, and 409 `voucher_container_not_at_inbound`, `voucher_container_in_transport`, `container_stock_already_admitted`, `voucher_container_on_other_voucher`, `inbound_stock_not_posted`. Existing authentication/permission checks still apply. Confirm and competing voucher mutations are serialized; product accounting locks also protect initially absent stock rows against lost increments from different vouchers.

`GET /api/warehouse/containers/{id}`, barcode lookup, Container lists and stock voucher detail lines expose nullable `contentsQuantity` / `contentsUnit`. Container detail also exposes creation request/group mapping. Null on legacy data means unknown, not zero.

## Local deployment verification

Verified on local PostgreSQL `warotrans` at port 5433 on 2026-11-17:

- Both Warehouse migrations above are applied, confirmed from EF migration history.
- Kho ONE receiving location exists and is active on enabled `EP-INBOUND`, published `MAP-ONE-V006`.
- Before and after: **22 existing Containers, 3 existing vouchers, 0 stock rows**. No existing goods/vouchers were changed or backfilled.
- Full pre-migration backup: `/tmp/warotrans-before-inbound-20261117.dump` (local-only, permissions 0600).
- Only the two Warehouse migrations and the configured Inbound location were written to the shared dev DB. Mutation/end-to-end tests used isolated databases; no robot was dispatched.

The Development configuration is in this BE worktree. The mobile checkout remains separate; run/restart the BE from this worktree or deploy this branch before opening FE gates. Database migration alone does not replace an already-running older BE process.

## Verification

- Unit suite: 847 passed, 3 existing skips, 0 failed.
- Architecture suite: 11 passed, 0 failed.
- Isolated PostgreSQL suite: **19 passed, 0 failed**, including actual linked creation and posting of 9,999 boxes. `ContainerBatchPostgresTests` covers migration/legacy compatibility, real endpoint/auth/validation, atomic voucher-linked batches, concurrent creation and confirmation, posting rollback, maximum-batch boundary, putaway/recovery preserving total stock, code-sequence concurrency and published-map checks.

For integration verification, point `WAROTRANS_CONTAINER_TEST_POSTGRES` at a **disposable** PostgreSQL server whose user can create databases, then run only:

```sh
dotnet test backend/tests/WaroTrans.IntegrationTests/WaroTrans.IntegrationTests.csproj \
  --filter 'FullyQualifiedName~ContainerBatchPostgresTests'
```

Each test creates/drops only a randomly named database it owns. It does not use the application's integration fixture/reset/seed or start robot, MQTT or notification services. Without that explicit variable these tests are skipped.
