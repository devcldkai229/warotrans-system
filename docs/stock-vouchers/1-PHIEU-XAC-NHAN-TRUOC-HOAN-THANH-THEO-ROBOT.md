# Phiếu nhập/xuất: xác nhận trước, hoàn thành theo robot

Tài liệu này giải thích luồng phiếu nhập (INBOUND) và phiếu xuất (OUTBOUND) sau khi đổi trên nhánh
`feature/voucher-confirm-complete`, ở mức hệ thống: trạng thái phiếu, trạng thái Container, tồn kho, và các ca có sự cố.

## 1. Tóm tắt thay đổi

| Trước | Sau |
|---|---|
| Phiếu chỉ có `DRAFT → CONFIRMED` (hoặc `CANCELLED`), `CONFIRMED` mãi mãi | Thêm `COMPLETED`: phiếu tự chuyển khi Container cuối cùng xong |
| Tạo phiếu luôn rỗng, thêm Container sau, confirm sau | Vẫn được làm vậy, **hoặc** tạo kèm Container và `confirm=true` → phiếu ra đời ở `CONFIRMED` |
| Phiếu xuất chỉ nhận Container `STAGED_OUTBOUND` đã nằm ở cổng | Phiếu xuất nhận Container `STORED` trên kệ (có tồn kho ghi nhận ở kệ đó) |
| Confirm phiếu xuất trừ tồn ngay | Confirm phiếu xuất chỉ "giữ chỗ" Container; **tồn trừ khi robot thả ở cổng Outbound** |
| Container ra cổng Outbound thành `STAGED_OUTBOUND` | Bỏ hẳn `STAGED_OUTBOUND`: thả ở cổng → `ISSUED` ngay |
| Chở hàng từ kệ ra cổng Outbound không cần phiếu | Bắt buộc Container nằm trên phiếu xuất `CONFIRMED` |
| Không có cách đóng phiếu dở dang | "Đóng phiếu thiếu" (`POST /stock-vouchers/{id}/close-short`, bắt buộc lý do) |

## 2. Vòng đời phiếu

```
                 ┌──── cancel ────► CANCELLED
DRAFT ──confirm──► CONFIRMED ──(dòng mở cuối cùng xong)──► COMPLETED
  ▲                    │
  │                    └── Đóng phiếu thiếu ──► COMPLETED (≥1 dòng xong)  |  CANCELLED (0 dòng xong)
Tạo phiếu: không confirm → DRAFT ; containerIds + confirm=true → CONFIRMED ngay (một transaction)
```

- "Dòng xong" (`StockVoucherProgress.IsDone`): INBOUND = Container `STORED` (hoặc đã `ISSUED` sau đó);
  OUTBOUND = Container `ISSUED`.
- Dòng bị đóng thiếu có `closed_short_at`, không còn tính, Container được tự do lên phiếu khác.
- Việc chuyển `COMPLETED` nằm trong `ContainerMovementRecorder.CompleteFinishedVouchersAsync`, chạy **cùng transaction**
  với lúc ghi nhận robot giao hàng hoặc người Recover, nên không bao giờ có lúc tồn kho đã đổi mà phiếu chưa đổi.

## 3. Trạng thái Container và tồn kho

### Inbound (gần như không đổi)

```
CREATED ─(phiếu nhập CONFIRMED: gắn inbound_stock_voucher_id, chưa cộng tồn)─► CREATED
        ─robot bốc─► IN_TRANSIT ─robot thả lên kệ─► STORED  (+1 tồn tại kệ đó)
```

### Outbound (đổi)

```
STORED (trên kệ, có tồn) ─(phiếu xuất CONFIRMED: chỉ giữ chỗ)─► STORED
       ─robot bốc ra cổng─► IN_TRANSIT  (tồn VẪN tính ở kệ gốc: inventory_storage_location_id được ghim lúc bốc)
       ─robot thả ở cổng Outbound─► ISSUED (−1 tồn ở kệ gốc, movement ISSUED)
```

Nếu Container được thả ở cổng Outbound mà **không** có phiếu xuất `CONFIRMED` (chỉ xảy ra với TR tạo trước khi có quy
tắc mới), nó thành `HOLD`, tồn giữ nguyên, chờ người Recover.

### Recover (người xác nhận Container thất lạc)

`IN_TRANSIT` / `HOLD` → `STORED` tại kệ người chọn, chuyển tồn sang kệ đó. Inbound: dòng phiếu thành "xong". Outbound:
dòng vẫn **mở** (hàng quay về kệ, chưa xuất).

## 4. Các ca có sự cố

### Inbound 3 Container, giao được 2 thì Cancel Job

| Container | Kết quả |
|---|---|
| A, B đã lên kệ | `STORED`, tồn đã +1 từng cái. Dòng xong |
| C đang trên robot | `IN_TRANSIT`. Dỡ tay → Recover vào kệ → `STORED` +1 → phiếu `COMPLETED` |
| C chưa bốc | Vẫn `CREATED`, vẫn thuộc phiếu → tạo TR mới chở tiếp, hoặc **Đóng phiếu thiếu** (phiếu `COMPLETED` 2/3, C bị gỡ khỏi phiếu nhập, muốn chở phải lập phiếu nhập mới) |

