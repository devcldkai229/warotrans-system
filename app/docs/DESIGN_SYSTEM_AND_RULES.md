# WaroTrans Mobile Staff App — Master Design System, Architecture & UX Guidelines

> **Target Codebase**: `/mnt/Data/Capstone Project - WaroTrans/warotrans-system/app`  
> **Source of Truth Prototype**: `/mnt/Data/Capstone Project - WaroTrans/ui-design-prototype/prototype-staff-web/src/routes/index.tsx`  
> **Target Devices**: Physical Smartphones (iPhone 12/13/14/15, Xiaomi, Samsung 19.5:9 / 19:9 ratio) and Rugged Warehouse PDAs (Zebra/Honeywell).

> ⚠️ **Migration in progress.** This document describes the *legacy* (Industrial) system.
> The current design language is **"Calm Operations"** (Apple / Linear clean minimal) and its
> Phase 1 foundation — the token set, the type scale, the status→tone table and the
> `src/shared/ui` primitives — is documented in
> [`CALM_OPERATIONS_FOUNDATION.md`](./CALM_OPERATIONS_FOUNDATION.md).
> Rules here still apply to un-migrated screens; new and migrated screens follow the
> foundation document. Where the two disagree, the foundation document wins for anything
> that imports `src/shared/ui`.

---

## 1. Triết lý Thiết kế & Ngôn ngữ Thẩm mỹ (Silicon Valley Industrial UX)

WaroTrans là hệ thống điều hành kho vận công nghiệp kết hợp robot tự hành (AMR) và hệ thống thực thi kho (WES). Ứng dụng dành cho nhân viên kho vận (Staff App) đòi hỏi:
1. **Tương phản cao tuyệt đối (High Contrast Slate)**: Môi trường kho bãi có ánh sáng mạnh hoặc vùng tối; nhân viên di chuyển liên tục. Không được dùng màu xám nhạt mờ (`#94a3b8`) cho chữ đọc hoặc đường viền thẻ card.
2. **Phân cấp thị giác rõ ràng (Hierarchy & Bold Text)**:
   - **Dữ liệu quan trọng, mã số, trạng thái**: Bắt buộc in đậm (`fontWeight: '900'`), cỡ chữ rõ ràng.
   - **Mã hệ thống, tọa độ, mã AMR/Job**: Dùng font monospace (`typography.fontMono`), viết hoa (uppercase), giãn cách chữ (`letterSpacing: 1.2 - 1.6`).
3. **Cảm giác xúc giác 3D (Tactile Micro-interactions)**:
   - Nút bấm chính có viền đáy (`borderBottomWidth: 2, borderBottomColor: '#004bb0'`), bóng đổ nhẹ.
   - Trạng thái nhấn (`pressed`): thụt xuống nhẹ (`transform: [{ scale: 0.98 }]`, `opacity: 0.88`).

---

## 2. Bảng Token Màu & Kiểu Chữ Chuẩn (Design Tokens)

### 2.1 Bảng màu cốt lõi (`src/shared/theme/colors.ts`)
| Token | Mã màu | Ứng dụng |
| :--- | :--- | :--- |
| `primary` | `#005cd1` | WaroTrans Cobalt Blue — Nút chính, viền active, icon điểm nhấn |
| `primaryDark` | `#004bb0` | Viền đáy 3D của nút primary |
| `primaryLight` | `rgba(0, 92, 209, 0.08)` | Nền chip được chọn, highlight hàng active |
| `background` | `#f8fafc` | Nền slate-50 toàn ứng dụng |
| `surface` | `#ffffff` | Nền thẻ Card, Modal, Bottom Sheet, Header |
| `surfaceMuted`| `#e2e8f0` | Nền thanh phân đoạn Segmented Filter Bar, nút phụ |
| `surfaceSubtle`| `#f1f5f9` | Nền icon tròn, hover/press background |
| `border` | `#cbd5e1` | Viền thẻ card (slate-300 đậm, rõ ranh giới, không dùng border mờ) |
| `textPrimary` | `#071523` | Chữ chính, tiêu đề (slate-950, đen đậm) |
| `textSecondary`| `#475569` | Chữ phụ, nhãn mô tả, subtitle (slate-600, đậm nét, dễ đọc) |
| `textMuted` | `#64748b` | Chữ ghi chú phụ (slate-500, không được dùng màu sáng hơn) |
| `success` | `#007a38` | Hoàn thành, pin tốt, robot trực tuyến |
| `warning` | `#f0b21b` | Chờ handover, ETA sắp tới, cảnh báo |
| `warningText` | `#854d0e` | Chữ / viền amber đặt trực tiếp trên `background` hoặc `surface` |
| `danger` | `#c8272b` | Dừng khẩn cấp, sự cố hàng hóa, deadlock |

