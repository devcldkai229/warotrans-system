# Prompt bàn giao WaroTrans Mobile cho Antigravity

Cập nhật ngày 13/11/2026 theo quyết định mới của chủ dự án. Bạn là Antigravity, tiếp nhận FE app và tiếp tục công việc trong tài liệu này. Đây là prompt có thể dán vào phiên mới hoặc yêu cầu agent đọc trực tiếp từ repository.

## 1. Vai trò và workspace

- Antigravity phụ trách FE mobile trong `app/`: UI/UX, navigation, state, typed API client, contract mapping, realtime, native lifecycle, FE tests và tài liệu tích hợp.
- Codex phụ trách BE và trả lời/chốt nghiệp vụ với chủ dự án. Khi thiếu BE contract, ghi yêu cầu cụ thể cho Codex; không tự sửa backend/DB/robot để làm UI đi qua.
- Phân vai AI không tự thay ownership của thành viên trong checklist, DoD hoặc % Complete của MasterPlan. Các module Fleet/Robot/Identity/Operations vẫn cần phối hợp đúng owner thực tế.
- Workspace FE: `/mnt/Data/Capstone Project - WaroTrans/warotrans-system`.
- Nhánh FE: `feature/mobile-stock-voucher-batches`, tách từ mốc app `1ed36b7`. Đọc `git log` để lấy commit bàn giao mới nhất; không hardcode HEAD phải bằng mốc cũ.
- Workspace BE riêng: `/mnt/Data/Capstone Project - WaroTrans/warotrans-system/.worktrees/stock-voucher-backend`, nhánh `feature/stock-voucher-backend`. Antigravity không sửa workspace BE. Codex dùng worktree này khi làm BE để không checkout/đổi nhánh trong workspace FE đang mở.
- Mốc `1ed36b7` trước đó bị commit/push vào `feature/mobile-vietnamese-mode`. Nhánh FE mới chứa mốc đó; commit vẫn tồn tại trên nhánh cũ. Không tự force-push, reset, revert hoặc xóa nhánh tiếng Việt để “dọn lịch sử”.

## 2. Đọc trước khi sửa

1. `app/AGENTS.md` — phạm vi, UI conventions, kiểm chứng và Git.
2. `app/README.md` — nghiệp vụ đã chốt và hiện trạng. Đọc cả bảng thời gian demo.
3. `app/IMPLEMENTATION-PLAN.md` — plan lớn M0–M6, 11 task và gate liên quan.
4. `app/STOCK-VOUCHERS-BE-AUDIT.md` — gap BE, contract đề xuất, acceptance tests; chú ý cập nhật lô hàng 13/11.
5. `rules/README.md`, rules 00–06, 09–11 và 99; đọc rule theo phần thực sự sửa.
6. Source feature/API đang dùng; chỉ coi route/DTO/handler hiện tại là bằng chứng đã triển khai.
7. Checklist gốc: `../academic-docs/references/WaroTrans_Team_Domain_Checklist_Nguyen_Thang_Dat_Technician_Reassigned_2026-11-08.md` tính từ root repo. Checklist cũ để truy task/owner/DoD, không ghi đè các quyết định mới của người dùng.

Nếu tài liệu cũ khác quyết định mới, ưu tiên người dùng rồi cập nhật đúng mục liên quan; không bắt người dùng trả lời lại nghiệp vụ đã chốt. Không coi việc có plan/UI/API 200 là đã đạt E2E hoặc PHYSICAL PASS.

## 3. Công việc đang làm: Stock Vouchers

### Nghiệp vụ đích đã chốt

