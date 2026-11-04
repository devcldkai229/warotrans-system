# Kế hoạch triển khai Map UI nhiều lớp — WaroTrans Mobile

Trạng thái từng hạng mục được ghi ở mục triển khai bên dưới; nghiệm thu native và nội suy trực tiếp vẫn còn mở.

## 1. Mục tiêu và phạm vi

Nâng cấp Home Map và Job Live Map thành bản đồ vận hành dễ đọc, có pan/zoom, chọn đối tượng, bộ lọc lớp và theo dõi robot khi dữ liệu cho phép. Ưu tiên tính đúng của vị trí và trạng thái, sau đó là độ mượt và hình thức.

## Trạng thái triển khai — 27/10/2026

- **M0 web:** hoàn tất kiểm tra Expo SDK 57 với `react-native-gesture-handler`, `react-native-reanimated` và `react-native-worklets`; bundle web và typecheck đã qua. Native vẫn là opt-in qua `EXPO_PUBLIC_INTERACTIVE_MAP=true` vì chưa có bằng chứng trên thiết bị thật/release build.
- **M1–M3 (Mốc A):** `MapViewport` dùng chung cho Home và Job Live; map luôn đến từ map identity của từng screen. Đã có projection/inverse, portrait rotation, pan/pinch/double-tap/fit/zoom, grid mét, scale bar, Layers, danh sách endpoint đầy đủ, REST snapshot freshness và Follow cho sample hợp lệ.
- **Cập nhật realtime cơ bản:** đã nối SignalR hiện có vào Home/Job Live. Event telemetry/connectivity yêu cầu tải lại snapshot ngay, gom lượt mỗi 250ms, không chạy GET chồng nhau và giữ lượt cuối. Polling 5 giây vẫn hoạt động; reconnect/foreground revalidate; background/unmount gỡ listener/timer. Pose và map identity cùng response, không cần thay BE để bật cập nhật này.
- **M4–M5 (nội suy trực tiếp event):** còn mở. Event có `lastTelemetryAt` nhưng chưa có map/frame/session/sequence để nối trực tiếp vào renderer và nội suy theo contract đầy đủ.

Chia thành hai mốc bàn giao độc lập:

- **Mốc A — Map tương tác:** triển khai bằng API hiện có; dùng REST pose snapshot đúng map. Không phụ thuộc việc BE bổ sung realtime.
- **Mốc B — Robot realtime:** cập nhật cơ bản dùng SignalR để refresh snapshot đã bật theo yêu cầu người dùng. Nội suy trực tiếp event chỉ bật sau khi BE/robot xác minh map identity, timestamp và thứ tự gói tin.

Phạm vi triển khai mobile là `app/`. Những thay đổi BE trong mục 7 là yêu cầu phối hợp, không phải endpoint/field đã tồn tại và không do mobile tự thêm vào wire contract. Việc triển khai UI không bao gồm đổi map robot, sửa Job, import DB hoặc gửi lệnh di chuyển.

## 2. Nền tảng cần giữ

| Nguồn hiện có | Cách sử dụng |
|---|---|
| `src/shared/utils/mapCoordinates.ts` | Giữ calibration và phép world → map; mở rộng hàm nghịch đảo qua các lớp transform. |
| `src/shared/maps/mapModel.ts` | Giữ kiểm hash/frame/calibration, occupancy model, heading và lọc robot đúng map. |
| `src/shared/maps/rosMapModels.json` | Nguồn model đã bundle, gồm V018/map3 với 5 kệ; không biến thành fallback dữ liệu BE. |
| `src/shared/maps/mapPresentation.ts` | Tập trung nhãn/màu phân vùng, dùng token của app. |
| `HomeMapPanel.tsx` | Tiếp tục lấy operating-context và map detail cho Home. |
| `JobLiveMapScreen.tsx` | Tiếp tục giữ mapVersionId của Job và query robot; không lấy map Home thay thế. |
| `src/shared/theme`, `src/shared/ui` | Dùng token, Text, Button, BottomSheet và safe-area hiện tại. |

Home hiện dùng map vận hành PUBLISHED mới nhất theo quy ước đã chốt. Job Live dùng map của Job, kể cả khi map đó đã ARCHIVED. Renderer chung không được tự đổi ngữ cảnh của hai màn.

V018 đã được nhập vào DB local. Robot và Job cũ vẫn có thể thuộc V001: không vẽ chúng lên V018 và không đổi map assignment để phục vụ việc trình diễn UI.