> **Lưu ý:** ba giá trị trên là giá trị **thật** trong `src/shared/theme/colors.ts:28,34,40`.
> Mỗi tone còn có các token đi kèm `*Bg`, `*Soft`, `*Border` (ví dụ `successBg: '#eefaf2'`).
> Luôn đọc token thật từ `colors.ts` thay vì dùng giá trị ghi nhớ.

> **Về `warning`:** `#f0b21b` chỉ đạt **1.81:1** trên `#f8fafc`, thấp hơn mức 3:1 mà WCAG 1.4.11
> yêu cầu cho graphic mang ý nghĩa. Vì vậy `warning` chỉ dùng làm **nền/fill**; mọi chữ hoặc
> viền đặt trực tiếp lên nền sáng phải dùng `warningText` (`#854d0e`, ~6.5:1).
> Khi cần một graphic nhỏ mang tín hiệu (ví dụ chấm trạng thái), hãy dùng fill `warning`
> kèm viền `warningText` thay vì để fill trần.

### 2.2 Quy chuẩn Typography (`src/shared/theme/typography.ts`)
* **Hệ Font Chuẩn (Native Retina & Modern Web)**:
  * **iOS Native (iPhone)**: San Francisco (`SF Pro`) bản địa Apple — tối ưu hoàn hảo kerning, tracking và độ nét cho màn hình Super Retina XDR.
  * **Web Simulator & Android**: `Inter` (đầy đủ các biến thể weight `400, 500, 600, 700, 800, 900`).
  * **Monospace Codes**: `Menlo` (iOS) / `JetBrains Mono` (Web).
  * **Khử răng cưa Web**: Bắt buộc bật `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility;` trong CSS toàn cục để triệt tiêu hiện tượng chữ bị mỏng và nhạt màu trên trình duyệt desktop.
* **Eyebrows / Badges / Protocol Codes**: `fontMono`, size `9-10`, `fontWeight: '900'`, `textTransform: 'uppercase'`, `letterSpacing: 1.2 - 1.6`.
* **Tiêu đề màn hình & Thẻ chính**: `fontSans`, size `16-24`, `fontWeight: '900'`, `color: colors.textPrimary` (`#071523`).
* **Nội dung thẻ & Mô tả**: `fontSans`, size `11-13`, `fontWeight: '600' - '700'`, `color: colors.textSecondary` (`#475569`). Tuyệt đối không dùng xám nhạt mờ (`#94a3b8`) cho nội dung đọc hay đường viền.
* **Chỉ số Telemetry**: `fontMono` hoặc `fontSans`, `fontWeight: '900'`, `tabularNums`.

---

## 3. Quy chuẩn Công thái học & Thiết bị Di động (Mobile Ergonomics)

### 3.1 Edge-to-Edge & Safe Area Insets (iOS Tai Thỏ & Home Indicator)
* **KHÔNG bao bọc toàn bộ ứng dụng bằng `<SafeAreaView>`**:
  * Root tại `App.tsx` phải là `<View style={{ flex: 1, backgroundColor: colors.background }}>`.
  * Tránh tạo khoảng trống (letterbox) hụt đầu và đáy trên iPhone 12/13/14/15.