- Stock Vouchers thay Receive Goods/Pack Container trong Transport Hub, độc lập với TransportRequest/workflow.
- Phiếu nhập diễn ra trước TR Putaway. Staff chuẩn bị cả lô: tổng N thùng → N barcode riêng → chia số thùng theo Product → quantity/unit trong từng thùng → chuyển sang kiểm tra/lập phiếu với toàn bộ lô đã chọn sẵn.
- Một Container có một Product type. Một lô có nhiều Product. Ví dụ 10 thùng = 6 A + 4 B; tổng số thùng các nhóm phải đúng N.
- Mỗi nhóm chỉ cần Product, số lượng thùng của nhóm và quantity/unit mỗi thùng (bỏ chỉnh riêng từng thùng và bỏ nút scan barcode ở bước tạo nhóm vì Container chưa có mã WaroTrans; Product chọn từ catalog `Choose Product`). Không nhân contents quantity vào `InventoryStock.ContainerCount`.
- Cấp mã, dán tem hoặc lưu nháp chưa tăng tồn. Chỉ xác nhận phiếu nhập có hiệu lực mới tăng tồn tại Inbound đúng một lần. Putaway/relocation/đang trên robot chỉ đổi vị trí/custody, giữ tổng tồn toàn kho.
- Địa điểm Inbound và identity phải do server lưu/kiểm tra. Barcode nhà cung cấp chỉ bổ sung, không thay mã WaroTrans của Container.
- Demo dùng hộp giấy dán sẵn mã được server cấp thật. Không đoán sequence, reset DB hay sinh mã giả để khớp tem.
- TR Outbound gom hàng ra Outbound trước khi lập phiếu xuất; không yêu cầu phiếu xuất CONFIRMED mới cho gom hàng.
- Chọn Product + số Container FIFO thuộc TR Outbound. Phiếu xuất chọn/quét Container cụ thể, có thể đến từ nhiều TR; không chạy FIFO chọn lại một tập khác.
- “Tập kết đủ” xét theo tập Staff chọn cho phiếu. Mọi kiện phải ở Outbound đúng kho và đủ điều kiện; đúng vị trí chưa đủ nếu đã ghi xuất/đang vận chuyển/xung đột với phiếu khác.
- Tập kết Outbound chưa giảm tồn. Confirm phiếu xuất mới giảm một lần, BE kiểm tra lại toàn bộ tập và chống double-post/race.

### UI vừa thiết kế và các sở thích phải giữ

- Tự dùng kho có map PUBLISHED mới nhất, cùng resolver Home/Inventory; tên kho chỉ ở header danh sách. Không bắt chọn kho, không hiện tên kho trong form tạo phiếu.
- Form Nhập có hai bước `Batch` → `Review`. Bước đầu có tổng thùng, nhóm Product (chọn từ catalog), số thùng/nhóm, quantity/unit mỗi thùng và thêm/xóa nhóm. Review tổng hợp các nhóm.
- Form Xuất đưa danh sách preview chọn/quét kiện tại Outbound lên trước khi tạo nháp.
- Reference/Note là tùy chọn trong `Additional Details`. Reference đối chiếu chứng từ ngoài (PO/phiếu giao/đơn bán), khác mã phiếu server sinh; Note là thông tin bổ sung.
- Người dùng thích UI gọn, ít chú thích. Đã bỏ nhãn Voucher Type, tên kho trong form, thẻ hướng dẫn dài và hai dòng `Saved On This Device`/`Draft Only · Stock Unchanged` ở form tạo. Giữ lỗi và thông tin thiết yếu ở nơi cần quyết định; không rải lại các banner giải thích.
- Ô tổng thùng có ↑/↓ xếp dọc trong ô, icon nhỏ, nền trung tính, từng vùng chạm 44pt; nhập tay được. Web wheel chỉ đổi số khi input đang focus để tránh cuộn trang làm đổi số ngoài ý định. Giới hạn hiện tại 1–9999.
- Giữ tiếng Việt/English qua hệ i18n hiện có; không hardcode một ngôn ngữ cho toàn app. Giữ theme, primitives, safe area và custom navigator; không redesign shell hoặc chuyển Expo Router.

### Phân biệt phần đã chạy với phần còn thiếu

Đã có REST thật cho kho, map, catalog/resolve Product, list/detail phiếu và tạo nháp metadata. Resolve Product có kiểm tra exact/active/unknown/ambiguity; đang dùng lại trong chọn Product và nhập mã quét.

**BE chưa có đủ contract cho cấp N barcode trước Product, lưu nội dung kiện/lô, canonical staged-outbound eligibility, lưu lựa chọn và confirm ghi tồn.** Confirm handler cũ chỉ đổi trạng thái chứng từ; không mở nó như thể đã post stock.