### Outbound 3 Container, ra cổng được 2 thì Cancel Job

| Container | Kết quả |
|---|---|
| A, B đã ra cổng | `ISSUED`, tồn đã −1 |
| C đang trên robot | `IN_TRANSIT`, tồn vẫn ở kệ gốc. Dỡ tay → Recover về kệ → `STORED`. Dòng vẫn mở |
| C chưa bốc | `STORED`, dòng mở → chở lại, hoặc **Đóng phiếu thiếu** (phiếu `COMPLETED` 2/3, C tự do) |

Đóng phiếu thiếu bị từ chối khi còn Container của phiếu đang chạy TR (`voucher_container_in_transport`) hoặc vẫn ghi
nhận trên robot (`voucher_container_in_transit` → Recover trước).

## 5. API

| Endpoint | Thay đổi |
|---|---|
| `POST /api/warehouse/stock-vouchers` | Thêm `containerIds?` và `confirm` |
| `POST /api/warehouse/stock-vouchers/{id}/lines` | Phiếu xuất nhận Container `STORED` trên kệ |
| `POST /api/warehouse/stock-vouchers/{id}/confirm` | Phiếu xuất không còn trừ tồn |
| `POST /api/warehouse/stock-vouchers/{id}/close-short` | **Mới**: `{ "reason": "..." }` |
| `GET /api/warehouse/stock-vouchers[/{id}]` | Thêm `completedAt`, `closedShortAt`, `closedShortReason`, `closedShortCount`, `lines[].closedShort` |
| `POST /api/transportation/transport-requests` | Kệ → điểm không phải kệ (cổng Outbound) cần phiếu xuất `CONFIRMED` (`outbound_voucher_required`) |
| `POST /api/transportation/transport-requests/outbound-pick-preview` | FIFO chỉ chọn Container nằm trên phiếu xuất `CONFIRMED` |

Mã lỗi mới: `voucher_container_not_on_shelf`, `voucher_not_confirmed`, `voucher_close_reason_required`,
`voucher_container_in_transit`. Bỏ: `voucher_container_not_at_outbound`.

## 6. Dữ liệu (migration `AddVoucherCompletionAndDirectIssue`)

- Cột mới: `stock_vouchers.completed_at / closed_short_at / closed_short_by / closed_short_reason`,
  `stock_voucher_lines.closed_short_at`.
- Container `STAGED_OUTBOUND` cũ (nếu còn) → `HOLD`, `current_endpoint_id = NULL`.
- Phiếu `CONFIRMED` mà mọi Container đã xong → `COMPLETED`.
- Ràng buộc: `ck_containers_endpoint_custody` = `current_endpoint_id IS NULL`;
  `ck_stock_vouchers_posted` cho phép `CONFIRMED` hoặc `COMPLETED`.

## 7. Web admin và app mobile

| | Web (`Quản lý → Phiếu kho`) | App mobile (`Transport Hub → Stock Vouchers`) |
|---|---|---|
| Tạo phiếu | Form chọn loại, kho, chọn Container ngay trong form; nút **Save as draft** / **Create and confirm** | Nhập: tạo lô Container theo sản phẩm; Xuất: chọn Container `STORED` trên kệ. Sau Review: **Save As Draft** / **Create And Confirm** |
| Phiếu nháp | Add Containers, Remove, Confirm voucher, Cancel voucher | Như cũ (cấp mã lô, lưu Container, Confirm, Cancel Draft) |
| Phiếu đã xác nhận | **Dispatch robots (n)** (n = Container đang ở điểm xuất phát), **Close short** (hỏi lý do) | **Dispatch Robots To Put Away / To Ship**, **Close Voucher Short** (ô lý do) |
| Trạng thái | Thêm **Completed**; tiến độ tính trên mọi dòng (đóng thiếu hiện 2/3); dòng đóng thiếu gạch ngang | Thêm **Completed**; dòng đóng thiếu có nhãn "Closed Short" |
| Bỏ | Chế độ "Theo sản phẩm (FIFO)" khi thêm Container (backend không hỗ trợ) | Hiển thị/đếm `STAGED_OUTBOUND` ở màn tra cứu tồn kho |

Màn tạo Transport Request (web và mobile) vẫn bắt Container đi ra cổng Outbound phải nằm trên phiếu xuất `CONFIRMED`,
nay khớp với backend. FIFO theo sản phẩm trên mobile chỉ chọn trong các Container đã được phiếu xuất giữ chỗ.

## 8. Kiểm thử

- Unit test: `StockVoucherDomainTests`, `StockVoucherHandlerTests`, `ContainerMovementRecorderTests` phủ: tạo và xác nhận
  một lần, phiếu tự `COMPLETED` (inbound qua giao hàng và qua Recover, outbound qua cổng), đóng phiếu thiếu
  (COMPLETED / CANCELLED, gỡ inbound, giải phóng Container), các ca bị từ chối.
- Integration test `MultiGateVoucherPostgresTests` được viết lại theo luồng mới (chưa chạy: cần Postgres test DB).