* **Quy chuẩn Header đỉnh máy**:
  * Mọi thanh header phải giữ đúng inset dùng chung để che kín tai thỏ:
    ```tsx
    paddingTop: Platform.OS === 'ios' ? 48 : 12, // Che kín tai thỏ bằng nền header
    paddingBottom: 12,
    ```
  * `minHeight` phía iOS luôn là `104`, nhưng **phía non-iOS KHÔNG phải hằng số duy nhất**. Phải lấy đúng giá trị
    của file đang sửa — không được mặc định `72`:
    | File | `minHeight` |
    | --- | --- |
    | `src/shared/components/SubScreenHeader.tsx` | `Platform.OS === 'ios' ? 104 : 72` |
    | `src/features/monitoring/IssueReportingModal.tsx` | `Platform.OS === 'ios' ? 104 : 72` |
    | `src/features/jobs/JobsScreen.tsx` | `Platform.OS === 'ios' ? 104 : 75` |
    | `src/features/transport/TransportScreen.tsx` | `Platform.OS === 'ios' ? 104 : 76` |
    | `src/features/jobs/JobDetailScreen.tsx` | `Platform.OS === 'ios' ? 104 : 68` |
    | `src/app/shell/AppHeader.tsx` | không dùng — `useTopInset()` + hai hàng nội dung |
  * **Phase 2 đã bỏ dropdown neo theo header**: zone picker, account sheet và safety sheet giờ là `Modal`, không còn `top: 92` hay `top: Platform.OS === 'ios' ? 92 : 56`.
* **Quy chuẩn Bottom Navigation (Phase 2 — Calm Operations)**:
  * > **LƯU Ý**: mục này đã được viết lại ở Phase 2. Bản "viên thuốc nổi" (floating pill)
    > bên dưới là **Phase 0 / prototype parity**, đã bị bỏ. Tham chiếu hiện hành:
    > [`CALM_OPERATIONS_SHELL_AND_PILOTS.md`](./CALM_OPERATIONS_SHELL_AND_PILOTS.md) §3.3 và
    > [`AGENTS.md`](../AGENTS.md) §2.3.
  * Thanh điều hướng phẳng, tràn viền (edge to edge): nền trắng, 1px hairline trên, **không** pill, **không** shadow nổi.
  * 4 tab: Home · Jobs · Live Map · Transport. Nhãn 12pt Title Case (không ALL-CAPS).
  * **Lớp phủ `position: absolute`, không tự nhận safe-area** — inset được áp bằng một dải anh em
    (`<View style={[styles.safeArea, { height: insets.bottom || 8 }]} pointerEvents="none" />`)
    để mặt trắng liền mạch, không bị lùn vào trên icon.
  * Mọi màn hình muốn ghim nội dung sát đáy phải chừa chỗ bằng **`dockReservedSpace(dockHeight)`**
    (`src/shared/theme/layout.ts`) chứ **không** hardcode `paddingBottom`.
  * `dockHeight` được đo thật qua `onLayout` trên thanh bar (`BottomTabBar.tsx`) và phát ra qua
    `NavigationContext`, nên khi đổi icon/padding khoảng hở tự động theo.
    ```tsx
    const { dockHeight } = useNavigation();
    const bottomInset = dockReservedSpace(dockHeight); // height + bottomOffset(0) + gutter(16)
    contentContainerStyle={[styles.listContent, { paddingBottom: bottomInset }]}
    ```
  * Tab active: `colors.primary` + weight 600. Inactive: `colors.textMuted` + weight 500.
  * Badge đếm Job: `top: -6, right: -12`, nền `colors.warning`, viền `colors.warningText`, chữ `colors.textPrimary`.
  * *(Phase 0, đã bỏ — giữ để tham chiếu lịch sử)*: viên thuốc nổi `borderRadius: 999`, `paddingVertical: 7`, shadow nổi.
* **Khu vực ngón cái (Thumb Zone) & Bệ Đỡ Đáy (Solid Surface Foundation)**:
  * Nửa dưới màn hình (40–50% từ dưới lên) là nơi ngón tay cái thao tác thuận tiện nhất khi cầm máy 1 tay.
  * **Bệ đỡ đáy (Solid Bottom Surface)**: thanh điều hướng nằm sát mép đáy vật lý (`bottom: 0`), triệt tiêu hoàn toàn khe hở lọt nội dung phía dưới.
  * **Khoảng đệm cuộn an toàn (Safe Scroll Insets)**: mọi màn hình cuộn (`HomeScreen`, `JobsScreen`) lấy `paddingBottom` từ `dockReservedSpace(dockHeight)`; `HomeScreen` giữ thêm sàn 100pt để trang ngắn không kết thúc sát thanh. `TransportScreen` (chưa migrate) vẫn dùng `Platform.select({ ios: 104, default: 96 })` — hãy sửa khi migrate.