## 3. Quyết định kỹ thuật

### 3.1 Renderer và tương tác

- Tiếp tục dùng `react-native-svg`; chưa cần Skia, WebGL hoặc engine 3D.
- Hướng triển khai native cho gesture liên tục: **React Native Gesture Handler + Reanimated**, với gesture/camera values chạy trên UI runtime.
- Các thư viện này chưa có trong package.json hiện tại. M0 phải kiểm chứng SDK 57/RN 0.86, cấu hình thực tế và cả bundle web trước khi chấp nhận dependency change. Dùng Expo installer để chọn phiên bản phù hợp SDK; không lấy số phiên bản `latest` áp vào project.
- M0 là điểm chốt thay đổi dependency theo quy tắc repository. Chưa qua điểm này thì không cài thư viện hoặc chuyển toàn bộ renderer.
- Không dùng PanResponder + React setState/rAF làm kiến trúc production cho pinch/pan liên tục. Nếu stack đề xuất chưa tương thích, ghi rõ blocker và giới hạn ở renderer tĩnh/nút Fit/Zoom; không tuyên bố đã đạt nghiệm thu gesture native.
- Giữ navigator, shell và bottom sheet hiện có; không chuyển sang Expo Router hoặc thay framework navigation.

### 3.2 Ranh giới dữ liệu

Screen quản lý query/auth/navigation. Renderer nhận data và callback, không fetch API, không mở SignalR riêng và không gửi command.

```text
HomeMapPanel ── operating-context + map detail + REST fleet ─┐
                                                          ├─ MapViewport
JobLiveMapScreen ── Job.mapVersionId + map detail + fleet ───┘      ├─ BaseMapLayer
                                                                 ├─ InfrastructureLayer
SignalR → bounded REST refresh ── verified map + pose snapshots ────┤─ RobotLayer
                                                                 └─ MapHud (screen space)
```

Chỉ có một nguồn pose được chấp nhận cho mỗi robot tại một thời điểm. Bản đang triển khai dùng event để tải lại snapshot, giữ nguyên pose/map identity từ response mới nhất. Không lấy pose event ghép với mapId từ một REST snapshot cũ.

## 4. Cấu trúc mã nguồn dự kiến

Mở rộng `src/shared/maps/`, không tạo thêm hệ projection/theme trong `features/map/`.

```text
src/shared/maps/
  MapViewport.tsx                 # Cảnh chung, clipping, kích thước vùng nhìn
  layers/BaseMapLayer.tsx         # Occupied / free / unknown, scan và metric grid
  layers/InfrastructureLayer.tsx  # Edge, Zone, Endpoint
  layers/RobotLayer.tsx           # Glyph, heading, selection, freshness
  MapHud.tsx                      # Fit, +/- zoom, Follow, Layers, scale bar
  hooks/useMapCamera.ts           # Pan/pinch, zoom focal point, follow, interruption
  mapTransform.ts                # Ma trận thuận/nghịch, bounds, zoom anchoring
  mapTelemetry.ts                # Kiểm sample, freshness, transition giữa nguồn
  poseInterpolation.ts           # Nội suy thuần, timestamp/yaw/discontinuity
  mapPresentation.ts             # Mở rộng file hiện có
  mapModel.ts                    # Tái sử dụng file hiện có
  rosMapModels.json               # Giữ pipeline build hiện có
```

Chỉ tách glyph hoặc sheet thành file riêng khi có consumer hoặc độ phức tạp thực tế. Không tạo trước một cây component lớn chỉ để đủ bốn lớp.

## 5. Quy tắc tọa độ và viewport

### 5.1 Một chuỗi transform duy nhất

```text
World meters trong MapVersion.frameId
  → map local (originX/Y, originYaw, resolution)
  → image plane (đảo trục Y)
  → portrait rotation nếu có
  → fit vào vùng nhìn khả dụng
  → user pan/zoom
  → screen
```

- Geometry, pose và vị trí nhấn phải dùng cùng transform; hit-test dùng nghịch đảo của chính transform đó.
- Không persist pixel coordinate hoặc sửa world geometry khi zoom/xoay màn hình.
- Lấy vùng nhìn sau khi trừ header, dock, safe area và sheet; Fit/Follow căn theo vùng này.
- Pan/zoom reset khi đổi map identity/calibration. Poll cùng map không reset camera hoặc lựa chọn của người dùng.
- Polygon/line được clip vào viewport, không bỏ cả polygon chỉ vì một đỉnh nằm ngoài viewport.
- Robot ngoài biên map có thông báo Out Of Bounds; không clamp marker vào trong kho và làm sai vị trí.