- Nhóm `group-*` là kế hoạch local, không phải Container UUID/barcode. `contents` theo ID thật trong detail khác với nhóm dự kiến.
- Preparation lưu trên thiết bị theo account/kho/phiếu, native SecureStore/web localStorage. Đây không phải server draft đã lưu contents và không phải hàng đợi offline sync.
- `Create Empty Draft` chỉ gửi metadata được API hiện có hỗ trợ; sau thành công copy kế hoạch sang cache theo ID phiếu thật. Detail nháp trống hiển thị Batch Plan/On This Device. Không gọi API thiếu, không báo đã tạo thùng/cấp mã/ghi tồn.
- Thẻ `Barcodes` / `Generate Barcodes` thừa đã được bỏ khỏi màn Review khi tạo phiếu theo lô (cập nhật 14/11/2026); màn Review chỉ tập trung vào tóm tắt lô/kiện đã chọn và Thông tin bổ sung, còn nút `Create Empty Draft` giữ nguyên gate cho tới khi BE hoàn thiện gắn phiếu & ghi tồn. Khi BE sẵn sàng, cần mapping ổn định nhóm/ordinal ↔ Container ID/barcode, receipt, idempotency, version và phục hồi partial success. Không tự ghép theo vị trí mảng khi contract chưa cam kết.
- Outbound hiện là preview vị trí: enabled WAYPOINT có code khớp từ OUTBOUND, Container STORED có endpoint/location khớp và `inActiveTransport === false`. Navigation chưa có role Inbound/Outbound canonical. Preview không chứng minh stock membership hoặc eligibility cuối; audit đã ghi gap này.
- Capabilities tại thời điểm bàn giao: `createStockVoucherDraft`, `resolveProduct`, `reportIssue`, `resumeJob` true; `createContainer`, `confirmStockVoucher`, `claimHumanTask`, `pauseJob`, `payloadRecovery` false. Đọc source lại trước khi thay; chỉ bật sau khi kiểm chứng contract/quyền/response thật.

### File chính và kiểm chứng

Đọc `CreateStockVoucherScreen.tsx`, `ContainerCountField.tsx`, `InboundBatchEditor.tsx`, `InboundBatchSummary.tsx`, `inboundBatch.ts`, `voucherPreparation.ts`, `useVoucherPreparation.ts`, `preparationStorage.ts`, `preparationDeviceStore.ts`, `StockVouchersScreen.tsx`, `StockVoucherDetailScreen.tsx`, `VoucherDraftWorkspace.tsx`, `OutboundVoucherSelection.tsx`, `outboundPreparation.ts`, `ReceivingProductPicker.tsx`, `productLookup.ts`, `stockVoucherData.ts`, `useVoucherWarehouse.ts` trong `app/src/features/inventory/`; API/capabilities trong `app/src/shared/api/`.

Mốc vừa kiểm tra: cập nhật form Inbound Batch giản lược (chọn Product từ danh mục, bỏ scan barcode và bỏ chỉnh riêng từng thùng). Chưa nghiệm thu camera/iPhone/VoiceOver hoặc robot thật.

## 4. Plan lớn còn dang dở

Thứ tự này giữ plan M0–M6. Không coi tất cả các checkbox cũ đang [ ] là code hoàn toàn chưa có; đối chiếu README/source trước khi làm lại.

| Mốc | Task | Phần việc FE tiếp nối |
|---|---|---|
| M0 | Contract/môi trường cho mọi task | Đối chiếu route/DTO/quyền/error/event/version và API gate với Codex; chuẩn bị nghiệm thu iPhone/robot, chưa mở capability thiếu. |
| M1 đang làm | APP-CAP-02, APP-CAP-03 | Hoàn thiện UX lô/phiếu/Product; tích hợp allocation, save/restore server draft, tem và confirm posting khi Codex có contract; kiểm chứng tồn nhập → vận chuyển → xuất. Quick-create Product cần quyền hẹp, không cấp warehouse.write rộng cho Staff. |
| M2 | APP-CAP-01, APP-OPS-01, APP-OPS-04 | Queue/claim theo lượt dừng, zone priority, Begin/release/deadline, scan manifest/Confirm All và hai kênh; tiếp tục inbox/deep links theo entity và trạng thái thật. Inbox per-user/read/read-all/SignalR đã nối một phần, không làm lại từ local-derived notifications. |
| M3 | APP-CAP-07, APP-CAP-04, APP-CAP-05 | Pause/Resume đúng actor; Issue gửi hoặc gửi+Pause, partial success, own-business-issue resolution; hazard vị trí thật/cảnh báo kho, theo allowedActions và stop-state. |
| M4 | APP-CAP-06 | Recovery case, robot đích đủ chỗ, chọn/quét manifest và xác nhận chuyển custody; tiếp tục cùng Job, giữ phần đã hoàn thành. |
| M5 bắt buộc V1 | APP-FLEET-01 | Joystick Technician mobile, lease/readiness/hold-to-drive, lifecycle/deadman, không replay vận tốc cũ. Không bỏ task vì checklist cũ P2. |
| M6 | APP-FLEET-02 và regression | Map gestures/performance trên iPhone 12, pose/version/frame thật, background/stale/fallback; rehearsal toàn luồng và evidence 2 robot thật riêng biệt. |

### Các quyết định xuyên task phải giữ