### 3.2 Cử chỉ Cảm ứng (Touch Gestures)
* **Bottom Sheet kéo vuốt (PanResponder)**:
  * Tích hợp `PanResponder` trên thanh handle và đầu thẻ:
    * `dy < -25`: Vuốt lên $\rightarrow$ bung mở (*Expand Fleet View & Pulse*).
    * `dy > 25`: Vuốt xuống $\rightarrow$ thu gọn (*Collapse*).
  * Kèm hiệu ứng chuyển động mượt: `LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)`.
* **Kích thước vùng bấm (Touch Targets)**:
  * Mọi icon tròn bấm được (Back, Bell, Logout) phải có kích thước tối thiểu `36x36px` với `hitSlop` hoặc đệm $\ge 44\times 44\text{px}$ (chuẩn WCAG 2.2 Level AA).

### 3.3. Ngân sách nhãn CTA — chữ KHÔNG được tràn ra ngoài viên nút

* **Hiện tượng (đã xảy ra)**: `Button` render `<View style={contentRow}><Text>{label}</Text></View>` mà
  **không khai báo `flexShrink`**. Yoga mặc định `flexShrink: 0`, nên một nhãn quá dài giữ nguyên bề rộng
  nội tại của nó (~340pt cho 35 ký tự @ 15pt/900/ls 0.8) trong khung ~237pt; `justifyContent: 'center'`
  chia đều phần dư ra **cả hai bên**, tạo ra đúng triệu chứng "chữ tràn ra ngoài viên pill ở cả trái lẫn phải".
* **Luật bắt buộc**: nhãn dài **phải xuống dòng bên trong** viên nút, tuyệt đối không tràn và không bị cắt
  bằng ellipsis (một CTA bị cắt `GENERATE & INGEST BAR…` còn tệ hơn hẳn một CTA hai dòng — nó che mất chính
  hành động mà nút thực hiện). `Button.tsx` đã xử lý ở tầng component: `contentRow` có `flexShrink: 1` +
  `minWidth: 0`, nhãn có `flexShrink: 1`, icon có `flexShrink: 0` (để icon không bị bóp méo khi nhãn xuống dòng).
  **Không** đặt `numberOfLines` cho nhãn nút. Mọi nút trong app tự giãn theo `minHeight`/`paddingVertical`
  (không nào dùng `height` cố định), nên nhãn xuống dòng làm viên nút cao thêm mà không vỡ layout.
* **Ngân sách thực tế** trên iPhone 375pt (khung card nội): `375 − 32 − 32 = 311`; trừ padding `lg` 48 và icon 26
  → chỉ còn **~237pt cho chữ**. Ở `size="lg"` (15pt / weight 900 / letterSpacing 0.8) ứng với **~24 ký tự**.
* **Quy tắc copy cho CTA**: verb + object, tối đa 3 từ, bỏ tiền tố ALL-CAPS dài, bỏ thông tin đã hiện ở nơi khác
  (ví dụ card máy in đã ghi `Model: Zebra ZT411` thì nút không cần `(ZEBRA ZT411)`).
* **Hàng lọc ngang (filter tabs)**: khi số tab ≤ 4 và nhãn ngắn, dùng **cột đều `flex: 1` trong một `View` thường**,
  **không** dùng `ScrollView` ngang. Nguyên nhân: nằm trong ScrollView ngang, chip cuối luôn bị viewport cắt cụt
  và trông như layout hỏng chứ không phải "kéo đi xem thêm". `paddingRight` **không sửa được** hiện tượng cắt —
  nó chỉ thêm khoảng trắng *sau* chip cuối khi đã cuộn hết. Thêm `numberOfLines={1}` + `flexShrink: 1` vào nhãn tab
  để phòng thủ nếu nhãn sau này dài hơn.

### 3.4. Mã đặc tả prototype (`SCR-STF-xx`) KHÔNG được xuất hiện trong UI