### 5.2 Tương tác đã chốt

- Fit = mức zoom 1 tương đối với phép fit; khoảng zoom ban đầu 1–8. Zoom dưới mức fit chưa cần cho bản đầu.
- Pinch giữ nguyên world point dưới tâm hai ngón tay; pan vẫn liên tục khi chuyển giữa một và hai ngón.
- Double-tap tăng zoom quanh điểm nhấn; nút +/- zoom quanh tâm vùng nhìn. Các nút là đường thao tác thay thế khi không pinch được.
- Sau gesture, giới hạn pan để còn thấy một phần map; khi map nhỏ hơn viewport thì căn giữa theo trục tương ứng.
- Ngón tay kéo → map đi theo trực tiếp. Fit/double-tap chuyển camera trong 150–200ms, có thể ngắt; reduced motion đặt camera trực tiếp.
- Gesture map không chiếm thao tác trên HUD, endpoint/robot, sheet handle hoặc nội dung sheet đang cuộn. Kéo map không phát sinh tap chọn endpoint.
- Marker, text và hit target không co nhỏ theo nền; touch target tối thiểu 44pt. Android kiểm tra thêm mục tiêu 48dp.

### 5.3 Grid và scale bar

- Lưới bám world meters, hỗ trợ tọa độ âm và originYaw; không dùng lưới pixel trang trí làm thước đo.
- Chọn bước 1/2/5 × 10^n theo zoom để khoảng cách đường lưới trên màn hình xấp xỉ 40–100pt. Major grid theo bội số phù hợp, không ép cố định 5m.
- V018 chỉ khoảng 5,35 × 3,4m; kiểm tra riêng scale bar ở kích thước này và trên map lớn hơn.
- Nhãn trục ghi đơn vị m; trục bản đồ không được mô tả như hướng tiến hiện tại của robot.

## 6. Quy tắc hiển thị bốn lớp

| Lớp | Nội dung | Quy tắc |
|---|---|---|
| Base | Scan hoặc occupancy model, metric grid | Phân biệt occupied/free/unknown. Giữ Scan để kiểm tra bản gốc. Không xóa vật cản nhỏ để làm đẹp; model chỉ dùng khi hash/frame/calibration khớp. |
| Infrastructure | Endpoint, Edge, Zone | Geometry và direction từ API. Edge là polyline độc lập, không tự nối Endpoint. Vẽ chiều ONE_WAY theo thứ tự tọa độ; BIDIRECTIONAL có ký hiệu riêng. |
| Robot | Glyph định hướng, selection, trạng thái và dữ liệu cuối | Chỉ vẽ robot đúng map. Trạng thái lấy từ contract hiện có, tách connectivity/navigation/localization. Chưa có footprint thật thì glyph là icon không theo tỷ lệ vật lý. |
| HUD | Fit, Zoom, Follow, Layers, scale, chi tiết | Ở screen space; không zoom theo nền. Có accessible name, focus khi dùng web và số liệu thời điểm cập nhật. |

Quy tắc bổ sung:

- `KEEP_OUT`, `NO_STOP`, `SPEED`, `SINGLE_OCCUPANCY`, `JUNCTION` có nhãn riêng; không gộp Junction với Single Occupancy hoặc Keep Out với No Stop.
- CHARGER là EndpointType; không tự thêm Charging Zone vào ZoneType.
- Dùng RobotStatus/NavigationStatus/LocalizationStatus hiện có. Không thêm ACTIVE/BLOCKED hoặc suy E-stop/vật cản từ PAUSED/ERROR.
- Không vẽ LiDAR cone, vùng bảo vệ hoặc trạng thái đèn vật lý khi chưa có model/contract xác minh. Glyph chỉ đánh dấu đầu xe bằng ký hiệu định hướng rõ ràng.
- Không vẽ đường current pose → target như đường Nav2. Đích của Job có thể đánh dấu riêng nếu thuộc đúng map.
- Không dùng glow/nhấp nháy liên tục trong bản đầu. Trạng thái có icon/text ngoài màu sắc; mất định vị/offline dùng nhãn và viền phân biệt.
- Giữ hệ màu Calm Operations hiện tại, bổ sung semantic map tokens khi cần. Dark theme là hạng mục riêng sau khi kiểm tra readability, không phải điều kiện để bản đồ trông công nghiệp.
- Nhãn LOD theo độ thoáng màn hình, có hysteresis để không chớp khi zoom gần ngưỡng. Đối tượng được chọn ưu tiên nhãn; danh sách Layers luôn cho đọc đầy đủ.
- Mặc định giữ lớp an toàn nhìn thấy; nếu người dùng ẩn Zones phải có chỉ báo trên HUD. Mất lựa chọn khi đổi map không tự chọn một robot khác để Follow.
- Tap thường không rung, theo haptics helper của app.

