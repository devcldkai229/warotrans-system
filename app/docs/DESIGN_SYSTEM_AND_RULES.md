# WaroTrans Mobile Staff App — Master Design System, Architecture & UX Guidelines

> **Target Codebase**: `/mnt/Data/Capstone Project - WaroTrans/warotrans-system/app`  
> **Source of Truth Prototype**: `/mnt/Data/Capstone Project - WaroTrans/ui-design-prototype/prototype-staff-web/src/routes/index.tsx`  
> **Target Devices**: Physical Smartphones (iPhone 12/13/14/15, Xiaomi, Samsung 19.5:9 / 19:9 ratio) and Rugged Warehouse PDAs (Zebra/Honeywell).

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
| `success` | `#059669` / `#10b981` | Hoàn thành, pin tốt, robot trực tuyến |
| `warning` | `#d97706` / `#f59e0b` | Chờ handover, ETA sắp tới, cảnh báo |
| `danger` | `#dc2626` / `#ef4444` | Dừng khẩn cấp, sự cố hàng hóa, deadlock |

### 2.2 Quy chuẩn Typography (`src/shared/theme/typography.ts`)
* **Eyebrows / Badges / Protocol Codes**: `fontMono`, size `9-10`, `fontWeight: '900'`, `textTransform: 'uppercase'`, `letterSpacing: 1.2 - 1.6`.
* **Tiêu đề màn hình & Thẻ chính**: `fontSans`, size `16-24`, `fontWeight: '900'`, `color: colors.textPrimary`.
* **Nội dung thẻ & Mô tả**: `fontSans`, size `11-13`, `fontWeight: '600' - '700'`, `color: colors.textSecondary`.
* **Chỉ số Telemetry**: `fontMono` hoặc `fontSans`, `fontWeight: '900'`, `tabularNums`.

---

## 3. Quy chuẩn Công thái học & Thiết bị Di động (Mobile Ergonomics)

### 3.1 Edge-to-Edge & Safe Area Insets (iOS Tai Thỏ & Home Indicator)
* **KHÔNG bao bọc toàn bộ ứng dụng bằng `<SafeAreaView>`**:
  * Root tại `App.tsx` phải là `<View style={{ flex: 1, backgroundColor: colors.background }}>`.
  * Tránh tạo khoảng trống (letterbox) hụt đầu và đáy trên iPhone 12/13/14/15.
* **Quy chuẩn Header đỉnh máy**:
  * Mọi thanh header (`AppHeader`, `SubScreenHeader`, `pageHeader` của Jobs và Transport) phải có:
    ```tsx
    paddingTop: Platform.OS === 'ios' ? 48 : 12, // Che kín tai thỏ bằng nền header
    paddingBottom: 12,
    minHeight: Platform.OS === 'ios' ? 104 : 72,
    ```
  * Dropdown menus bên trong header phải đặt: `top: Platform.OS === 'ios' ? 92 : 56`.
* **Quy chuẩn Bottom Tab Bar**:
  * Phải chạm đáy vật lý của thiết bị:
    ```tsx
    height: Platform.OS === 'ios' ? 86 : 72,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8, // Chừa khoảng trống cho thanh Home bar
    ```
  * Badge đếm Job phải đặt tại `top: -2, right: 0`, không che icon `PackageCheck`.
* **Khu vực ngón cái (Thumb Zone)**:
  * Nửa dưới màn hình (40–50% từ dưới lên) là nơi ngón tay cái thao tác thuận tiện nhất khi cầm máy 1 tay.
  * Thẻ tác vụ cần xử lý ngay (*"NEXT HANDOVER TASK"*) phải **dock sát ngay trên Tab Bar**, không được để khoảng trống lơ lửng ở giữa.

### 3.2 Cử chỉ Cảm ứng (Touch Gestures)
* **Bottom Sheet kéo vuốt (PanResponder)**:
  * Tích hợp `PanResponder` trên thanh handle và đầu thẻ:
    * `dy < -25`: Vuốt lên $\rightarrow$ bung mở (*Expand Fleet View & Pulse*).
    * `dy > 25`: Vuốt xuống $\rightarrow$ thu gọn (*Collapse*).
  * Kèm hiệu ứng chuyển động mượt: `LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)`.
* **Kích thước vùng bấm (Touch Targets)**:
  * Mọi icon tròn bấm được (Back, Bell, Logout) phải có kích thước tối thiểu `36x36px` với `hitSlop` hoặc đệm $\ge 44\times 44\text{px}$ (chuẩn WCAG 2.2 Level AA).

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