- Staff claim **một lượt bàn giao tại một điểm dừng của Job**, không phải toàn Job hoặc từng kiện riêng. Pickup/dropoff có thể do Staff khác nhau.
- Sau **10s từ BE ghi nhận MOVE bắt đầu**, phát yêu cầu nhận việc thật và mở queue; không chỉ báo trước. Có thể claim khi robot đang MOVE, nhưng Begin/confirm phải đợi robot tới và ready.
- Ưu tiên work-zone rồi mở cho mọi Staff thuộc kho, không khóa quyền theo zone khi đã mở rộng. Auth/ownership/quyền theo kho do BE quyết định; nhãn zone FE không cấp quyền.
- Hạn tới bắt đầu tính từ `max(claimedAt, robotReadyAt)`. Chưa Begin thì expiry/release/no-show được BE thu hồi; đã Begin thì giữ lượt, nhắc/gia hạn, không tự đổi chủ khi đang xếp/dỡ hoặc mất mạng.
- App chỉ owner hợp lệ quét đủ manifest rồi Confirm All; nút robot bấm một lần chốt cả lượt sau khi Staff làm đủ. Cả hai kênh được hỗ trợ đồng thời; lưu đúng nguồn/actor, không gán account Staff cho người bấm robot. Race/retry không double-confirm hoặc chốt nhầm lượt kế tiếp.
- Mọi Staff trong kho có thể Pause Job với lý do. Resume chỉ người đã Pause hoặc Admin sau readiness check; tách người Pause khỏi người claim. Accepted/Job PAUSED/robot đã dừng là các mốc khác nhau.
- Issue có Gửi báo cáo hoặc Gửi và tạm dừng; tạo ticket thành công, Pause lỗi thì giữ ticket ID và chỉ xử lý phần còn thiếu. Sai/mất Container vẫn chặn cả app/nút robot dù chỉ gửi báo cáo.
- Staff chỉ resolve lỗi nghiệp vụ do mình báo nếu BE kiểm tra hợp lệ. Technical/robot/traffic do Technician/Admin. Resolve không tự confirm handover/Resume/sửa tồn.
- Hazard gửi Admin/Technician phụ trách và mọi Staff cùng kho; có vị trí/evidence thật. Report không tự sửa keepout/map hoặc cho Staff mở/chặn đường.
- Recovery V1 chuyển **toàn bộ** hàng sang một robot đủ chỗ; chưa có thì chờ. Bắt buộc chọn đích và quét đủ trên app trước khi chốt trên app/nút robot cứu hộ; không chia nhiều chuyến sang robot thiếu chỗ. Tiếp tục cùng Job, không lập business TR/phiếu mới, không gỡ lỗi/quarantine robot nguồn chỉ vì đã dỡ hàng.
- Inbox V1 realtime khi app mở + lưu server bền vững. Native push nền/khóa màn hình làm sau; đọc tin không claim, mở tin cũ phải lấy trạng thái mới, không lộ cache account khác.
- Joystick chỉ Technician có quyền/scope, lease thật; nhả tay/cancel/background/khóa máy/mất link/lease/logout/rời screen phải ngắt, reconnect không tự chạy. Robot watchdog/authority bắt buộc; HTTP 202 không chứng minh motor dừng. Không retry/offline-queue/replay setpoint sau refresh token. Baseline lease 30s/renew khoảng 10s không phải mốc deadman hoặc timeout demo.
- Map giữ map/version/frame/calibration thật; không gán pose robot của map cũ lên map mới. Web/Gazebo pass không thay gesture, safety hoặc PHYSICAL PASS iPhone/robot thật.

### Profile demo đang đề xuất, chưa phải orchestration đã triển khai

MOVE → queue 10s; ưu tiên zone 5s; tới Begin 30s kể từ max(claim,ready), nhắc khi còn 10s; robot ready chưa ai Begin thì báo phụ trách sau 60s; đã Begin quá 60s thì nhắc, gia hạn 30s; mất link trước Begin thì release sau 15s. Đã Begin không auto-release. Xem bảng đầy đủ trong README; không dùng timer FE để thực thi thay BE, giả robot ready hoặc hoàn tất nghiệp vụ.

## 5. Cách phối hợp với Codex BE

Với mỗi gap, gửi lại chủ dự án một yêu cầu có thể chuyển nguyên sang Codex:

1. Task/màn và hành động Staff đang cần.
2. Rule đã chốt, ví dụ cụ thể và invariant tồn/custody/ownership.
3. Endpoint/DTO đang có và file source bằng chứng; phần nào mới là đề xuất.
4. Dữ liệu FE cần: field/type/nullability, ID đúng loại, actor/scope, status/allowedActions, version, receipt/idempotency, error/field errors và event invalidate.
5. Luồng success, validation/403/409, lost response, race và phục hồi; acceptance tests chung.
6. FE đã làm tới đâu và action nào còn khóa.