## 7. Dữ liệu robot: làm được ngay và điều kiện mở realtime

### 7.1 Đã triển khai: SignalR refresh + REST snapshot

- SignalR `robotTelemetryUpdated` và `robotConnectivityChanged` kích hoạt GET snapshot; event trùng cùng robot/timestamp được bỏ qua. Tối đa một request đồng thời, bắt đầu lượt kế tiếp sau ít nhất 250ms, luôn giữ một lượt cuối khi event tới trong lúc GET chạy. Event trễ không thể ghi đè pose vì chỉ dùng response server, không dùng tọa độ trong event.
- Giữ polling 5 giây để bù mất sự kiện; pose/map identity từ cùng RobotResponse. Kết nối hub có sẵn được dùng lại, không mở connection riêng cho map.
- Hiển thị Live Updates/Polling/Updates Paused/Updates Unavailable và sample age. Không gọi đây là live 60fps và không LERP giữa các lần tải.
- Offline, localization LOST/UNKNOWN hoặc dữ liệu hết hạn: đứng tại vị trí đã báo cáo cuối, có nhãn tương ứng; không giả chuyển động.
- Ngưỡng hết hạn phải cấu hình theo cadence nguồn dữ liệu. Đề xuất ban đầu cho poll 5 giây là 15 giây từ timestamp đã được BE xác nhận; kiểm tra clock skew trước khi sử dụng.
- Hub mất kết nối nhưng REST còn hoạt động: tiếp tục snapshot, báo nguồn đang dùng. Socket connected cũng không chứng minh telemetry còn mới. Reconnect/foreground revalidate ngay; background/unmount hủy lượt refresh còn chờ và gỡ subscription.
- Chọn robot mở thông tin. Follow là nút riêng; có thể bám theo các snapshot nhưng không kéo dài animation để giả thành luồng liên tục.

### 7.2 Mốc B: yêu cầu contract với BE/robot

Event telemetry hiện có chưa đủ map identity. BE owner cần chốt tối thiểu các thông tin sau; tên và kiểu wire cuối cùng thuộc BE:

| Thông tin | Mục đích |
|---|---|
| Robot identity | Ghép đúng robot, kiểm quyền/phạm vi dữ liệu. |
| MapVersionId và FrameId | Bảo đảm pose thuộc đúng map/frame đang xem. |
| Timestamp mẫu và timestamp nhận/phát tại server hoặc cơ chế tương đương | Sắp mẫu, đánh giá độ mới, xử lý độ trễ và lệch đồng hồ. Không trộn ROS simulated time với UTC. |
| Sequence và session/epoch hoặc thứ tự tương đương | Loại gói cũ/duplicate, nhận biết robot khởi động lại. |
| Pose, navigation/localization và cadence được công bố | Quyết định có thể nội suy hay phải hiển thị Last Reported. |

Cần có fixture và kiểm chứng BE/robot cho đổi map, relocalization, reconnect và restart. Không bật realtime chỉ vì frontend đã khai báo thêm các field optional.

### 7.3 Nội suy sau khi qua contract gate

- Buffer mẫu theo timestamp; loại duplicate/out-of-order; không để REST chậm ghi đè mẫu realtime mới hơn.
- Nội suy tuyến tính vị trí giữa hai mẫu đã biết. Với yaw 2D, dùng cung ngắn nhất; không cần quaternion SLERP.
- Có thể dùng một độ trễ hiển thị ngắn, cấu hình theo cadence đã đo; hiển thị sample age, không cam kết vị trí tức thời của robot.
- Không ngoại suy tương lai trong bản đầu. Hết mẫu thì dừng tại mẫu cuối.
- Không nội suy qua đổi map/frame/session, mất định vị, bước nhảy localization hoặc gap vượt ngưỡng. Ngưỡng gap/khoảng cách/góc phải chốt từ cadence và model thật; chưa có cấu hình thì snap có nhãn snapshot.
- Nội suy chỉ làm mượt hình ảnh; không xác nhận đường robot đã chạy và không dùng để suy occupancy/collision.
- Khi stale/offline/lost localization: dừng pose smoothing và Follow, giữ điểm báo cáo cuối với trạng thái rõ ràng.
- Camera Follow dùng cùng pose đang hiển thị; không thêm một bộ lọc độc lập gây lệch robot/camera. Pan/pinch thủ công hủy Follow ngay.
- Tắt vòng cập nhật khi màn bị đóng, app background hoặc reduced motion yêu cầu bỏ nội suy; không mở connection mới trong từng layer.

