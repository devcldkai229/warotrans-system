# Junction zone: nối lane qua ngã giao và đưa robot tới waypoint ngoài lane

> Nhánh `feature/junction-zone` · 2026-10-25. Liên quan: route graph `GET /api/navigation/maps/{id}/route-graph`
> (`RouteGraphBuilder`).

## 1. Vấn đề

Trên Map Editor, người vẽ thường **không kéo lane xuyên qua ngã giao**. Lane dừng ở mép khu giao nhau, còn khu đó
được vẽ thành một zone (giống junction zone của OTTO). Nếu chỉ nhìn lane thì các lane này rời nhau: route graph báo
`DEAD_END_NODE` / `ENDPOINT_UNREACHABLE`, robot không đi qua ngã được.

## 2. Loại zone mới: `JUNCTION`

| Zone | Nối lane? | Ràng buộc thêm |
|---|---|---|
| `JUNCTION` (mới, màu `#00897b`) | có | không, chỉ là nhãn |
| `SINGLE_OCCUPANCY` | có (giữ như cũ) | capacity = 1 (nhãn `single_occupancy`) |
| `NO_STOP` | có (giữ như cũ) | nhãn `no_stop` |
| `SPEED` | không | giới hạn `abs_speed_limit` |
| `KEEP_OUT` | không, còn cắt lane | xoá phần lane bên trong |

- **Không cần migration:** `zone_type` lưu dạng chuỗi và không có check constraint.
- **Khi tạo trên web:** JUNCTION mặc định capacity 1, không bắt buộc MaxSpeed.
- **Zone chồng nhau:** mọi ràng buộc cùng áp dụng. Ví dụ JUNCTION chồng SPEED thì đường nối mang `junction`,
  bị giới hạn tốc độ, và `zone_codes` chứa cả hai zone.

### Cách nối (giống hôm trước, giờ áp dụng cho cả 3 loại)

1. Chỉ **đầu lane thật** tham gia. Một node được tính là "ở trong zone" nếu nằm trong zone hoặc cách mép ≤ 0.15 m.
   - cuối lane một chiều = **đến**;
   - đầu lane một chiều = **đi**;
   - đầu hở của lane hai chiều = cả đến và đi;
   - lane chạy xuyên qua zone thì không tham gia.
2. Mỗi node **đến** được nối thẳng tới mỗi node **đi**, nên không bao giờ có đường ngược chiều lane một chiều.
3. Đường nối được kiểm tra mỗi 5 cm: phải nằm trong zone và không vào KEEP_OUT. Với zone hình chữ L, đường cắt
   góc bị loại.
4. Cạnh nối có metadata `junction: true` và mang nhãn của các zone chứa nó.

## 3. Waypoint nằm ngoài lane: đi qua junction zone

Thứ tự gắn một Endpoint vào graph:

1. Endpoint trùng node → gắn vào node đó.
2. Cách lane ≤ 0.5 m → connector 2 chiều tại chân đường vuông góc (như cũ).
3. **Mới:** xa mọi lane, nhưng **nằm trong** hoặc **cách mép ≤ 0.5 m** một zone nối lane:
   - **điểm ra P** = chính Endpoint nếu nó nằm trong zone; nếu không thì là điểm gần nhất trên mép zone;
   - mọi node **đến** của zone → P, và P → mọi node **đi** (vẫn kiểm tra nằm trong zone, tránh KEEP_OUT, đúng chiều lane);
   - nếu P khác Endpoint thì thêm connector 2 chiều P ↔ Endpoint. Robot ra khỏi zone đúng ở mép rồi mới đi tới waypoint.
   - Có nhiều zone thì chọn zone gần nhất. Nếu P không nối được với đầu lane nào, thử zone kế tiếp.
4. Không thoả điều nào ở trên → `ENDPOINT_TOO_FAR`. Thông báo lỗi gợi ý: vẽ lane tới, dời Endpoint, hoặc nới junction
   zone tới nó.

```
   lane A ──────●            ●────── lane B        ● = đầu lane (đến + đi)
               ┌┼────────────┼┐
               ││ JUNCTION   ││                    ─ = đường nối junction
               │●─────●──────●│
               └──────P───────┘                    P = điểm ra trên mép zone
                      │ connector 2 chiều
                      ◎ EP-IN (cách mép 0.3 m, cách lane 0.94 m)
```

## 4. Thay đổi theo lớp

| Lớp | File | Nội dung |
|---|---|---|
| Domain | `Enums/ZoneType.cs`, `Geometry/ZonePolicyValidator.cs` | thêm `JUNCTION` |
| Route graph | `RouteGraph/RouteGraphBuilder.cs` | `IsJunctionZone`, `ConnectJunction` lưu đầu lane của từng zone, `AttachThroughJunction`, `ClosestOnRing` |
| API | `GetRouteGraph/Endpoint.cs` | mô tả OpenAPI |
| Web | `contracts.ts`, `constants.ts`, `mapStyle.ts`, `MapEditorPage.tsx` | loại Junction trong công cụ Zone, chú giải, màu, gợi ý; capacity mặc định 1 |
| Gazebo (repo robot) | `generate_warehouse.py` | sơn JUNCTION zone cùng màu web |

## 5. Kiểm chứng

- **Unit test:** 140/140 (Navigation), có 7 test mới:
  - JUNCTION chỉ nối, không gắn nhãn no_stop / single_occupancy;
  - SPEED chồng lên junction;
  - waypoint cạnh zone đi qua điểm ra;
  - waypoint trong zone thành node của junction;
  - điểm ra giữ đúng chiều lane một chiều;
  - waypoint quá xa, hoặc gần một zone không phải junction (SPEED), vẫn báo `ENDPOINT_TOO_FAR`.
- **Integration test:** 44/44 (Navigation), chạy trên DB riêng `warotrans_it`.
- **Web:** `tsc`, `vitest` 10/10, `vite build` đều qua.
- **Map V014 (của bạn):** vẫn 422, vì EP-IN / EP-OUT / EP-QC (cách lane 0.56–0.59 m) chưa có zone nối lane nào trong
  phạm vi 0.5 m. Muốn hết lỗi thì vẽ một Junction zone ở khu đó (lane dừng ở mép), hoặc nới zone hiện có tới gần
  các điểm này.
- **Chưa làm:** module runtime chưa khoá zone theo capacity (giống SINGLE_OCCUPANCY). JUNCTION hiện có tác dụng ở việc
  lập đường đi, chưa giới hạn số robot cùng vào.
