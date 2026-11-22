# WaroTrans Mobile — Agent Rules

## Phạm vi và cách bắt đầu

- Antigravity phụ trách app. Codex phụ trách BE và phối hợp làm rõ nghiệp vụ. Dùng nhánh được thống nhất cho task đang làm. Kiểm tra `git status` trước khi sửa hoặc commit và chỉ stage phần việc của mình.
- Phiên làm app sửa trong `app/` và đọc BE/Web để đối chiếu. Gửi sai lệch về endpoint, quyền, migration hoặc robot cho bên phụ trách.
- Bắt đầu với [README](README.md) và [rules](../rules/README.md). Đọc các rule preflight trong [AI Rules](../rules/99-AI-RULES.md) trước khi sửa code. Dùng mục tài liệu theo công việc trong README để tìm feature và contract cần đọc.
- Mở phiên mobile với `app/` làm thư mục làm việc để agent tìm được `app/AGENTS.md` và các skill local nếu có. Skill độc lập đặt tại `.agents/skills/<tên>/SKILL.md` và dẫn tới tài liệu đọc theo nhu cầu. Áp dụng skill theo stack, theme và navigator hiện có của app.
- Ưu tiên quyết định hiện hành của người dùng theo thứ tự trong rules. Đối chiếu route, DTO và handler khi README khác triển khai. Giữ thay đổi của người dùng và dùng môi trường cô lập cho seed, reset, demo hoặc BE integration test.

## Nghiệp vụ và API

- V1 chở Container, mỗi Container gắn một Product. `InventoryStock.ContainerCount` đếm Container theo vị trí tồn.
- `TransportRequestDetail` là movement plan. `JobContainer` nối Request, Job và Container. Queue, Start, Claim và Confirm là các thao tác riêng có trạng thái do BE trả về.
- Dùng operating context và schema workflow đã publish. Chỉ cho Staff sửa các trường `STAFF_INPUT` theo schema. Dùng đúng UUID của workflow, Job, Task, Step, Container và đích đã chọn.
- Đối chiếu `contracts.ts` với wire contract của route đang dùng. Dùng state, `availableActions`, quyền và thời hạn từ server. Tách trạng thái loading, empty và error. Giữ input khi thao tác lỗi và đối soát khi kết quả chưa rõ.
- Kiểm chứng API, quyền và kết quả trước khi mở flag trong `src/shared/api/capabilities.ts`. Hiển thị đúng mốc lệnh được nhận, robot phản hồi và nghiệp vụ hoàn tất.

## Thiết kế UI và cấu trúc

- Với mọi thay đổi UI, kể cả một thành phần hoặc dòng chữ, dùng phần liên quan của skill thiết kế trước khi sửa. Dùng `mobile-taste` cho UI mới, `mobile-redesign-screen` khi chỉnh UI hiện có và tiêu chí `mobile-design-review` để tự rà. Khi plugin chưa được nạp, đọc trực tiếp `SKILL.md` tương ứng trong `app/.agents/plugins/mobile-taste-skill/skills/` nếu thư mục có sẵn.
- Với mẫu giao diện và tương tác iOS, dùng skill `apple-design` khi có hoặc đối chiếu hướng dẫn chính thức của Apple. [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
- Giữ chữ giúp người dùng nhận biết nội dung, thao tác hoặc hiểu trạng thái. Bỏ tiêu đề phụ nhắc lại tiêu đề, chú thích hiển nhiên và badge trang trí. Giữ nhãn form, hướng dẫn cần thiết, lỗi và tên trợ năng. Dùng card, viền và hiệu ứng khi cần nhóm thông tin, dẫn mắt hoặc phản hồi thao tác.
- Giữ layout, StyleSheet, icon, BrandMark và tương tác hiện có khi sửa logic. Giới hạn chỉnh UI ở phần người dùng yêu cầu và dùng i18n tiếng Việt/English hiện có.
- UI mới ưu tiên `src/shared/ui` và token từ `src/shared/theme`. Giữ legacy primitive còn nơi sử dụng. Shell ở `src/app/shell`. Component dùng chung nhận dữ liệu và callback qua props.
- Dùng Text variants (tối thiểu 12pt), Title Case, hairline và shadow nhẹ. Vùng chạm tối thiểu 44pt (Button md48/lg52).
- Dùng `useTopInset()` và `dockReservedSpace(dockHeight)` khi có dock. Giữ SafeAreaProvider + root View; không hardcode inset theo iPhone hoặc bọc root SafeAreaView gây letterbox.
- Browser globals chỉ dùng trong nhánh web có guard. CSS web không đưa vào native StyleSheet; đặt pointerEvents trên JSX prop.
- Dùng haptics helper; tap/tick không rung. Lỗi trong modal phải thấy được, không trông chờ toast dưới RN Modal.
- Map dùng calibration/world coordinates và pose thật. Không hardcode marker, quỹ đạo Nav2 hoặc vị trí Staff; thiếu dữ liệu phải thể hiện thiếu.
- Trước khi bàn giao, tự rà thứ bậc thị giác, khoảng cách, độ tương phản, vùng chạm, chữ dài tiếng Việt/Anh và các trạng thái liên quan. Dùng preview mobile khi có thể và sửa phần chữ thừa hay bố cục vướng ngay trong phạm vi đã giao.

## Kiểm chứng và tài liệu

- Sau khi sửa code, chạy `npm run typecheck` và test liên quan. Kiểm tra web export khi ảnh hưởng bundle. Ghi riêng kết quả web và kết quả nghiệm thu native hoặc robot thật.
- Khi sửa tài liệu, kiểm tra link, tham chiếu và diff. Chỉ ghi kết quả đã kiểm chứng.
- Theo [quy trình Git](../rules/11-GIT-CICD-RULES.md), dùng `feature/*` và PR để tích hợp. Tự commit sau mỗi task hoặc nhóm chỉnh sửa đã kiểm tra. Ghi cách người dùng có thể nghiệm thu thay đổi.
- Duy trì quy tắc ổn định trong `AGENTS.md` và cách chạy, hiện trạng, checklist trong `README.md`. Cập nhật tài liệu đang dùng khi feature đổi. Tạo thêm plan hoặc báo cáo khi người dùng yêu cầu.
