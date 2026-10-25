# WaroTrans Mobile — Agent Rules

## Phạm vi và cách bắt đầu

- Chỉ sửa `app/`. Đọc BE/Web/rules để đối chiếu; không sửa endpoint, DTO BE, quyền, migration, DB, robot, infrastructure hoặc source của role khác.
- Đọc [README](README.md), [rules/README](../rules/README.md), rồi rules 00–06, 09, 99 và rule liên quan trước khi code. Đọc source feature/API đang dùng, không quét mọi tài liệu cho mỗi task.
- Quyết định mới của người dùng ưu tiên theo rules/README. README ghi nghiệp vụ đích; route/DTO/handler đang chạy là bằng chứng triển khai. Nếu khác nhau, nêu gap và phối hợp BE, không tự đổi nghiệp vụ.
- Giữ thay đổi đang có của người dùng. Không chạy seed/reset/demo hoặc BE integration tests vào DB dùng chung.

## Nghiệp vụ và API

- V1 chở Container, mỗi Container gắn một Product; InventoryStock.ContainerCount đếm container, không phải số món bên trong.
- TransportRequestDetail là movement plan; JobContainer nối Request/Job/Container. Queue, Start Job, nhận human task và confirm handover là thao tác riêng.
- Staff chọn kho/điểm và nhận task từ queue chung. Không suy ASSIGNED của Job là Staff đã nhận việc; actor/owner/trạng thái do BE quyết định.
- Lấy workflow publish và render STAFF_INPUT từ schema; không thay workflow/UUID/đích để né validation, không cho Staff sửa ADMIN_INPUT/SYSTEM_VALUE.
- Phân biệt job/task/step/container UUID. `contracts.ts` còn DTO/projection legacy; đối chiếu wire contract, không sửa BE cho khớp type FE cũ.
- Không dùng seed fallback, fake success, giả ACK, tồn kho, claim, offline sync hoặc robot state để che lỗi API. Giữ đúng empty/error/loading và input khi thất bại.
- `src/shared/api/capabilities.ts` đang khóa API thiếu. Chỉ bật sau khi contract/quyền/response được kiểm chứng; không coi nó là giới hạn nghiệp vụ mong muốn.
- Cancel command không phải pause/resume/E-stop. Accepted 202, robot ACK và hoàn tất nghiệp vụ là ba mốc khác nhau.
- Các rule broadcast/claim/batch/retry/recovery trong README là yêu cầu đích; không thêm enum/API giả hoặc timer frontend để thay orchestration BE.

## Giữ UI và cấu trúc

- Sửa logic phải giữ layout, StyleSheet, icon, BrandMark, card, stepper, modal và tương tác hiện có. Chỉ sửa subsection cần thiết; không thay rich screen bằng form generic hoặc tự redesign.
- UI mới ưu tiên `src/shared/ui`; giữ legacy primitive còn consumer. Shell ở `src/app/shell`; shared component mới nhận data/callback, tránh phụ thuộc navigation của app.
- Đọc token từ `src/shared/theme`, không chép palette cũ: UI mới dùng Text variants (sàn 12pt), Title Case, hairline/shadow nhẹ, touch target tối thiểu 44pt (Button md48/lg52).
- Dùng `useTopInset()` và `dockReservedSpace(dockHeight)` khi có dock. Giữ SafeAreaProvider + root View; không hardcode inset theo iPhone hoặc bọc root SafeAreaView gây letterbox.
- Browser globals chỉ dùng trong nhánh web có guard. CSS web không đưa vào native StyleSheet; đặt pointerEvents trên JSX prop.
- Dùng haptics helper; tap/tick không rung. Lỗi trong modal phải thấy được, không trông chờ toast dưới RN Modal.
- Map dùng calibration/world coordinates và pose thật. Không hardcode marker, quỹ đạo Nav2 hoặc vị trí Staff; thiếu dữ liệu phải thể hiện thiếu.

## Kiểm chứng và tài liệu

- Sau sửa code: chạy `npm run typecheck` trong app và test liên quan (`npm test`); build web khi ảnh hưởng bundle. Không coi web pass là native/robot E2E pass.
- Sửa docs/comment: kiểm tra link, tham chiếu và diff; không cần tạo test cho văn bản. Chỉ ghi kết quả đã chạy và giới hạn còn lại.
- Git theo [rules/11](../rules/11-GIT-CICD-RULES.md): dùng `feature/*`, không push trực tiếp main/develop; chỉ stage phạm vi app và commit theo mẫu đang có trong repo.
- Chỉ duy trì hai file: AGENTS cho instruction ổn định; README cho context, cách chạy và gap BE. Cập nhật đúng mục bị ảnh hưởng.
- Không tạo thêm plan/progress/findings/audit/history/backup Markdown trừ khi người dùng yêu cầu. Không copy transcript/artifact vào repo, không nhân bản rules hoặc bảng token từ source.