Contract do Codex/owner BE xác nhận trước khi nối. Không tự bịa URL/status/UUID rồi yêu cầu BE làm theo để hợp type cũ. Sau khi nhận contract thật, sửa typed API client, kiểm chứng auth/response/retry rồi mới mở gate.

## 6. SDK, Git và quy trình làm việc

- Workspace FE hiện còn 3 file thay đổi chưa commit thuộc công việc SDK: `app/app.json`, `app/package.json`, `app/package-lock.json`. Chúng đã có từ trước commit voucher và được chủ ý để riêng; không bỏ/revert hoặc tự gộp vào commit voucher.
- Git ở mốc app `1ed36b7` vẫn khai báo Expo SDK 57; working tree/package và dependencies cài tại máy đang là Expo SDK 58, React 19.3, RN 0.88.1. Kết quả kiểm tra vừa nêu chạy trong trạng thái workspace này. Xác minh lại trước clean install/build; không chạy `npm ci`/reset để vô tình ghi đè setup đang dùng, không tuyên bố clean checkout SDK 57 đã được test với kết quả SDK 58.
- Plan gốc có baseline SDK 57/no-upgrade-in-slice; đó là thông tin thời điểm lập plan. Không coi 3 file dirty là lý do tự nâng tiếp hoặc tự rollback SDK. Antigravity phụ trách FE có thể rà soát upgrade như một nhóm riêng, giữ đúng ý định của chủ dự án.
- Từ quyết định 13/11: **sau mỗi nhóm chỉnh sửa, kiểm tra rồi tự commit**, không hỏi lại để chờ duyệt. Push feature branch theo quy trình hiện có. Người dùng có thể tiếp tục yêu cầu sửa bằng commit sau; vẫn đưa bước nghiệm thu rõ ràng.
- Trước Git mutation: `git status`, branch và staged diff; chỉ stage file/hunk của task. Không `git add .`, không gộp thay đổi của người khác, không force-push hoặc push thẳng main/develop. Giữ công việc đang có.
- Chỉ một agent chịu trách nhiệm Git trong mỗi worktree. Không checkout BE branch trong workspace FE hoặc ngược lại. Giao tiếp bằng commit hash, contract/audit và yêu cầu người dùng chuyển giữa hai công cụ; không cùng sửa một file.
- Sau code: `npm run typecheck`, `npm test` trong `app/`; export web khi ảnh hưởng bundle, iOS khi cần. Dùng tests có giá trị cho validation/contract/race/persistence, không viết tests chỉ mirror giao diện.
- Không chạy seed/reset hoặc BE integration tests vào DB dùng chung. Không fake ACK, stock, claim, allocation, offline sync, fixtures hoặc robot state trong production path.
- Giữ ThemeTokens/shared UI, font sàn 12pt, touch 44pt, useTopInset/safe area/dock, loading/empty/error/stale đúng; lỗi trong modal phải thấy được trong modal. Ngôn ngữ UI ngắn gọn, tránh banner nội bộ thừa.
- Ở lần tiếp nhận đầu tiên: kiểm tra branch/dirty files, đọc nguồn trên, tóm tắt ngắn đang ở M1 và các gap BE; sau đó kiểm tra/tiếp tục FE độc lập. Không chỉ viết lại plan, không yêu cầu chủ dự án kể lại context, không nhảy sang milestone khác hoặc mở capability giả để “hoàn tất”.

## 7. Điểm bắt đầu ngay

1. Mở đúng workspace FE/feature branch và bảo toàn 3 file SDK dirty.
2. Xem form tạo phiếu hiện tại. Chạy lại kịch bản lô 10 thùng = 6 Product A + 4 Product B, quantity/unit mỗi thùng, tổng sai, Product unknown/inactive, chuyển loại, Back/reload và account/kho thay đổi. Dùng Product thật, không tạo dữ liệu DB chỉ để có ảnh đẹp.
3. Rà UX và lỗi trên iPhone 12/Expo, keyboard, scan, scroll, accessibility, cache và kết quả chưa xác định; giữ layout đã chốt và sửa điểm chưa đạt theo phản hồi người dùng.
4. Giữ cấp mã/confirm chưa mở khi BE chưa sẵn sàng; chuyển yêu cầu M1 cho Codex theo audit. In/xuất tem, mapping barcode theo nhóm, server draft/contents và stock posting là các đầu việc tích hợp tiếp khi có contract.
5. Khi M1 đạt gate với BE và thiết bị, tiếp tục M2 → M6 theo plan, không tự đánh dấu hoàn tất chỉ từ UI hoặc unit test.
