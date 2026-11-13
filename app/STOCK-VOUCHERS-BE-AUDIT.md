# Stock Vouchers — bàn giao bổ sung BE

Đối chiếu source ngày 11/11/2026. Cập nhật quyết định UI: Stock Vouchers tự dùng kho có map PUBLISHED mới nhất cùng resolver Home/Inventory; không còn chọn kho thủ công. Chưa có map publish thì hiện lỗi/Retry, không lấy kho đầu tiên làm fallback. Phạm vi: app mobile và nghiệp vụ chủ dự án đã chốt trong [README](README.md#nghiệp-vụ-staff-đã-chốt). Đây là yêu cầu tích hợp và các gap quan sát từ source, không phải bằng chứng API đã được nghiệm thu trên môi trường chạy. Không sửa BE/DB trong đợt app này.

## 1. Trạng thái app để BE tiếp nối

| Thao tác | Đang sử dụng | Dữ liệu thực sự được lưu |
|---|---|---|
| Danh sách phiếu, kho, bộ lọc, tìm mã/tham chiếu, tải thêm | REST hiện có | Dữ liệu server |
| Tạo phiếu nhập/xuất nháp | POST `/api/warehouse/stock-vouchers` | Chỉ `warehouseId`, `type`, `referenceNo`, `note`; lấy ID/mã phiếu từ server |
| Số thùng dự kiến | Form nhập trước khi tạo nháp và trên chi tiết | Chỉ thiết bị; chưa được cấp barcode |
| Nội dung từng thùng có mã thật | Chọn/quét Product, quantity, unit; review từng thùng | Chỉ thiết bị, gắn `containerId` thật từ chi tiết phiếu; không tạo Container giả để đi tiếp |
| Product | Catalog + resolve SKU/supplier barcode hiện có | Đọc server; kiểm tra active và trùng khớp; chưa có quick-create cho Staff |
| Chọn Container xuất | Đọc toàn bộ các trang Container + active map của kho; tìm/quét, chọn/bỏ chọn, review | Chỉ thiết bị; không gọi FIFO hoặc lưu lines vào phiếu server |
| Cấp barcode, lưu contents/selection, xác nhận ghi tồn | Chưa mở | Không gửi mutation thiếu contract; `confirmStockVoucher`/`createContainer` vẫn khóa |
| In/xuất tem | Chưa triển khai | Cần contract cấp mã và định dạng tem trước khi nghiệm thu |

Chuẩn bị trên thiết bị được tách theo account, warehouse và voucher (form mới còn tách theo loại phiếu). Native dùng SecureStore, web dùng localStorage; có báo đang lưu/lưu lỗi và Retry. Đây không phải server draft hoặc hàng đợi đồng bộ offline. Không dùng dữ liệu local để suy ra tồn, trạng thái phiếu hay hàng đã được cấp mã. Sau khi tạo server draft, app copy phần chuẩn bị sang ID phiếu thật; lỗi copy không làm app tạo lại phiếu.

**Giới hạn quan trọng của preview xuất:** `EndpointType` hiện chỉ có WAYPOINT/CHARGER/PARK. App nhận diện các WAYPOINT bật có mã khớp từ OUTBOUND theo quy ước hiện có của màn Transport. Chỉ hiển thị Container STORED có location/endpoint tương ứng và `inActiveTransport === false`. Không suy từ tên hiển thị, không coi thiếu flag là false. Đây là đối chiếu vị trí sơ bộ, không chứng minh quyền xuất, stock membership hoặc không thuộc phiếu khác. Khi refresh thấy barcode/Product/endpoint đổi hoặc kiện biến mất, app chặn review tới khi chọn lại. Thiếu map/điểm hoặc danh sách bị cắt là lỗi rõ ràng. BE phải cung cấp eligibility chính thức, app sẽ thay preview này bằng contract đó.

### Cập nhật luồng lô hàng 13/11/2026

- Form nhập chia thành chuẩn bị lô và kiểm tra phiếu: tổng N thùng, nhóm Product thật (chọn từ catalog `Choose Product`, bỏ scan ở bước tạo phiếu vì Container chưa có mã WaroTrans), số thùng mỗi nhóm, quantity/unit mỗi thùng cho từng nhóm (bỏ chỉnh riêng từng thùng). Tổng nhóm phải bằng N; mỗi thùng thuộc một Product. Đây là kế hoạch local, chưa có Container/stock được tạo.
- Nhóm dùng key local `group-*`. Giá trị này **không phải Container ID/barcode**, không được dùng thay UUID BE khi lưu lines. BE cần trả mapping allocation/Container ID/barcode ↔ nhóm ổn định, kể cả retry hoặc cấp một phần.
- Contract lưu lô chỉ cần nhận danh sách nhóm (`productId`, `containerCount`, `contentsQuantity`, `contentsUnit`) hoặc mapping tương ứng và bảo đảm N mã riêng tương ứng. Frontend không tự gán mã thật có sẵn vào nhóm theo thứ tự mảng response chưa được cam kết.
- Cấp mã vẫn khóa; Review hiển thị số mã cấp thực là 0. Nút Create Empty Draft hiện chỉ gọi API metadata đã có; app copy kế hoạch sang cache theo ID phiếu thật và thể hiện Batch Plan/On This Device trên nháp trống. Không coi điều này là lô đã lưu server.
- Form xuất đã đưa danh sách preview chọn/quét trước bước tạo nháp, thay vì tạo chứng từ rỗng rồi mới chọn. Vẫn cần canonical eligibility và lưu tập Container IDs thật trên BE.
- **Cập nhật phía BE (`a36ad1f` trên `feature/stock-voucher-backend`)**: `POST /api/warehouse/containers` đã bổ sung atomic batch receiving (`warehouseId`, `requestId`, `containerCount`, `groups` với `groupKey`, `productId`, `containerCount`, `quantityPerContainer`, `unit`, idempotency `replayed` và `StockVoucherLineResponse.contentsQuantity`/`contentsUnit`). Tuy nhiên FE vẫn giữ `createContainer: false` và `confirmStockVoucher: false` cho đến khi: (1) migration `20261113083127_AddContainerBatchContents` và cấu hình `WarehouseReceiving:InboundStorageLocations:<warehouseId>` được áp dụng trên môi trường chạy (nếu không sẽ trả `409 inbound_location_not_configured`), (2) chốt contract gộp/gắn danh sách Container từ batch vào `INBOUND` Stock Voucher (`POST /api/warehouse/stock-vouchers` hoặc `lines`), và (3) `ConfirmStockVoucher` thực sự ghi tăng/giảm tồn theo nghiệp vụ.

## 2. Bằng chứng và mức ưu tiên

| Mức | Gap hiện tại | Source cần phối hợp |
|---|---|---|
| P0 | Confirm chỉ kiểm tra eligibility hiện tại rồi đổi trạng thái chứng từ; chưa ghi tăng/giảm tồn tại thời điểm phiếu có hiệu lực | [ConfirmStockVoucher/Handler](../backend/src/Modules/Warehouse/Features/ConfirmStockVoucher/Handler.cs) |
| P0 | Stock đang đi theo pickup/delivery: pickup từ kệ giảm stock row, delivery tới kệ tăng; drop ngoài kệ có phiếu xuất CONFIRMED thì ISSUED. Chưa thể hiện tồn toàn kho gồm hàng trên robot và đang tập kết theo nghiệp vụ mới | [ContainerMovementRecorder](../backend/src/Modules/Warehouse/Services/ContainerMovementRecorder.cs) |
| P0 | Tạo TR từ kệ ra ngoài kệ còn đòi phiếu xuất CONFIRMED, tạo vòng phụ thuộc với yêu cầu gom hàng ra Outbound trước rồi mới lập phiếu xuất | [CreateTransportRequest/Handler — EnsureStockVouchersAsync, RequiredVoucherType](../backend/src/Modules/Transportation/Features/CreateTransportRequest/Handler.cs) |
| P0 | Chưa có cấp N barcode trước Product; CreateContainer hiện cần ProductId, nhận initial location tùy chọn, không bảo đảm mặc định Inbound theo kho | [CreateContainer/Request](../backend/src/Modules/Warehouse/Features/CreateContainer/Request.cs), [Handler](../backend/src/Modules/Warehouse/Features/CreateContainer/Handler.cs) |
| P0 | Chưa có contract lưu/đọc nội dung quantity/unit và kiểm tra đủ toàn bộ Container trước confirm | [StockVoucherResponses](../backend/src/Modules/Warehouse/Features/Shared/StockVoucherResponses.cs), [CreateContainer/Request](../backend/src/Modules/Warehouse/Features/CreateContainer/Request.cs) |
| P0 | Add lines cho xuất còn hỗ trợ ProductId+Count FIFO; eligibility dựa STORED và active transport, chưa kiểm tra tất cả kiện tại Outbound chính thức | [AddStockVoucherLines/Request](../backend/src/Modules/Warehouse/Features/AddStockVoucherLines/Request.cs), [Handler](../backend/src/Modules/Warehouse/Features/AddStockVoucherLines/Handler.cs), [StockVoucher](../backend/src/Modules/Warehouse/Entities/StockVoucher.cs) |
| P0 | Endpoint chưa có vai trò nghiệp vụ Inbound/Outbound; list Container suy warehouse qua location, còn bao gồm Container chưa có location. Chưa có canonical staged eligibility | [EndpointType](../backend/src/Modules/Navigation/Enums/EndpointType.cs), [ListContainers/Handler](../backend/src/Modules/Warehouse/Features/ListContainers/Handler.cs) |
| P1 | Quick-create Product hiện yêu cầu warehouse.write, không phù hợp cấp quyền cấu hình rộng cho Staff chỉ để tạo Product | [CreateProduct/Endpoint](../backend/src/Modules/Warehouse/Features/CreateProduct/Endpoint.cs) |

`doneCount` là tiến độ xử lý Container, không phải stock posted count. Không dùng `CONFIRMED` của handler cũ để tuyên bố đã ghi tồn theo nghiệp vụ mới.

## 3. Contract cần BE chốt

Các cấu trúc dưới đây là **đề xuất ngữ nghĩa**, chưa phải DTO/route production. BE quyết định model, tên route, error codes và cơ chế transaction; app không gọi các route giả định.

### A. Nháp và cấp mã nhập

- Giữ tạo phiếu độc lập với TR/Job/workflow. Lưu kho active, loại phiếu, metadata và `requestedContainerCount` trên server để đổi thiết bị vẫn khôi phục được.
- Cấp N mã thật trước Product: yêu cầu nhận `voucherId`, số lượng, khóa idempotency và version phiếu. Response trả ID/barcode từng Container hoặc allocation thực; không ép tạo Product giả vì schema Container hiện bắt buộc ProductId.
- BE chọn mô hình reservation/allocation phù hợp. Nếu mã chưa là Container hoàn chỉnh, DTO phải phân biệt rõ allocation ID với Container ID; app sẽ tích hợp thêm adapter, không giả định hai ID là một.
- Gán điểm Inbound đúng kho trên server. Một điểm thì tự chọn; nếu nhiều điểm hợp lệ, contract phải cung cấp lựa chọn/default rõ ràng, không tự lấy phần tử đầu. Không dùng mã endpoint do FE đoán để ghi vị trí.
- Lặp lại cùng operation trả lại cùng tập mã, không cấp thêm. Nếu cấp một phần/mất response, có receipt/query để đối soát và tiếp tục phần thiếu mà không tạo trùng.
- Phải lưu lại mã đã phát hành; hủy nháp/giảm số lượng không tái sử dụng mã đã in. Quy định rõ thay đổi số lượng sau cấp mã, giữ/loại allocation chưa dùng và quyền thao tác.
- Chốt chuẩn barcode (symbology, ký tự, check digit nếu có) và dữ liệu tem để FE làm màn xem/xuất tem. Demo dùng hộp dán sẵn phải khớp mã thật đã được cấp; không đoán sequence hay reset DB.

Ví dụ nội dung một operation cấp mã (cần BE thống nhất cách mang idempotency/version):

```json
{
  "voucherId": "<server-voucher-id>",
  "requestedContainerCount": 3,
  "expectedVersion": "<server-version>",
  "idempotencyKey": "<stable-operation-key>"
}
```

### B. Nội dung từng Container và Product

- Lưu `containerId`/allocation reference đúng loại, `productId`, `contentsQuantity`, `contentsUnit`, supplier package barcode bổ sung nếu dùng; mỗi Container đúng một Product type.
- Validate Product còn active tại thời điểm lưu và confirm. Quantity dương; chốt integer/decimal, precision, min/max, unit tự do hay master-data và giới hạn độ dài. App hiện nhận số dương có dấu phẩy/chấm thập phân và unit không rỗng để chuẩn bị, chưa được coi là policy BE đã đồng ý.
- `InventoryStock.ContainerCount` vẫn đếm số Container; không nhân với contentsQuantity và không cộng gộp số món khác unit thành tồn Container.
- GET detail trả toàn bộ fields đã lưu, completeness/validation theo từng kiện, requested/allocated count, vị trí thực và version. Cho lưu nháp chưa đủ; chỉ confirm khi tất cả kiện của phiếu đủ dữ liệu và hợp lệ.
- Chốt save từng kiện hay batch all-or-nothing. Nếu batch partial cần result từng dòng, lỗi từng field và receipt; app chỉ đánh dấu server-saved cho dòng được BE xác nhận.
- Product quick-create: quyền hẹp phù hợp Staff, validation SKU/supplier barcode trùng, response Product thật. Không mở warehouse.write rộng để vượt quyền.

Ví dụ dòng nội dung đề xuất (độc lập với số Container của phiếu):

```json
{
  "containerId": "<real-container-id>",
  "productId": "<active-product-id>",
  "contentsQuantity": 24,
  "contentsUnit": "pcs",
  "supplierPackageBarcode": null
}
```

### C. Chọn kiện xuất sau tập kết

- API canonical theo warehouse/voucher trả staged candidates hoặc trạng thái eligible kèm lý do không hợp lệ; phân trang/search barcode/Product/SKU. Cần current endpoint/location thật, warehouse, active transport, stock membership, liên kết phiếu khác và version.
- Lưu tập **Container IDs Staff chọn**, có thể từ nhiều TR. Không yêu cầu một phiếu tương ứng một TR; không gọi FIFO để thay danh sách Staff đã chọn. FIFO tiếp tục thuộc việc chọn hàng để tạo TR Outbound.
- Kiểm tra cả khi lưu và ngay lúc confirm: mọi kiện đã tới Outbound hợp lệ của cùng kho, có trong tồn, không đang di chuyển/đang bị giữ/đã xuất/đã commit ở phiếu khác. Không bắt chờ các Container khác không được Staff chọn của cùng TR.
- Việc hai nháp cùng chọn một kiện cần policy rõ (reservation hoặc phát hiện conflict). Dù chọn policy nào cũng không cho hai phiếu cùng ghi xuất một kiện; response chỉ ra các IDs bị conflict để FE giữ phần input còn lại.
- Khi container rời Outbound sau khi chọn, confirm phải fail có lý do, không tự chọn kiện khác, không xác nhận một phần âm thầm.

### D. Hiệu lực và ledger tồn — điều kiện mở Confirm

- Nhập: confirm hợp lệ ghi tăng đúng N Container tại Inbound **một lần**, rồi phiếu có hiệu lực. Putaway sau đó chỉ đổi vị trí/custody, không nhập thêm lần nữa.
- Xuất: TR gom hàng ra Outbound **không cần phiếu xuất đã xác nhận**. Khi di chuyển và tập kết, Container vẫn thuộc tồn toàn kho; confirm phiếu sau tập kết mới ghi giảm đúng một lần.
- Tách tổng tồn toàn kho khỏi số thùng ở kệ. Có dữ liệu custody/vị trí Inbound, trên robot, Outbound phù hợp; không làm tổng tồn biến mất trong khoảng pickup → delivery.
- Document state, ledger và Container state phải nhất quán; dùng transaction hoặc orchestration/outbox được đối soát theo kiến trúc module. Không trả thành công có hiệu lực khi ledger còn thất bại mà DTO không thể hiện tình trạng đó.
- Confirm cần idempotency, optimistic concurrency và uniqueness của stock posting/container issuance. Hai Staff confirm đồng thời hoặc retry sau mất response không được ghi tồn hai lần.
- Response/GET cần phân biệt document status với kết quả posting thực, thời điểm/actor, version và receipt/operation ID. Chốt cách query operation khi kết quả chưa rõ; FE không tự replay mutation mới.
- Quy định cancellation: nháp chưa hiệu lực có thể hủy theo quyền và version; không dùng hủy nháp để đảo tồn đã ghi. Nếu cần reversal sau hiệu lực phải có nghiệp vụ riêng, ngoài luồng này.

### E. Quyền, lỗi và phục hồi

- Server lấy actor từ auth; kiểm tra quyền đọc/ghi và phạm vi kho trên mọi operation theo role model của dự án. Chặn chỉnh nội dung, cấp mã hoặc confirm phiếu đã CONFIRMED/CANCELLED.
- Lỗi cần có status/code ổn định, IDs/field errors có thể sửa, version hiện tại khi conflict, correlation/receipt khi đã nhận operation. Phân biệt 400 validation, 401/403, 404, 409 conflict và timeout/5xx chưa biết kết quả.
- Detail/list phải phản ánh thay đổi từ thiết bị khác. Nếu có event, chốt event name/payload để invalidate; REST vẫn là nguồn đối soát sau reconnect.
- Chốt ngưỡng batch/page, active endpoint thay đổi/map republish, Product bị inactive giữa các bước và cách giữ dữ liệu đã nhập khi sửa lỗi.

## 4. Nghiệm thu phối hợp trên môi trường cô lập

1. Tạo nháp N=3 → allocate 3 mã → đóng/mở và đổi thiết bị: cùng mã, đúng kho/Inbound, stock chưa tăng. Retry allocation và mất response không tạo mã thứ tư.
2. Lưu Product/quantity/unit từng mã; một kiện thiếu/sai Product/qty/unit thì lưu nháp được theo policy, confirm bị chặn và chỉ rõ kiện lỗi. Chuyển Product inactive giữa save và confirm phải bị phát hiện.
3. Confirm nhập tăng đúng 3 Container tại Inbound; hai lần bấm, retry và hai Staff đồng thời vẫn tổng +3. Fault ledger/document phải rollback hoặc có trạng thái có thể đối soát, không báo hoàn tất giả.
4. Putaway và relocation/robot recovery không nhập/xuất lại. Tổng tồn được giữ ở mọi mốc trên robot và khi đổi vị trí.
5. Tạo TR Outbound không cần phiếu xuất sẵn; gom kiện thuộc nhiều TR tới Outbound. Chọn subset đã đủ thì lập phiếu được, không đòi kiện ngoài subset.
6. Có một kiện ngoài Outbound/sai kho/đang vận chuyển/đã xuất/thuộc phiếu conflict → save/confirm trả lý do phù hợp; không đổi sang kiện FIFO khác. Di chuyển kiện sau khi đã review phải làm confirm thất bại.
7. Confirm xuất trừ đúng tập đã chọn một lần; hai phiếu cạnh tranh cùng kiện không được double-issue hoặc tạo tồn âm.
8. 401/403 không lộ dữ liệu cũ; 409 giữ input cho Staff sửa; timeout sau commit có cách đọc receipt, không tạo phiếu/posting mới. Đóng app/reconnect khôi phục được server draft.
9. Chọn kho nhiều Inbound/Outbound, điểm bị disable/map republish, phân trang thiếu/trùng/chuyển trang khi dữ liệu đổi; eligibility cuối phải do server xác nhận.
10. iPhone 12/Expo thật: scan mã Product và Container, tem dán sẵn đúng mã cấp thực, bàn phím/Back, chữ lớn, empty/error/Retry và mất mạng trong lúc lưu. Web export/unit test không thay thế nghiệm thu này.

## 5. Thứ tự bàn giao và mở tính năng

1. BE chốt contract A/B, quyền Product và vai trò điểm nghiệp vụ; FE nối cấp mã/lưu nội dung/tem, khôi phục server draft.
2. BE triển khai ledger và sửa thứ tự TR/movement ở D; nghiệm thu nhập/putaway trước khi mở Confirm Inbound.
3. BE cung cấp C + cơ chế concurrency/reconcile; FE thay preview bằng canonical eligibility và lưu lựa chọn, nghiệm thu Confirm Outbound.
4. Chỉ bật capability sau khi endpoint, quyền, response và các trường hợp retry/race đã qua kiểm tra. Không bật chỉ vì endpoint cũ trả 200 hoặc để demo đi qua.

Mốc app hiện tại cho phép review UI và chuẩn bị dữ liệu, **chưa đạt luồng nhập/xuất có ghi tồn đầy đủ**. Kết quả kiểm tra app được ghi tại README; chưa chạy seed/reset hoặc BE integration tests trên DB dùng chung.