Trajectory/Nav2 path, traffic authority, sensor field và E-stop chi tiết được hoãn. Nếu làm sau, cần API Staff hợp lệ và metadata map/frame/timestamp; không dùng traffic diagnostics AdminOnly hoặc suy đường từ Edge.

## 8. Các giai đoạn triển khai và điều kiện qua mốc

| Mốc | Owner | Công việc / file chính | Điều kiện hoàn tất |
|---|---|---|---|
| **M0 — Khả thi** | Mobile | Kiểm runtime/dependency; prototype riêng cho simultaneous pinch/pan, marker kích thước cố định và tương tác với sheet. Chọn thiết bị Android thấp nhất hỗ trợ; ghi baseline release. | Dependency tương thích SDK, typecheck/web bundle pass; gesture hoạt động trên máy thật; thống nhất chỉ số đo. Nếu thiếu máy thật, ghi Not Verified và chưa qua gate native. |
| **M1 — Tọa độ và renderer chung** | Mobile | Mở rộng math hiện có; tạo MapViewport và ba layer; tích hợp Home/JobLive sớm sau lớp adapter mỏng. | Snapshot geometry/pose khớp renderer cũ; V018 ở Home và V001 ở Job cũ cùng hoạt động; không đổi query nghiệp vụ. |
| **M2 — Tương tác và khả năng đọc** | Mobile | Camera gestures, Fit/+/−/double-tap; grid/scale bar; Layers, selection, LOD; màu/nhãn zone và chiều Edge. | Qua test focal point, insets, tap/drag, font lớn và reduced motion. Chưa thêm pose smoothing. |
| **M3 — Bàn giao Mốc A** | Mobile | REST adapter, freshness, trạng thái missing/error/last reported, Follow snapshot; dọn hai renderer trùng khi hết consumer. | API thật hoạt động, không cần chọn kho, không marker sai map; native/web checks đạt yêu cầu ở mục 9. Có thể bàn giao độc lập với M4. |
| **M4 — Contract realtime** | BE + robot | Chốt và triển khai event identity/time/order; fixture và quyền Staff; kiểm cadence/timestamps trên robot. | Mobile nhận đủ dữ liệu đã xác minh; gate realtime có thể bật. Nếu chưa đạt, tiếp tục phát hành Mốc A. |
| **M5 — Bàn giao Mốc B** | Mobile + BE/robot kiểm chứng | Bổ sung realtime adapter, buffer/interpolator và Follow liên tục; kiểm reconnect, late packet và background. | Qua toàn bộ freshness/discontinuity tests, replay fixture và kiểm tra robot/native; có đường quay lại snapshot nếu tắt realtime. |

Không gán thời lượng cố định cho BE contract hoặc cam kết 60fps trước M0. Chia commit theo các mốc nhỏ, giữ thay đổi đang có của người dùng; không push vào main/develop.

## 9. Kiểm thử và Definition of Done

### 9.1 Test logic bắt buộc

Mở rộng `inputs-and-map.test.cjs`, `map-preview.test.cjs`, `operating-context.test.cjs`; thêm `map-transform.test.cjs` và `map-telemetry.test.cjs` khi triển khai logic tương ứng.

- World → screen → world có sai số số học không quá 1e-6m với geometry hợp lệ.
- Origin âm, originYaw khác 0, Y inversion, portrait rotation, pan/zoom/inverse cùng đúng; calibration NaN/0 bị từ chối.
- Pinch giữ focal world point; resize/đổi hướng vẫn Fit đúng; mở rộng sheet không che đối tượng được Follow.
- Không vẽ pose khác MapVersionId/frame; không clamp pose ngoài map thành vị trí hợp lệ.
- Occupied/free/unknown, polygon holes, Edge direction và nhãn Zone giữ đúng ý nghĩa API.
- Yaw 179° → -179° đi theo cung 2°; packet trễ/duplicate/map switch/session restart không tạo đường chuyển động giả.
- Stale, offline, LOST/UNKNOWN, socket mất kết nối và REST vẫn còn hoạt động được xử lý riêng.
- Đổi map khi một request cũ còn đang trả về không ghi đè geometry/pose của map mới.