* `SCR-STF-xx` là **mã định danh màn hình trong prototype** (`ui-design-prototype/.../routes/index.tsx`), chỉ có
  giá trị truy vết thiết kế. Chúng **không được** nằm trong bất kỳ chuỗi nào người dùng đọc được — eyebrow,
  badge, tiêu đề section, header tag. Operator không cần biết mã màn hình prototype, và chúng làm nhiễu
  nhịp thị giác của label nghiệp vụ.
* Khi gỡ khỏi UI, **giữ lại mã trong code comment** dạng `Prototype ref: SCR-STF-xx (routes/index.tsx)`
  để không mất khả năng đối chiếu với prototype.
* Quy tắc này áp dụng cho **mọi** chuỗi dạng mã đặc tả giả: `SCR-STF-xx`, `SCREEN W-xx`, `Section 8.x Rule y`.
  Văn bản nghiệp vụ có giá trị thật (ví dụ "AMRs automatically detour around the hazard") thì **giữ lại**,
  chỉ gỡ tiền tố trích dẫn giả.

---

## 4. Quy chuẩn Thông báo Toast & Phản hồi Rung (Haptics)

### 4.1 Floating Sonner-Style Toast
* **Vị trí**: `top: Platform.OS === 'ios' ? 54 : 14` (nằm ngay dưới tai thỏ, tuyệt đối không bị che khuất).
* **Biểu tượng**: Hỗ trợ icon động theo ngữ cảnh (ví dụ: `MapPin` / `'📍'` khi bấm *"Locate Me"*).
* **Tương tác**: Không dùng nút `X` rườm rà; hỗ trợ chạm/vuốt để ẩn, tự động biến mất sau 3.2s.

### 4.2 Tiết chế Rung Tactile Motor (`src/shared/utils/haptics.ts`)
* **Chống spam motor rung**:
  * Các thao tác thông thường (`tap`, `tick`, chuyển tab, mở modal): **Hoàn toàn tắt rung** (`break`).
  * Tuyệt đối không rung khi người dùng chỉ mới mở popup xác nhận (như mở modal Logout).
* **Cường độ vi xung (Micro-pulses)**:
  * `'success'`: Xung cực nhẹ `10ms` (cảm giác click thanh thoát như Apple Watch).
  * `'warning'`: Xung nhẹ `15ms`.
  * `'error'`: 2 vi xung `[0, 20, 30, 20]` (không dùng chuỗi 80ms gây rung bần bật máy).

---

## 5. Quy tắc Lập trình Tránh Lỗi Hermes Native

Khi phát triển ứng dụng React Native / Expo:
1. **Cô lập Web vs Native**:
   * Tuyệt đối KHÔNG truy cập `window.location`, `window.history`, `document` trên Native.
   * Bắt buộc bọc điều kiện: `if (Platform.OS === 'web' && typeof window !== 'undefined') { try { ... } catch {} }`.
2. **Không dùng thuộc tính Web CSS trong `StyleSheet.create`**:
   * Tránh `pointerEvents: 'none'` trong `StyleSheet` $\rightarrow$ Dùng JSX prop: `<View pointerEvents="none">`.
   * Tránh `outline`, `backdropFilter`, `cursor` trong `StyleSheet.create`.

---

## 6. Phạm vi Triển khai & An toàn Hệ thống

1. **Phạm vi Front-End thuần túy (FE-Only)**:
   * Mọi can thiệp chỉ thực hiện trong thư mục `warotrans-system/app`.
   * Không chạm vào Backend hoặc Database khi chưa có yêu cầu cụ thể.
2. **Kiểm tra biên dịch trước khi hoàn tất**:
   * Luôn chạy `npm run typecheck` (`tsc --noEmit`) trong `warotrans-system/app` để đảm bảo **0 lỗi compilation**.
3. **Truy vết thiết kế không được lọt sang UI**:
   * Mọi mã đặc tả prototype (`SCR-STF-xx`, `SCREEN W-xx`, `Section 8.x`) chỉ tồn tại trong **code comment**
     (`Prototype ref: ...`) — xem [§3.4](#34-mã-đặc-tả-prototype-scr-stf-xx-không-được-xuất-hiện-trong-ui).