### 9.2 Kiểm thử giao diện

- Android thật và web; iOS chỉ đánh dấu đạt sau khi thực sự kiểm tra trên thiết bị tương ứng.
- Viewport hẹp từ 320px, font scaling đến 200%, dọc/ngang, safe area và dock/sheet hiện tại.
- Gesture pan/pinch không kích hoạt nhầm endpoint; điều khiển +/−/Fit hoạt động bằng keyboard trên web, có focus thấy được.
- Accessible names, trạng thái không chỉ biểu diễn bằng màu; đọc đầy đủ tên mã qua sheet/list; HUD không chắn nút điều hướng.
- Reduced motion bỏ camera transition, pose smoothing và pulse; vẫn cập nhật vị trí thật và trạng thái bằng text/icon.
- Không có map, lỗi ảnh, lỗi API, empty fleet, robot khác map, out-of-bounds và robot chưa localize đều có trạng thái đúng và cách retry phù hợp.

### 9.3 Hiệu năng và lệnh kiểm tra

- Đo trên release build của thiết bị đã chốt ở M0, không dùng Expo Go/dev mode làm bằng chứng đạt hiệu năng.
- Workload nghiệm thu: 2 robot theo mục tiêu dự án, cộng replay tải cao riêng được ghi rõ là dữ liệu test. Ghi số object, cadence và thiết bị của mỗi lần đo.
- Mục tiêu 60Hz: ngân sách 16,7ms/frame; ghi P95 frame time và tỷ lệ dropped frames của bài pan/pinch/Follow 30 giây. Ngưỡng nghiệm thu đề xuất: P95 ≤ 16,7ms và dropped frames ≤ 5%; phải ghi cả công cụ và cách đo, không suy từ JS rAF FPS.
- Static geometry không render lại theo từng mẫu pose hoặc từng frame. Animation không gọi React setState hoặc chuyển về RN runtime trên mỗi gesture update.
- Chạy 10 vòng mở/đóng màn, 5 phút Follow; không còn listener/animation clock sau unmount và không có tăng bộ nhớ liên tục do layer mới.

```bash
cd app
npm run typecheck
npm test
npx expo export --platform web --output-dir /tmp/warotrans-mobile-web-check
```

Các lệnh trên không thay thế gesture/native/robot E2E. Không chạy seed hoặc integration test vào DB chung để nghiệm thu UI; replay test phải ở harness/môi trường riêng.

## 10. Chuyển đổi và quay lại bản ổn định

- Tích hợp từng screen qua adapter; chỉ xóa renderer cũ khi screen đã qua nghiệm thu và không còn consumer.
- Thay renderer là thay UI, không đổi operating-context, quyền, map assignment hoặc Job status.
- Khi tắt realtime, quay về REST snapshot đúng map với nhãn nguồn tương ứng; không tiếp tục dùng buffer cũ.
- Nếu gesture stack không đạt M0, giữ renderer hiện tại trong bản phát hành; không ghép tạm nhiều hệ transform khác nhau.
- Kết thúc mỗi mốc cập nhật đúng mục Map trong README, nêu kiểm tra đã chạy và giới hạn còn lại. Tài liệu này chỉ đổi trạng thái nghiệm thu khi có bằng chứng.

## 11. Tài liệu tham chiếu

- [Mobile agent rules](AGENTS.md), [mobile context](README.md), [Navigation rules](../rules/05-NAVIGATION-RULES.md).
- [Expo Reanimated](https://docs.expo.dev/versions/latest/sdk/reanimated/) và [Expo Gesture Handler](https://docs.expo.dev/versions/latest/sdk/gesture-handler/): tra phiên bản đúng SDK lúc triển khai, không mặc định dùng latest.
- [React Native 0.86 Animations](https://reactnative.dev/docs/0.86/animations): giới hạn native driver/PanResponder.
- [React Native Performance](https://reactnative.dev/docs/performance): frame budget và đo release build.
- [ROS REP-103](https://raw.githubusercontent.com/ros-infrastructure/rep/master/rep-0103.rst), [REP-105](https://raw.githubusercontent.com/ros-infrastructure/rep/master/rep-0105.rst): đơn vị/frame và localization discontinuity.
