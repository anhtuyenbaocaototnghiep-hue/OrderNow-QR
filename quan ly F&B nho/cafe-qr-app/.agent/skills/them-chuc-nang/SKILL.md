---
name: them-chuc-nang
description: Thêm / sửa chức năng cho cafe-qr-app đang chạy (HTML/CSS/JS thuần + Node.js/Express + SQL Server + Socket.io, chỉ tiền mặt). Gộp skill `extend-features` (giai đoạn 2 — FEATURE-013…023: hội viên SĐT, combo, khuyến mãi, gợi ý/bán chạy, tùy chọn món, chốt ca, hoàn tiền, tự hết món, gọi nhân viên, giảm giá tay, nhập kho/kiểm kê) và `advanced-features` (giai đoạn 4–8 — FEATURE-025…045: gọi lại đơn, thực đơn theo lịch, thời gian chờ, chia bill, đơn vị & giá vốn, bán thành phẩm, hao hụt, lô FEFO, nhà cung cấp & PO, dự báo nhập, trưởng ca, sổ quỹ, chấm công & audit, lãi/lỗ, tích điểm & tem, giới thiệu bạn & voucher, chiến dịch, menu engineering, phân tích, dashboard "Hôm nay"), cộng F-024, F-046, F-047. Dùng khi task giao một FEATURE-0xx, nhắc một từ khóa trên, hoặc yêu cầu thêm chức năng mới (FEATURE-048 trở đi).
---

# Skill thêm chức năng — cafe-qr-app

> Đọc kèm: `Skill/YEU-CAU.md` (yêu cầu, quy tắc nghiệp vụ) và `Skill/KIEN-TRUC.md` (kiến trúc, thư mục, SP, job).
> Nguồn sự thật là `tài-liệu/`; skill này chỉ bổ sung. Lệch nhau → ghi Q vào `tài-liệu/open-questions.md` và làm theo `tài-liệu/`.
> Bản gộp ngày 19/10/2026 từ hai skill `extend-features` + `advanced-features`. Bản gốc lưu ở `tài-liệu/nguồn/skill-goc/` (các FEATURE / TASK / ADR cũ ghi "skill `extend-features` §4 F-xxx" là trỏ tới đó).
> Skill đang dùng: `.agent/skills/them-chuc-nang/SKILL.md` — **bản duy nhất**; `.claude/skills/` là bản sao sinh tự động bằng `npm run skills:sync`, không sửa tay.

---

# 0. Trạng thái hiện tại

- Mọi feature F-001…F-047 đã code + test tự động pass (**READY_FOR_REVIEW**). Kết quả gần nhất: `npm test` 234/234, `npm run test:e2e` 29/29, `npm run load` 10/10.
- Các đặc tả ở mục 5 là **thiết kế gốc**. Tên bảng/cột/route thật có thể khác — luôn đối chiếu `tài-liệu/kiến-trúc/data-model.md`, `api-contract.md` và code trước khi sửa.
- Mã skill **F-024 "Gọi lại đơn / món yêu thích"** đã đổi thành **FEATURE-045**, vì FEATURE-024 là "Gọi món tại bàn".
- Số kế tiếp khi thêm mới: **FEATURE-048**, **BR-074**, **ADR-009**, **D-39**, migration **0034**, **TASK-057**. Kiểm lại trước khi dùng (`ls` thư mục tương ứng).
- Còn mở: Q-000 (người ký chốt), Q-008 (hosting), Q-021 (gọi món tại bàn), Q-022 (ma trận Trưởng ca lệch docs). Q-021 và Q-022 đang chạy theo mặc định.

## Bản đồ đường dẫn (skill gốc → repo thật)

| Skill gốc ghi | Repo thật |
| --- | --- |
| `docs/` | `tài-liệu/` |
| `docs/features/FEATURE-0xx.md` | `tài-liệu/chức-năng/FEATURE-0xx.md` |
| `docs/decisions/` | `tài-liệu/quyết-định/` |
| `docs/plans/<TASK>-plan.md` | `tài-liệu/kế-hoạch/<TASK>-plan.md` |
| `docs/tasks/README.md` | `tài-liệu/công-việc/README.md` |
| `docs/operations/local-development.md` | `tài-liệu/vận-hành/local-development.md` |
| `db/migrations/` | `cơ-sở-dữ-liệu/chuyển-đổi/` |
| `db/procs/` | `cơ-sở-dữ-liệu/thủ-tục/` |
| `apps/api/src/` | `ứng-dụng/máy-chủ/src/` |
| `apps/web/public/` | `ứng-dụng/giao-diện/public/` |

---

# 1. Mục đích, khi dùng, điều kiện trước

**Mục đích.** Mở rộng hệ thống đang chạy mà **không phá** luồng lõi: đặt món → tiếp nhận → hoàn tất / trừ kho → gọi thanh toán → thu tiền → in bill, cùng luồng bán mang đi. Phải giữ nguyên:
- các bất biến kho (BR-001, BR-002, BR-041);
- các bất biến tiền (BR-007, BR-019, BR-021/057);
- bộ tính giá dùng chung `pricing`.

**Khi dùng**
- Task giao một FEATURE-013…047, hoặc một giai đoạn ở mục 4.
- Task nói tới: hội viên, combo, khuyến mãi, gợi ý / bán chạy, tùy chọn món, chốt ca, hoàn tiền, kiểm kê / nhập kho, gọi nhân viên, giảm giá tay, gọi lại đơn, thời gian chờ, chia bill, bán thành phẩm / sơ chế, lô / hạn dùng, dự báo nhập, nhà cung cấp / PO, đơn vị / giá vốn, hao hụt, sổ quỹ, lãi lỗ, chấm công / phân ca / audit, trưởng ca, chiến dịch / Zalo, giới thiệu bạn, tích điểm / tem, thực đơn theo mùa, menu engineering, giờ cao điểm / dự báo doanh thu, dashboard chủ quán, sửa / xóa món, hủy bàn, thẻ thành viên.
- Task là chức năng hoàn toàn mới: theo mục 2, 8, 9 và mẫu đặc tả ở mục 5.

Không dùng skill này để sửa lỗi luồng lõi hay chỉnh giao diện đơn thuần. Những việc đó dùng `implement-feature` / `verify-change`; việc chỉ chạm DB thì dùng `change-database`.

**Điều kiện trước**
- Source chạy được local. Lệnh lấy từ `tài-liệu/vận-hành/local-development.md` hoặc `package.json`; **không bịa lệnh**.
- Đã đọc `AGENTS.md`, `.agent/rules.md` và mục 3 (quyết định mặc định).
- Feature tiền đề đã DONE (kiểm trong `tài-liệu/công-việc/README.md`) — xem cột "Tiền đề" ở mục 4. Thiếu tiền đề thì dừng feature đó, báo lại và làm feature độc lập khác.

---

# 2. Bước 0 bắt buộc: khảo sát rồi mới làm

Hệ thống do nhiều người / agent viết, nên tên bảng, cột, route, file có thể **khác** tài liệu. Trước mỗi feature:

1. **Schema thật:** đọc `cơ-sở-dữ-liệu/chuyển-đổi/*.sql` và `cơ-sở-dữ-liệu/thủ-tục/*.sql` (hoặc `INFORMATION_SCHEMA`, `sys.procedures` trên DB dev). Ghi lại tên thật của:
   - bảng đơn, dòng đơn, phiên, thanh toán, món, nguyên liệu, BOM, giao dịch kho;
   - SP gửi đơn / hoàn tất / thu tiền.
2. **Route thật** trong `ứng-dụng/máy-chủ/src/routes/*`, cùng service / repository đang gọi SP.
3. **Trang FE thật** trong `ứng-dụng/giao-diện/public/**`, cùng module dùng chung (`api.js`, `socket.js`, `cart.js`, `print.js`, `ui.js`…).
4. **Baseline:** chạy test hiện có để biết PASS / FAIL trước khi sửa.
5. **Plan:** viết `tài-liệu/kế-hoạch/<TASK>-plan.md` **trước khi code**, gồm:
   - bảng map "tên trong skill → tên thật";
   - file sẽ sửa / tạo;
   - số migration kế tiếp;
   - SP bị ảnh hưởng;
   - test sẽ thêm.

Kiểm thêm khi chạm các vùng sau:
- `Payments` gắn với phiên thế nào (unique index theo phiên / phần chia bill).
- Các giá trị đang có của `InventoryTransactions.Type`.
- CHECK của `Users.Role` (STAFF / MANAGER / ADMIN).
- Bộ lập lịch job duy nhất trong `src/jobs/` — không tạo timer riêng.

Thấy hành vi lõi lệch docs (ví dụ trừ kho ở thời điểm khác) thì **không sửa trong task này** — ghi Q và báo.

---

# 3. Quyết định mặc định (D-5…D-38)

Chỉ áp dụng khi `tài-liệu/quyết-định/` không nói khác. Đã chốt ở ADR-005…008. Muốn đổi một quyết định → viết ADR mới, không sửa code rải rác.

Yêu cầu gốc của chủ dự án:
- Hội viên đăng ký **không bắt buộc**, bằng **SĐT + họ tên**. Lần sau chỉ cần nhập SĐT là được chiết khấu.
- Khách mang đi đọc SĐT để nhân viên nhập tay.
- Menu QR có mục **Combo**, **Ưu đãi**, **Gợi ý / Bán chạy**.
- Tất cả quản lý ở admin.

| Mã | Mặc định | Có thể đổi |
| --- | --- | --- |
| D-5 | Hội viên = **hạng + chiết khấu %** (Thành viên 3 %, Thân thiết 5 % từ 1.000.000đ lũy kế, VIP 8 % từ 3.000.000đ) + **đơn đầu −10 %**. Lưu `TotalSpent`, `Points` | Tích điểm đổi quà; tem |
| D-6 | **Không OTP**. Nhận diện bằng SĐT, hiện tên che một phần để xác nhận, rate-limit tra cứu | OTP Zalo / SMS |
| D-7 | Thứ tự tính tiền: giá KM / combo của dòng → giảm theo đơn → chiết khấu hội viên (chỉ dòng cho cộng dồn) → giảm tay → làm tròn **xuống** 500đ. Mở rộng ở mục 6 | Làm tròn 1.000đ |
| D-8 | KM dòng và KM đơn **khóa lúc gửi đơn**; chiết khấu hội viên và giảm tay **tính lúc thu tiền** | Tính tất cả lúc thu |
| D-9 | Combo **cố định** (danh sách món + số lượng), giá do admin đặt; BOM = tổng BOM thành phần | Combo "chọn 1 trong N" |
| D-10 | KM `ITEM_PRICE` (giá đặc biệt cho món / danh mục theo lịch) và `ORDER_PERCENT` / `ORDER_AMOUNT` (giảm theo đơn tối thiểu); cờ `StackWithMember` | Mua N tặng 1 |
| D-11 | Gợi ý = top 8 tự động theo số lượng bán 7 ngày (cache 15 phút) **+ món ghim tay** xếp trước | Chỉ ghim tay |
| D-12 | Khả dụng < 1 suất → món tự "Hết món"; admin tắt tay thì không bị bật tự động | Thủ công |
| D-13 | Tùy chọn món: nhóm có Min/Max chọn; mỗi tùy chọn có `PriceDelta` và BOM cộng thêm | Size thay toàn bộ BOM |
| D-14 | Giảm tay: STAFF ≤ 10 % **và** ≤ 20.000đ; vượt → quản lý xác thực lại (mở rộng theo vai ở D-24) | Ngưỡng khác |
| D-15 | Hoàn tiền sau thu: ADMIN (hoặc STAFF có người duyệt), bắt buộc lý do, tùy chọn hoàn kho | — |
| D-16 | Dữ liệu cá nhân (NĐ 13/2023): ô đồng ý + mục đích khi đăng ký; admin xem số bị che; có "ẩn danh theo yêu cầu" | — |
| D-17 | **Chia bill**: mỗi phần là một nhóm dòng món. Dòng chưa ai nhận thuộc phần "Chung"; phần Chung thu trước hoặc gộp vào phần cuối. Mỗi phần một `Payments`; phiên đóng khi mọi phần đã thu. Hội viên áp theo từng phần | Chia đều đầu người |
| D-18 | **ETA** = `base` (120 s) + Σ thời gian chuẩn của hàng chờ ÷ `parallelism` (1) + thời gian giỏ; hiển thị khoảng ±25 %. Thời gian chuẩn = trung vị 30 ngày (≥ 3 mẫu) hoặc admin nhập; mặc định 180 s | Chỉ số admin nhập |
| D-19 | **Bán thành phẩm** = `Ingredients.Kind='SEMI'` có công thức; lồng ≤ 3 cấp, cấm vòng. BOM món trỏ vào SEMI như nguyên liệu thường | Chỉ 1 cấp |
| D-20 | **Theo lô** tùy chọn theo nguyên liệu (`TrackLots`). Trừ kho theo FEFO; Σ lô = `StockQty`; lô hết hạn không tính vào khả dụng | Bắt buộc mọi nguyên liệu |
| D-21 | **Giá vốn** bình quân gia quyền (`AVG`); `FIFO` chỉ cho nguyên liệu theo lô. COGS dòng đơn chốt lúc **hoàn tất** | FIFO toàn bộ |
| D-22 | **Dự báo**: WMA 4 tuần cùng thứ (0,4 / 0,3 / 0,2 / 0,1) × (1 + hao hụt định mức); tồn an toàn 20 %; job 02:00 | 8 tuần |
| D-23 | **Sổ quỹ**: chi cần lý do + danh mục. Chi > 500.000đ hoặc danh mục "Khác" → chờ duyệt. Ảnh hóa đơn lưu `uploads/receipts/` (≤ 2 MB, jpg / png / webp) | Lưu cloud |
| D-24 | **MANAGER** = STAFF + giảm tay ≤ 20 % / 50.000đ, hoàn tiền trong ca, duyệt chi ≤ 2.000.000đ, mở / đóng ca, sửa chấm công trong ngày. **Không** vào báo cáo tài chính, lãi / lỗ, cấu hình giá / BOM, tài khoản | Ngưỡng khác |
| D-25 | **Chấm công** tự động theo đăng nhập / đăng xuất POS và đóng ca; sửa tay phải có lý do + audit | Mã PIN |
| D-26 | **Audit log** cho mọi endpoint đổi tiền / kho / quyền / giá; before / after JSON; giữ 12 tháng; ADMIN chỉ đọc | — |
| D-27 | **Tích điểm** 1 điểm / 10.000đ thực trả, làm tròn xuống, không hết hạn; đổi tại quầy lúc thu. **Tem**: đủ 10 tem → 1 món miễn phí | Tỷ lệ khác; hết hạn 12 tháng |
| D-28 | **Giới thiệu bạn**: nhập SĐT người giới thiệu lúc đăng ký. Lần thu đầu ≥ 30.000đ → cả hai nhận voucher 10 % / 30 ngày. Một SĐT chỉ được giới thiệu một lần, không tự giới thiệu | Thưởng điểm |
| D-29 | **Chiến dịch**: kênh `EXPORT` (CSV) và `ZALO_OA` (chỉ khi có token); SMS để sau. Tôn trọng `OptOut`; tối đa 1 tin / 7 ngày / hội viên | Thêm SMS |
| D-30 | **Menu engineering**: phân loại theo trung vị số lượng và trung vị lãi gộp / món (kỳ 30 ngày); bỏ món bán < 5 lần | Ngưỡng 70 % Kasavana–Smith |
| D-31 | **P&L** là ước tính: thuần − COGS − chi quỹ (danh mục chi phí) − cố định phân bổ / ngày; UI luôn ghi "ước tính" | — |
| D-32 | **Dashboard** `/admin/today` responsive, số liệu tính sẵn (job 00:30) + nút "Tính lại"; không push | Push Zalo |
| D-33 | **Sửa / xóa món đã gọi**: phân cấp quyền (đơn `PENDING` → mọi nhân viên; đã tiếp nhận / đã pha → MANAGER / ADMIN hoặc STAFF kèm tài khoản duyệt); **lý do luôn bắt buộc** (ADR-007) | — |
| D-34 | Bỏ món đã pha: người làm chọn **Ghi hủy hàng** (mặc định) hoặc **Hoàn kho**; không hoàn quá lượng đã trừ (ADR-007) | — |
| D-35 | "Xóa bàn" = **hủy lượt phục vụ**: hủy mọi đơn chưa thu, đóng phiên không tạo lượt thu; bàn vẫn còn (ADR-007) | — |
| D-36 | Gọi món tại bàn có ô SĐT: tra cứu → gắn vào bàn; số mới → đăng ký nhanh (bắt buộc đồng ý) (ADR-008) | — |
| D-37 | **Thẻ thành viên** trên điện thoại khách: chỉ khi SĐT đang gắn vào phiên còn mở; không lộ mã voucher (ADR-008) | — |
| D-38 | Bill thanh toán có hội viên in khối điểm / tem / voucher còn hạn, số liệu lấy lúc in (ADR-008) | — |

---

# 4. Thứ tự giai đoạn và phụ thuộc

| Giai đoạn | Feature theo thứ tự | Tiền đề |
| --- | --- | --- |
| **1 — Marketing (giai đoạn 2, phần 1)** | F-014 Hội viên → F-017 Gợi ý → F-015 Combo → F-016 Khuyến mãi → Admin "Marketing & Khách hàng" + báo cáo | Luồng lõi MVP |
| **2 — Vận hành quán** | F-013 Tùy chọn món → F-018 Chốt ca → F-022 Giảm giá tay → F-020 Tự hết món + công tắc nhận đơn → F-021 Gọi nhân viên | `pricing` |
| **3 — Kiểm soát kho / tiền** | F-019 Hoàn tiền → F-023 Nhập kho & kiểm kê | F-018 |
| (16/10) | F-024 Gọi món tại bàn + ghi chú bàn | F-013, F-014 |
| **4 — Khách & hội viên** | F-045 Gọi lại đơn / yêu thích → F-040 Thực đơn theo lịch → F-025 Thời gian chờ → F-026 Chia bill | F-014, F-013, F-020 |
| **5 — Kho nâng cao** | F-031 Đơn vị & giá vốn → F-027 Bán thành phẩm → F-032 Hao hụt → F-028 Lô & FEFO → F-030 Nhà cung cấp & PO → F-029 Dự báo nhập | F-023 |
| **6 — Tài chính & nhân sự** | F-036 Trưởng ca → F-033 Sổ quỹ → F-035 Chấm công / audit → F-034 Lãi / lỗ | F-018, F-031 |
| **7 — CRM** | F-039 Tích điểm & tem → F-038 Giới thiệu bạn → F-037 Chiến dịch | F-014, F-016 |
| **8 — Phân tích** | F-041 Menu engineering → F-042 Giờ cao điểm / dự báo / so sánh / theo bàn → F-043 Dashboard | F-031, F-033, F-034 |
| (18/10) | F-046 Sửa / xóa món, hủy bàn → F-047 Hội viên tại bàn, thẻ thành viên | F-024, F-039 |

Quy tắc chung:
- Mỗi feature = **một task, một migration, một PR**. Không gộp nhiều feature.
- Giai đoạn 5 phải làm đúng thứ tự (đơn vị / giá vốn trước, dự báo sau cùng).
- Bộ `pricing` tạo ở F-015, dùng lại ở F-014, F-016, F-022, rồi mở rộng ở F-026, F-038, F-039 (mục 6).

---

# 5. Đặc tả feature

Quy ước:
- Tên bảng / cột là **đề xuất**; map sang tên thật ở Bước 0.
- Tiền là VND `DECIMAL(12,0)`; số lượng kho `DECIMAL(18,3)`; thời gian lưu UTC, tính theo giờ quán (UTC+7).

Mẫu cho chức năng mới: **Hành vi → Dữ liệu → Quy tắc → SP → API → Realtime → UI → Kiểm**.

## 5.1. Giai đoạn 2 (ADR-005)

### F-014 — Hội viên (SĐT + họ tên, không bắt buộc)

**Hành vi**
- Điểm vào:
  - khách: ô "Nhập SĐT để nhận ưu đãi" trên màn giỏ và màn theo dõi đơn;
  - quầy: ô SĐT trên drawer Thu tiền bàn, màn Bán mang đi, chi tiết phiên.
- Chuẩn hóa SĐT: bỏ khoảng trắng / dấu; `0xxxxxxxxx` 10 số → lưu `+84xxxxxxxxx`. Sau đó tra cứu:
  - **Chưa có**: hiện ô Họ tên + checkbox đồng ý → tạo hội viên hạng Thành viên, gắn vào phiên / đơn, báo "Đơn đầu tiên giảm 10 %".
  - **Đã có**: hiện "Nguyễn V. A · Thân thiết · giảm 5 %" (tên che) → Xác nhận → gắn vào phiên (`Sessions.MemberId`) hoặc đơn mang đi (`Orders.MemberId`).
- Chiết khấu tính lúc **thu tiền** theo hạng tại thời điểm đó. Bill in dòng "Hội viên … − x%: −y đ".
- Sau thu tiền: ghi `MemberTransactions`, cộng `TotalSpent` (số thực trả), `VisitCount`, `LastVisitAt`. Vượt ngưỡng → nâng hạng; không tự hạ hạng.
- Gỡ hội viên khỏi phiên được trước khi thu tiền (khi nhập nhầm số).

**Bảo mật / quyền**
- Tra cứu public nhưng rate-limit 10 / phút / IP và 20 / phút / `clientToken`. Khách chỉ nhận tên che + hạng + %; quầy (JWT) nhận tên đầy đủ.
- Admin:
  - danh sách che số, tìm theo SĐT đầy đủ;
  - sửa tên / hạng / ghi chú;
  - "Ẩn danh theo yêu cầu" (xóa tên, SĐT → hash, giữ giao dịch).
- Không có API cho khách tự đổi hạng / điểm.

**Dữ liệu**
```sql
CREATE TABLE MemberTiers (
  TierCode VARCHAR(20) PRIMARY KEY, Name NVARCHAR(50) NOT NULL,
  MinSpent DECIMAL(12,0) NOT NULL, DiscountPercent DECIMAL(5,2) NOT NULL, SortOrder INT NOT NULL);
-- seed: MEMBER 0 3.00 | LOYAL 1000000 5.00 | VIP 3000000 8.00

CREATE TABLE Members (
  MemberId INT IDENTITY PRIMARY KEY,
  Phone VARCHAR(15) NOT NULL UNIQUE,            -- +84...
  FullName NVARCHAR(100) NOT NULL,
  TierCode VARCHAR(20) NOT NULL REFERENCES MemberTiers(TierCode),
  TotalSpent DECIMAL(12,0) NOT NULL DEFAULT 0, VisitCount INT NOT NULL DEFAULT 0, Points INT NOT NULL DEFAULT 0,
  FirstOrderDiscountUsed BIT NOT NULL DEFAULT 0,
  BirthDate DATE NULL, Note NVARCHAR(200) NULL,
  ConsentAt DATETIME2(0) NOT NULL, IsActive BIT NOT NULL DEFAULT 1,
  CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(), LastVisitAt DATETIME2(0) NULL);

ALTER TABLE Sessions ADD MemberId INT NULL REFERENCES Members(MemberId);
ALTER TABLE Orders   ADD MemberId INT NULL REFERENCES Members(MemberId);   -- mang đi
ALTER TABLE Payments ADD MemberId INT NULL REFERENCES Members(MemberId),
  SubtotalAmount DECIMAL(12,0) NULL, PromoDiscount DECIMAL(12,0) NOT NULL DEFAULT 0,
  MemberDiscount DECIMAL(12,0) NOT NULL DEFAULT 0, ManualDiscount DECIMAL(12,0) NOT NULL DEFAULT 0,
  RoundingAdj DECIMAL(12,0) NOT NULL DEFAULT 0;

CREATE TABLE MemberTransactions (
  TxnId BIGINT IDENTITY PRIMARY KEY, MemberId INT NOT NULL REFERENCES Members(MemberId),
  PaymentId INT NOT NULL REFERENCES Payments(PaymentId),
  SpentAmount DECIMAL(12,0) NOT NULL, DiscountAmount DECIMAL(12,0) NOT NULL,
  TierBefore VARCHAR(20) NOT NULL, TierAfter VARCHAR(20) NOT NULL,
  CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME());
```

**SP:** `sp_SettleSession` (và nhánh mang đi của `sp_SubmitOrder`) nhận thêm `@MemberId`, `@MemberDiscount`, `@ManualDiscount`, `@ManualReason`, `@ApprovedBy`.
- **Số giảm do service tính bằng `pricing`** rồi truyền vào.
- SP chỉ kiểm `AmountReceived ≥ AmountDue`, ghi lượt thu và cập nhật `Members` trong cùng transaction.

**API**

| Method & path | Ai | Ghi chú |
| --- | --- | --- |
| `POST /api/members/lookup { phone }` | khách / quầy | `{ found, member: { id, maskedName\|fullName, tier, discountPercent, firstOrderDiscount } }`; 400; 429 |
| `POST /api/members { phone, fullName, consent: true, referrerPhone? }` | khách / quầy | 201; 409 `PHONE_EXISTS` |
| `POST /api/sessions/{id}/member { memberId }` · `DELETE …/member` | khách (phiên mình) / quầy | gắn / gỡ |
| `POST /api/sessions/{id}/settle { amountReceived, memberId?, manualDiscount?, manualReason?, voucherCode?, rewards? }` | quầy | trả `breakdown` |
| `POST /api/orders/takeaway { items, amountReceived, memberId?, … }` | quầy | |
| `GET /api/admin/members?q=&page=` · `GET/PUT /api/admin/members/{id}` · `POST …/{id}/anonymize` · `GET/PUT /api/admin/member-tiers` | admin | |

**Kiểm**
- Đăng ký mới → đơn đầu −10 %; lần 2 → tên che đúng, −3 %.
- Vượt 1.000.000đ lũy kế → lên Thân thiết ở lần sau.
- Số sai → 400; 11 lần tra cứu / phút → 429.
- Bill có dòng hội viên.
- Anonymize xong không còn tên / SĐT, `Payments` vẫn đủ.
- Khách gọi API admin → 401 / 403.

### F-015 — Combo cố định

**Hành vi**
- Combo = tên, ảnh, giá combo, danh sách (món, số lượng). Hiển thị "Tiết kiệm z đ" = Σ giá lẻ − giá combo.
- Thêm combo như một món. Kiểm kho / trừ kho theo BOM **thành phần**.
- Bill in dòng combo + các dòng con thụt vào, giá 0.

**Dữ liệu**
```sql
ALTER TABLE MenuItems ADD ItemType VARCHAR(10) NOT NULL DEFAULT 'SINGLE' CHECK (ItemType IN ('SINGLE','COMBO'));
CREATE TABLE ComboComponents (
  ComboMenuItemId INT NOT NULL REFERENCES MenuItems(MenuItemId),
  ComponentMenuItemId INT NOT NULL REFERENCES MenuItems(MenuItemId),
  Quantity INT NOT NULL CHECK (Quantity > 0),
  PRIMARY KEY (ComboMenuItemId, ComponentMenuItemId));
ALTER TABLE OrderItems ADD ParentOrderItemId INT NULL REFERENCES OrderItems(OrderItemId),
  ListPrice DECIMAL(12,0) NULL;              -- giá niêm yết lúc đặt; UnitPrice = giá sau KM dòng
```

**SP:** trong `sp_SubmitOrder`, mỗi dòng combo tạo:
- 1 dòng cha (`UnitPrice` = giá combo);
- N dòng con (`ParentOrderItemId`, `UnitPrice = 0`, `Quantity = qty_combo × qty_thành_phần`).

Nhu cầu nguyên liệu chỉ join BOM của dòng `SINGLE`. Kiểm `IsAvailable` mọi thành phần. Cấm combo lồng combo. Món đang là thành phần combo thì không xóa được.

**API**
- `GET/POST /api/admin/combos`, `PUT /api/admin/combos/{id}` (thay toàn bộ thành phần), `PATCH …/availability`.
- `GET /api/menu` trả `combos[]` kèm `components[]`, `savings`.

**Kiểm**
- Combo 2 thành phần → đơn 3 dòng, tổng = giá combo.
- Hoàn tất → trừ kho đúng Σ BOM thành phần.
- Một thành phần hết → combo hết.
- Đổi giá lẻ → `savings` đổi, đơn cũ không đổi.

### F-016 — Khuyến mãi

**Dữ liệu**
```sql
CREATE TABLE Promotions (
  PromotionId INT IDENTITY PRIMARY KEY, Name NVARCHAR(100) NOT NULL,
  Type VARCHAR(20) NOT NULL CHECK (Type IN ('ITEM_PRICE','ORDER_PERCENT','ORDER_AMOUNT')),
  Value DECIMAL(12,2) NOT NULL,
  MinOrderAmount DECIMAL(12,0) NOT NULL DEFAULT 0,
  StartDate DATE NOT NULL, EndDate DATE NOT NULL,
  DaysOfWeekMask TINYINT NOT NULL DEFAULT 127,  -- bit0=CN … bit6=T7
  StartTime TIME NULL, EndTime TIME NULL,       -- NULL = cả ngày (giờ quán)
  MaxUsesPerDay INT NULL, StackWithMember BIT NOT NULL DEFAULT 0,
  BadgeText NVARCHAR(30) NULL, IsActive BIT NOT NULL DEFAULT 1, SortOrder INT NOT NULL DEFAULT 0);
CREATE TABLE PromotionTargets (PromotionId INT REFERENCES Promotions(PromotionId),
  MenuItemId INT NULL REFERENCES MenuItems(MenuItemId), CategoryId INT NULL REFERENCES Categories(CategoryId),
  CHECK ((MenuItemId IS NULL) <> (CategoryId IS NULL)));
CREATE TABLE PromotionUsages (UsageId BIGINT IDENTITY PRIMARY KEY, PromotionId INT NOT NULL, OrderId INT NOT NULL,
  OrderItemId INT NULL, DiscountAmount DECIMAL(12,0) NOT NULL, UsedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME());
ALTER TABLE OrderItems ADD PromotionId INT NULL, LineDiscount DECIMAL(12,0) NOT NULL DEFAULT 0, AllowMemberStack BIT NOT NULL DEFAULT 1;
ALTER TABLE Orders ADD SubtotalAmount DECIMAL(12,0) NULL, PromoDiscount DECIMAL(12,0) NOT NULL DEFAULT 0, OrderPromotionId INT NULL;
```

**Quy tắc** (BR-022, BR-023)
- Một dòng nhận tối đa **một** KM dòng (giá thấp nhất thắng); combo không nhận `ITEM_PRICE`.
- `ORDER_*` áp khi subtotal sau KM dòng ≥ `MinOrderAmount`. Mỗi đơn tối đa **một** KM đơn (giảm nhiều nhất thắng).
- `MaxUsesPerDay` đếm `PromotionUsages` theo ngày quán, chống tranh lượt đồng thời.
- KM khóa lúc gửi đơn. Thu tiền cộng các đơn đã khóa, không tính lại.

**API**
- `GET/POST/PUT /api/admin/promotions`, `PATCH …/active`, `GET …/{id}/stats`.
- `GET /api/menu` trả `promotions[]` và mỗi món có `listPrice`, `price`, `promotionBadge`.
- `POST /api/orders` trả `breakdown`.

**Kiểm**
- Happy hour 14–17h: lúc 15h giá 25k, lúc 17h01 về 35k.
- 2 KM cùng món → lấy giá thấp nhất.
- `MaxUsesPerDay=1` → lượt 2 không được giảm.
- `StackWithMember=0` → dòng đó không nhận chiết khấu hội viên.

### F-017 — Gợi ý / bán chạy / ghim

**Dữ liệu**
- `MenuItems` thêm: `IsPinned`, `PinLabel`, `PinOrder`, `HideFromSuggestions`.
- `Settings(Key, Value)`: `suggestion.mode = AUTO|PINNED|BOTH`, `suggestion.window_days = 7`, `suggestion.top_n = 8`.

**Tính**
- Σ `Quantity` của đơn `PAID` trong N ngày (dòng SINGLE không phải con combo + dòng combo); cache 15 phút (job `refresh-caches`).
- `suggested[]` = ghim (theo `PinOrder`) + top auto chưa ghim; bỏ món `HideFromSuggestions` và món hết; lọc theo lịch thực đơn (F-040).

**Admin:** kéo thả thứ tự ghim, đặt nhãn, ẩn khỏi gợi ý, chọn mode, xem top 20 thực tế.

**Kiểm**
- Top đúng thứ tự.
- Ghim → đứng trước.
- Mode PINNED → không có món auto.
- Món hết → không xuất hiện.

**Admin "Marketing & Khách hàng" + báo cáo** (đi cùng giai đoạn 1)
- Nhóm menu admin: Hội viên · Hạng · Combo · Khuyến mãi · Gợi ý & ghim.
- Báo cáo: hội viên mới / ngày; doanh thu hội viên vs khách lẻ; tỷ lệ quay lại 30 ngày; tổng giảm theo loại; top khuyến mãi.

### F-013 — Tùy chọn món (modifier)

**Dữ liệu**
```sql
CREATE TABLE ModifierGroups (GroupId INT IDENTITY PRIMARY KEY, Name NVARCHAR(50) NOT NULL,
  MinSelect INT NOT NULL DEFAULT 0, MaxSelect INT NOT NULL DEFAULT 1, SortOrder INT NOT NULL DEFAULT 0);
CREATE TABLE ModifierOptions (OptionId INT IDENTITY PRIMARY KEY, GroupId INT NOT NULL REFERENCES ModifierGroups(GroupId),
  Name NVARCHAR(50) NOT NULL, PriceDelta DECIMAL(12,0) NOT NULL DEFAULT 0, IsDefault BIT NOT NULL DEFAULT 0,
  IsActive BIT NOT NULL DEFAULT 1, SortOrder INT NOT NULL DEFAULT 0);
CREATE TABLE ModifierOptionBom (OptionId INT NOT NULL REFERENCES ModifierOptions(OptionId),
  IngredientId INT NOT NULL REFERENCES Ingredients(IngredientId), Amount DECIMAL(18,3) NOT NULL CHECK (Amount > 0),
  PRIMARY KEY (OptionId, IngredientId));
CREATE TABLE MenuItemModifierGroups (MenuItemId INT NOT NULL, GroupId INT NOT NULL, PRIMARY KEY (MenuItemId, GroupId));
CREATE TABLE OrderItemModifiers (OrderItemId INT NOT NULL REFERENCES OrderItems(OrderItemId),
  OptionId INT NOT NULL, OptionName NVARCHAR(50) NOT NULL, PriceDelta DECIMAL(12,0) NOT NULL, PRIMARY KEY (OrderItemId, OptionId));
```

**Quy tắc**
- TVP `OrderItemInput` thêm danh sách tùy chọn.
- Nhu cầu nguyên liệu = Σ qty × (BOM món + `ModifierOptionBom` của các tùy chọn đã chọn).
- `UnitPrice` = giá món (sau KM) + Σ `PriceDelta`. Ghi chú tự do giữ nguyên.

**UI**
- Khách: sheet chọn tùy chọn (radio / checkbox theo Min / Max); dòng giỏ hiện "Size M, Ít đường"; bill / phiếu pha in tùy chọn.
- Admin: trang Nhóm tùy chọn + gán nhóm cho món.

**Kiểm**
- Size M +5k → tổng đúng; BOM size M trừ thêm.
- Không chọn nhóm `MinSelect=1` → 400.
- Sửa giá tùy chọn không đổi đơn cũ.

### F-018 — Chốt ca (mở / đóng ca tiền mặt)

**Dữ liệu**
- `Shifts(ShiftId, OpenedBy, OpenedAt, OpeningCash, ClosedBy, ClosedAt, ExpectedCash, CountedCash, Difference, Note)`.
- `Payments.ShiftId`, `Refunds.ShiftId`.

**Quy tắc** (BR-026)
- Phải có ca mở mới thu tiền được (→ 409 `NO_OPEN_SHIFT`).
- Chỉ một ca mở (unique filtered index `ClosedAt IS NULL`).
- `ExpectedCash = OpeningCash + Σ thu − Σ hoàn` (+ sổ quỹ ở F-033).
- In phiếu chốt ca. Ca đã đóng thì không sửa.

**API:** `GET /api/shifts/current`, `POST /api/shifts/open`, `POST /api/shifts/{id}/close`, `GET /api/shifts/{id}/report`, `GET /api/admin/shifts`.

**UI:** POS có nút "⚠ Chưa mở ca", màn Mở / Đóng ca. Admin xem lịch sử ca và chênh lệch.

**Kiểm**
- Thu tiền khi chưa mở ca → 409; mở ca 2 lần → 409.
- `ExpectedCash` khớp Σ; chênh lệch âm hiển thị đỏ.

### F-019 — Hoàn tiền sau khi đã thu

**Dữ liệu**
- `Refunds(RefundId, PaymentId, Amount, Reason NOT NULL, RestockInventory, ApprovedBy, CreatedBy, ShiftId, CreatedAt)`.
- `Orders.Status` thêm `VOIDED`; `InventoryTransactions.Type` thêm `RESTOCK`.

**Quy tắc** (BR-028, BR-046)
- Chỉ trong ngày thu; bắt buộc lý do; Σ hoàn ≤ đã thu (2 lần hoàn đồng thời → 1 thành công).
- Đơn bị hoàn → `VOIDED`. Đơn chưa làm → trả phần giữ kho.
- Hoàn kho món đã làm theo đúng lượng đã trừ, mỗi đơn × nguyên liệu tối đa một lần. Không hoàn lại phần đã `VOID_BACK` / ghi hủy ở F-046.

**API:** `POST /api/payments/{id}/refunds { amount, reason, restockInventory, orderIds?, adminUsername?, adminPassword? }`, `GET /api/admin/refunds`.

**Kiểm**
- Hoàn toàn bộ → đơn `VOIDED`, doanh thu giảm.
- Hoàn vượt → 400 / 409; thiếu người duyệt → 403.
- Có restock → kho tăng đúng, có dòng `RESTOCK`.

### F-020 — Tự "hết món", công tắc nhận đơn, giờ bán

- **Tự hết món:** sau mỗi lần kho đổi, khả dụng < 1 suất → `IsAvailable = 0`, `AutoSoldOut = 1`; đủ lại → bật lại. Phát `menu.availability_changed`. Admin tắt tay (`AutoSoldOut = 0`) thì không bị bật tự động.
- **Công tắc nhận đơn:** `Settings` `store.accepting_orders`, `store.closed_message`. Khi tắt, khách gửi đơn → 503 `STORE_CLOSED`, nhưng quầy vẫn bán mang đi.
- **Giờ bán theo danh mục:** `Categories.SellFrom / SellTo`. Từ F-040 được đồng bộ thành lịch SHOW "Giờ bán — …".

### F-021 — Gọi nhân viên

- **Dữ liệu:** `StaffCalls(CallId, SessionId, Type, Message, RequestedAt, HandledBy, HandledAt)`.
- **Khách:** chọn nhanh (Xin nước / Thêm đá / Khác + ghi chú); chống spam 60 s / phiên.
- **POS:** dải thông báo riêng với âm thanh thứ ba, nút "Đã xử lý".
- **API:** `POST /api/sessions/{id}/call-staff`, `POST /api/staff-calls/{id}/handle`.
- **Realtime:** `session.staff_called`, `session.staff_call_handled`.

### F-022 — Giảm giá tay trên bill

- `manualDiscount` (tiền hoặc %) + `manualReason` bắt buộc, dùng trên `settle` / `takeaway` / thu từng phần.
- Ngưỡng ở `Settings`; vượt ngưỡng phải gửi `adminUsername` / `adminPassword` (xác thực lại, không dùng token người đứng quầy) → lưu `ApprovedBy`. Ngưỡng theo vai: BR-045.
- Ghi `Payments.ManualDiscount`, `ManualReason`, `ApprovedBy`. Báo cáo giảm tay theo nhân viên / ngày.

### F-023 — Nhập kho & kiểm kê

- **Phiếu nhập:** `StockReceipts` + `StockReceiptLines` → mỗi dòng tạo `InventoryTransactions(IMPORT)` trong một transaction; cập nhật giá vốn (F-031).
- **Kiểm kê:** `Stocktakes(DRAFT|POSTED)` + `StocktakeLines(SystemQty, CountedQty, Diff)` → khi POST, tạo `ADJUST` cho từng chênh lệch.
- **Quy tắc:**
  - kiểm kê DRAFT khóa điều chỉnh tay các nguyên liệu trong phiếu (`STOCKTAKE_LOCKED`);
  - không POST làm `StockQty < ReservedQty`.
- **Báo cáo:** hao hụt kỳ; giá vốn / lợi nhuận gộp theo món.

### F-024 — Gọi món tại bàn (nhân viên nhập giúp) + ghi chú bàn

- **Quy tắc** (BR-031, Q-021):
  - đơn `DINE_IN` do nhân viên tạo vào thẳng `PREPARING` (ghi `CreatedBy`), giữ kho lúc gửi như đơn QR;
  - không bị chặn bởi công tắc nhận đơn / giờ bán;
  - mở bàn đang có nhóm phải chọn rõ "Nhóm mới", có khóa dòng bàn: 2 máy cùng mở → 1 phiên, máy kia nhận `409 TABLE_OCCUPIED`.
- **Ghi chú bàn** (BR-032): gắn với phiên, ≤ 200 ký tự, **chỉ nhân viên thấy** — không trả trong API khách, không phát vào room phiên, không in bill. Phiên đã đóng thì không sửa được.
- **Trang:** `/pos/table-order`.

## 5.2. Giai đoạn 4 — Khách & hội viên (ADR-006)

### F-045 (skill F-024) — Gọi lại đơn lần trước & món yêu thích

**Hành vi**
- Sau khi tra cứu SĐT, hiện thẻ "Lần trước bạn gọi: … — Gọi lại?" và dải "Món yêu thích" (món ♥ + top 5 món mua nhiều nhất).
- "Gọi lại" nạp giỏ **sau khi kiểm từng dòng**: món còn bán, tùy chọn còn hợp lệ, theo thực đơn người xem đang thấy. Giá lấy **hiện tại**. Dòng không qua kiểm → `skipped[]` kèm lý do.

**Dữ liệu:** `MemberFavorites(MemberId, MenuItemId, CreatedAt)`. "Lần trước" lấy bằng query `Orders` / `OrderItems` / `OrderItemModifiers` đã thu.

**API:** `GET /api/members/{id}/recent-orders?limit=3`, `GET /api/members/{id}/favorites`, `PUT/DELETE /api/members/{id}/favorites/{menuItemId}`, `POST /api/cart/replay { orderId }` → `{ items[], skipped[] }`.

**Quyền** (BR-033): khách chỉ dùng được cho hội viên đang gắn vào phiên chưa đóng của chính điện thoại đó (khác → 403); quầy (JWT) dùng được mọi hội viên.

**Kiểm**
- Đơn cũ có món hết → giỏ thiếu món đó + thông báo.
- Giá đổi → giỏ dùng giá mới.
- `memberId` lạ → 403.
- ♥ được lưu.

### F-040 — Thực đơn theo mùa / khung giờ

**Dữ liệu**
- `MenuSchedules(ScheduleId, Name, StartDate, EndDate, DaysOfWeekMask, StartTime, EndTime, IsActive)`.
- `MenuScheduleItems(ScheduleId, MenuItemId | CategoryId, Mode SHOW|HIDE)`.

**Quy tắc** (BR-034)
- Món hiện với khách khi: (không thuộc lịch SHOW nào đang bật **hoặc** thuộc ≥ 1 lịch SHOW đang hiệu lực) **và** không thuộc lịch HIDE đang hiệu lực.
- Khung `[bắt đầu, kết thúc)` được phép qua nửa đêm.
- Quầy vẫn bán được món ngoài lịch (nhãn "Ngoài lịch"). Khách gửi đơn ngoài lịch → `409 ITEM_UNAVAILABLE`.

**API:** `GET/POST/PUT /api/admin/menu-schedules`, `PATCH …/active`. `GET /api/menu` trả `nextChangeAt` để FE tự tải lại menu đúng mốc. Realtime `menu.updated`.

**Kiểm**
- 06:00 thấy bánh mì, 11:00 không.
- Ngoài khoảng ngày → ẩn.
- Món vừa SHOW vừa HIDE → ẩn.

### F-025 — Thời gian chờ ước tính

**Dữ liệu**
- `MenuItems.PrepSeconds`.
- `Settings`: `kitchen.base_seconds = 120`, `kitchen.parallelism = 1`, `eta.spread_percent = 25`.
- `ItemPrepStats(MenuItemId, MedianSeconds, SampleCount, ComputedAt)`: job 02:00 tính từ `AcceptedAt → CompletedAt`.

**Quy tắc** (BR-035): ETA = base + Σ thời gian chuẩn hàng chờ (`PENDING` / `PREPARING`, combo tính theo thành phần) ÷ parallelism + Σ giỏ. Hiển thị `[⌊ETA×0,75⌋, ⌈ETA×1,25⌉]` phút.

**API:** `GET /api/queue/eta?items=<id:qty,…>` → `{ minMinutes, maxMinutes, queueLength }` (cache 10 s).

**UI**
- Khách: "Dự kiến khoảng 8–12 phút" ở giỏ và màn theo dõi.
- POS: cột Mới hiện "Hàng chờ: 6 món · ~9 phút".
- Admin: sửa `PrepSeconds`.

**Kiểm**
- Hàng chờ trống → ETA = base + giỏ.
- `parallelism = 2` → phần hàng chờ giảm ½.
- Món chưa có thống kê → 180 s.

### F-026 — Chia bill theo người trong phiên gộp

**Hành vi**
- Màn theo dõi đơn của phiên gộp có nút "Chia bill". Mỗi điện thoại chọn các dòng món của mình; dòng chưa ai nhận thuộc phần "Chung".
- Quầy thu **từng phần**: mỗi phần có thể gắn hội viên / voucher / giảm tay riêng và in bill riêng.
- Phần cuối còn mở tự gộp dòng Chung; hết dòng chưa thu → phiên `CLOSED`.
- "Thu chung":
  - chưa thu phần nào → bỏ chia, thu cả bàn như cũ;
  - đã thu ≥ 1 phần → dồn các phần còn mở về Chung.

**Dữ liệu**
```sql
CREATE TABLE SessionSplits (SplitId INT IDENTITY PRIMARY KEY, SessionId UNIQUEIDENTIFIER NOT NULL REFERENCES Sessions(SessionId),
  Label NVARCHAR(50) NOT NULL, ClientToken CHAR(32) NULL, MemberId INT NULL, IsCommon BIT NOT NULL DEFAULT 0,
  Status VARCHAR(10) NOT NULL DEFAULT 'OPEN' CHECK (Status IN ('OPEN','PAID')), PaymentId INT NULL);
ALTER TABLE OrderItems ADD SplitId INT NULL REFERENCES SessionSplits(SplitId), PaidAt DATETIME2(0) NULL;  -- NULL = Chung
ALTER TABLE Payments ADD SplitId INT NULL REFERENCES SessionSplits(SplitId);
-- unique: UX_Payments_Split (SplitId) WHERE SplitId IS NOT NULL; UX_Payments_Session chỉ cho phiên không chia
```

**SP:** `sp_SettleSplit`
- Khóa phiên; tổng phần = Σ dòng của phần (+ dòng Chung nếu là phần cuối).
- Ghi `Payments(SplitId)`, đánh dấu dòng đã trả, gọi `sp_ApplyLoyalty`.
- Mọi phần đã thu → `CLOSED`.
- `sp_SettleSession` cũ = trường hợp phiên không chia.

**Quy tắc** (BR-036, BR-037)
- Khách chỉ gán / bỏ dòng Chung hoặc dòng của phần mình (khác → 403 / `409 LINE_LOCKED`).
- KM đơn **phân bổ theo dòng**. Hội viên / voucher / giảm tay chỉ áp cho phần đang thu.
- Thu cả bàn khi đã chia → `409 SESSION_HAS_SPLITS`.

**API:** `POST /api/sessions/{id}/splits`, `PUT /api/sessions/{id}/items/{orderItemId}/split`, `GET /api/sessions/{id}/splits`, `POST /api/splits/{id}/settle`, `POST /api/sessions/{id}/splits/merge`.

**Realtime:** `session.split_changed`. Thu phần cuối thì phát `session.settled`.

**Kiểm**
- 2 khách × 2 dòng → 2 phần, tổng đúng.
- Thu phần A → phiên vẫn mở; thu phần B → `CLOSED`.
- Hội viên chỉ áp cho phần của mình.
- Thu đồng thời cùng một phần → 1 OK, 1 `409`.

## 5.3. Giai đoạn 5 — Kho nâng cao

### F-031 — Đơn vị & giá vốn bình quân / FIFO

**Dữ liệu**
- `Units(UnitCode, Name, BaseUnitCode, Factor)` (ví dụ `thung → lon ×24`, `lon → ml ×330`).
- `Ingredients` thêm `BaseUnitCode`, `AvgCost`, `LastCost`.
- `StockReceiptLines` thêm `UnitCode`, `PackQty`.
- `InventoryTransactions` thêm `UnitCost`, `CostAmount`.
- `OrderItems.CogsAmount`; `Settings` `cost.method = AVG`.

**Quy tắc** (BR-038)
- Tồn / BOM / kiểm kê luôn theo đơn vị gốc. Không quy đổi được → `400 UNIT_MISMATCH`; chuỗi đơn vị không được vòng.
- `AvgCost = (tồn × AvgCost + nhập × giá) / (tồn + nhập)`. Tồn ≤ 0 hoặc chưa có giá → lấy giá nhập.
- Hoàn tất đơn → `CogsAmount` = Σ nhu cầu × AvgCost (hoặc FIFO theo lô), ghi `CostAmount` lên `DEDUCT` trong cùng transaction.
- Giá đổi sau đó không tính lại đơn cũ.

**API:** `GET /api/admin/reports/cogs?from&to`.

**Kiểm**
- 1 thùng = 24 lon × 330 ml → tồn +7.920 ml.
- AvgCost đúng sau 2 lần nhập giá khác nhau.
- Bất biến `COGS_MISMATCH` (Σ COGS dòng = Σ `CostAmount` DEDUCT).

### F-027 — Bán thành phẩm / BOM 2 cấp / phiếu sơ chế

**Dữ liệu**
```sql
ALTER TABLE Ingredients ADD Kind VARCHAR(5) NOT NULL DEFAULT 'RAW' CHECK (Kind IN ('RAW','SEMI')), ShelfLifeHours INT NULL;
CREATE TABLE SemiRecipes (SemiIngredientId INT PRIMARY KEY REFERENCES Ingredients(IngredientId),
  OutputQty DECIMAL(18,3) NOT NULL CHECK (OutputQty > 0), Instructions NVARCHAR(500) NULL);
CREATE TABLE SemiRecipeLines (SemiIngredientId INT NOT NULL REFERENCES SemiRecipes(SemiIngredientId),
  InputIngredientId INT NOT NULL REFERENCES Ingredients(IngredientId), Qty DECIMAL(18,3) NOT NULL CHECK (Qty > 0),
  PRIMARY KEY (SemiIngredientId, InputIngredientId));
CREATE TABLE PrepBatches (BatchId INT IDENTITY PRIMARY KEY, SemiIngredientId INT NOT NULL, Multiplier DECIMAL(9,3) NOT NULL DEFAULT 1,
  OutputQty DECIMAL(18,3) NOT NULL, UnitCost DECIMAL(18,2) NOT NULL, PreparedBy INT NOT NULL,
  PreparedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(), ExpiresAt DATETIME2(0) NULL, Note NVARCHAR(200) NULL);
-- InventoryTransactions.Type thêm 'PREP_OUT', 'PREP_IN'
```

**SP:** `sp_PostPrepBatch` (một transaction)
1. Khóa đầu vào `UPDLOCK, HOLDLOCK`.
2. Kiểm khả dụng (tồn − giữ − lô hết hạn). Thiếu → `409 PREP_SHORT`, không đổi gì.
3. Trừ đầu vào (`PREP_OUT`), cộng đầu ra (`PREP_IN`); Σ giá trị hai phía bằng nhau.
4. Cập nhật `AvgCost` của SEMI. Nếu theo lô → tạo lô với hạn `now + ShelfLifeHours`.

Khi lưu công thức: kiểm vòng / độ sâu → `400 RECIPE_CYCLE` / `RECIPE_TOO_DEEP`.

**Hành vi:** BOM món trỏ vào SEMI như nguyên liệu thường. Màn "Sơ chế" ở POS / admin.

**Kiểm**
- 100 g hạt + 1.000 ml nước → 900 ml cốt; pha ×2 → hạt −200, nước −2.000, cốt +1.800.
- Thiếu hạt → 409.
- A dùng B dùng A → 400.

### F-032 — Hao hụt định mức & phiếu hủy hàng

**Dữ liệu**
- `Ingredients.WastePercent`.
- `WasteLogs(WasteId, IngredientId, Qty, Reason SPILL|EXPIRED|QUALITY|OTHER, Note, CreatedBy, CreatedAt)` → mỗi phiếu tạo `ADJUST` "WASTE:…" có giá vốn.

**Quy tắc** (BR-040)
- Không hủy vào phần đang giữ (`409 BELOW_RESERVED`).
- Thất thoát bất thường = hụt kiểm kê − định mức (≥ 0); tô đỏ khi > 0 **và** > 2 % tiêu thụ.
- Dự báo (F-029) nhân `(1 + WastePercent)`.

**Kiểm**
- Định mức 5 %, tiêu thụ 1.000 ml: thiếu 40 ml → bình thường.
- Thiếu 120 ml → thất thoát 70 ml.

### F-028 — Lô & hạn sử dụng (FEFO)

**Dữ liệu**
```sql
ALTER TABLE Ingredients ADD TrackLots BIT NOT NULL DEFAULT 0;
CREATE TABLE IngredientLots (LotId INT IDENTITY PRIMARY KEY, IngredientId INT NOT NULL, LotCode NVARCHAR(30) NULL,
  Qty DECIMAL(18,3) NOT NULL CHECK (Qty >= 0), ExpiryDate DATE NULL, UnitCost DECIMAL(18,2) NOT NULL,
  Source VARCHAR(10) NOT NULL, SourceId INT NULL,
  ReceivedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(), IsClosed BIT NOT NULL DEFAULT 0);
CREATE INDEX IX_Lots_FEFO ON IngredientLots (IngredientId, IsClosed, ExpiryDate, ReceivedAt);
ALTER TABLE InventoryTransactions ADD LotId INT NULL;
```

**Quy tắc** (BR-041)
- Σ `Qty` lô mở = `StockQty` (bất biến `LOTS_MISMATCH`).
- Trừ kho theo FEFO: lô còn hạn hết hạn sớm trước → lô không hạn → lô đã hết hạn. Một lần trừ có thể tách thành nhiều dòng `DEDUCT` (dùng `sp_LotConsume`).
- Lô hết hạn **không tính vào khả dụng**.
- Bật theo lô: tồn hiện có thành lô "Tồn đầu". Tắt: đóng mọi lô (`sp_SetTrackLots`).
- Điều chỉnh giảm → trừ FEFO; điều chỉnh tăng → tạo lô `ADJUST`.
- Job 06:00 phát `inventory.expiring` / `inventory.expired`. "Hủy lô hết hạn" → `WasteLogs(EXPIRED)` + đóng lô.

**API:** `GET /api/admin/ingredients/{id}/lots`, `POST …/lots/{id}/write-off`.

**Kiểm**
- 2 lô sữa hạn +3 và +8 ngày, hủy 300 ml → trừ lô +3 trước; phần dư chuyển sang lô +8.
- Σ lô = tồn sau 40 thao tác ngẫu nhiên.

### F-030 — Nhà cung cấp & đơn đặt hàng (PO)

**Dữ liệu**
- `Suppliers(…, LeadTimeDays, DeliveryDaysMask, IsActive)`.
- `SupplierIngredients(SupplierId, IngredientId, PackUnitCode, PackSize, LastPrice, IsPreferred)`.
- `PurchaseOrders(PoId, SupplierId, Status DRAFT|SENT|PARTIAL|RECEIVED|CANCELLED, ExpectedDate, …)`.
- `PurchaseOrderLines(…, OrderedBaseQty, ReceivedBaseQty, UnitPrice)`.
- `SupplierPriceHistory`; `StockReceipts.PoId`.

**Quy tắc** (BR-042)
- Chỉ sửa / gửi khi `DRAFT`; chỉ nhận hàng khi `SENT` / `PARTIAL`.
- Nhận hàng = cộng tồn + giá vốn + lô + lịch sử giá trong một transaction.
- Nhận vượt → `409 OVER_RECEIPT`, trừ khi người dùng xác nhận.
- PO đã nhận một phần / đủ thì không hủy được (`409 PO_HAS_RECEIPTS`).
- Mỗi nguyên liệu tối đa 1 nhà cung cấp ưu tiên.
- "Gửi" PO = in / PDF / chép nội dung gửi Zalo; không tích hợp EDI.

**Kiểm:** PO 10 gói, nhận 6 → `PARTIAL`; nhận thêm 4 → `RECEIVED`.

### F-029 — Dự báo nhập hàng

**Dữ liệu:** `DemandForecasts(IngredientId, ForecastDate, ForecastQty, ComputedAt)`. Job 02:00 dự báo 14 ngày tới (D-22); bỏ ngày đóng cửa (ngày không có lượt thu).

**Quy tắc** (BR-043): đề xuất = max(0, nhu cầu đến ngày giao + an toàn 20 % − khả dụng − đang về), làm tròn **lên** theo gói. Chưa có lịch sử → "Không đủ dữ liệu".

**API:** `GET /api/admin/inventory/replenishment?nextDeliveryDate=&supplierId=`, `POST /api/admin/purchase-orders/from-suggestion`. Job `runout-alert` 06:05 phát `inventory.runout`.

**Kiểm**
- Tồn 1.000, nhu cầu 3 ngày 1.500 → đề xuất ≥ 500 + an toàn.
- Có 800 đang về → đề xuất giảm 800.

## 5.4. Giai đoạn 6 — Tài chính & nhân sự

### F-036 — Vai Trưởng ca (MANAGER) & ma trận quyền

**Dữ liệu**
- `Users.Role` thêm `MANAGER`.
- `Settings`: `manager.discount_max_percent = 20`, `manager.discount_max_amount = 50000`, `manager.refund_same_shift_only = 1`, `manager.cash_out_approve_max = 2000000`, `cash.approve_threshold = 500000`.

**Ma trận** (server kiểm qua `src/auth/permissions.js` — `PERMISSIONS`, `can`, `requirePermission`; FE chỉ ẩn / hiện)

| Quyền | STAFF | MANAGER | ADMIN |
| --- | --- | --- | --- |
| `pos.use` — bán, tiếp nhận, hoàn tất, thu tiền, mang đi, in, hội viên / voucher ở quầy, sửa / xóa món | ✔ | ✔ | ✔ |
| `shift.manage` — mở / đóng ca | ✔ (lệch D-24, Q-022) | ✔ | ✔ |
| `cash.create` — ghi thu / chi quỹ | ✔ (khoản lớn chờ duyệt) | ✔ | ✔ |
| `cash.approve` | ✘ | ≤ 2.000.000đ | ✔ |
| `attendance.edit` | ✘ | hôm nay | ✔ |
| `prep.post`, `waste.create`, `po.receive` | ✔ | ✔ | ✔ |
| `inventory.adjust`, `stocktake.post` (qua `/api/ops/*`) | ✘ | ✔ | ✔ |
| `dashboard.view` | ✘ | rút gọn | ✔ |
| `admin.all` — `/api/admin/*` | ✘ | ✘ | ✔ |

**Ngưỡng theo vai:** giảm tay BR-045; hoàn tiền BR-046.

**Kiểm**
- Test ma trận actor × endpoint sinh từ `PERMISSIONS`.
- Hạ / khóa / xóa ADMIN cuối → `409 LAST_ADMIN` (kiểm nguyên tử; hai người hạ quyền nhau cùng lúc → đúng một người thành công).

### F-033 — Sổ quỹ (thu / chi tiền mặt ngoài bán hàng)

**Dữ liệu**
- `CashCategories(CategoryId, Name, Direction IN|OUT, IsExpense, IsActive)`.
- `CashTransactions(CashTxnId, ShiftId NOT NULL, CategoryId, Direction, Amount, Reason NOT NULL, ReceiptImagePath, CreatedBy, ApprovedBy, Status PENDING|APPROVED|REJECTED, CreatedAt)`.

**Quy tắc** (BR-048…BR-051)
- Phải có ca mở.
- Chi > 500.000đ hoặc danh mục cần duyệt → `PENDING`; khoản thu luôn duyệt ngay.
- Không tự duyệt khoản mình tạo (`403 SELF_APPROVAL`), trừ ADMIN.
- `ExpectedCash = OpeningCash + Σ thu bán − Σ hoàn + Σ thu khác − Σ chi đã duyệt`. Ca còn khoản `PENDING` → `409 CASH_PENDING`.
- Ảnh ≤ 2 MB; server kiểm chữ ký file; xem ảnh qua API có đăng nhập.

**API:** `POST /api/cash-transactions` (multipart), `GET /api/cash-transactions?shiftId`, `POST /api/cash-transactions/{id}/approve|reject`, `GET /api/cash-transactions/{id}/receipt`.

**Realtime:** `cash.created`, `cash.reviewed`.

**Kiểm**
- Chi 50k → két −50k.
- Chi 800k → chờ duyệt; đóng ca lúc này → 409.
- Ảnh > 2 MB → 400.
- STAFF duyệt → 403.

### F-035 — Chấm công, lịch làm, năng suất, nhật ký thao tác

**Dữ liệu**
- `Attendance(AttId, UserId, ClockIn, ClockOut, ShiftId, Source LOGIN|MANUAL, EditedBy, EditReason)`.
- `Rosters(RosterId, UserId, WorkDate, StartTime, EndTime, Note)`.
- `AuditLogs(AuditId, UserId, Role, Action, Entity, EntityId, BeforeJson, AfterJson, Ip, UserAgent, At)`.

**Chấm công** (BR-052…BR-054)
- STAFF / MANAGER đăng nhập → `ClockIn` (mỗi người tối đa 1 bản ghi mở). Đăng xuất / đóng ca → `ClockOut`.
- Job `attendance-autoclose` đóng bản ghi quá hạn token.
- Sửa tay: bắt buộc lý do; MANAGER chỉ sửa hôm nay; không chồng giờ; mỗi bản ghi ≤ 24 giờ.
- `LATE` khi muộn > 15 phút.

**Audit** (BR-055) — middleware `src/middleware/audit.js`
- Ghi mọi request đổi dữ liệu `/api/admin/*` và các route quầy đổi tiền / kho / ca.
- Chỉ ghi khi thành công, sau commit.
- Bỏ password / hash / token / secret / otp; SĐT chỉ còn 3 số cuối.
- Trigger chặn UPDATE; job xóa bản ghi > 12 tháng.

**Năng suất:** Σ `AmountDue` theo `ReceivedBy`, số đơn hoàn tất theo `CompletedBy`.

**Kiểm**
- Đăng nhập đồng thời 5 lần → 1 bản ghi mở.
- Sửa không có lý do → 400.
- Hoàn tiền → đúng 1 dòng audit `payment.refund`, không có `PasswordHash`.

### F-034 — Lãi / lỗ đơn giản & điểm hòa vốn

**Dữ liệu:** `FixedCosts(CostId, Name, MonthlyAmount, EffectiveFrom, EffectiveTo)`.

**Công thức** (BR-056)
- Doanh thu thuần = Σ `AmountDue` − hoàn.
- COGS = Σ `CogsAmount` của đơn `COMPLETED`.
- Chi quỹ = chi `APPROVED` thuộc danh mục chi phí.
- Cố định / ngày = số tiền tháng ÷ số ngày của tháng.
- Hòa vốn / ngày = cố định / ngày ÷ biên lãi gộp.
- Đơn thiếu COGS → ước tính bằng BOM × AvgCost, gắn cờ.

**API:** `GET /api/admin/reports/pnl?from&to&groupBy=day|month`. UI ghi nhãn "Ước tính". Chỉ ADMIN.

**Kiểm:** thu 2.000.000, hoàn 100.000, COGS 600.000, chi 150.000, cố định 30.000.000 / 30 ngày → thuần 1.900.000, lãi gộp 1.300.000 (68,42 %), lợi nhuận 150.000, hòa vốn 1.461.538 / ngày. MANAGER gọi → 403.

## 5.5. Giai đoạn 7 — CRM

### F-039 — Tích điểm đổi quà & tem

**Dữ liệu**
- `PointTransactions(PtId, MemberId, PaymentId, Delta, Type EARN|REDEEM|ADJUST|EXPIRE, Note, CreatedBy, CreatedAt)`.
- `RewardCatalog(RewardId, Name, PointsCost, RewardType DISCOUNT|FREE_ITEM, DiscountAmount, MenuItemId, IsActive)`, `RewardRedemptions`.
- `StampPrograms(ProgramId, Name, RequiredStamps, RewardMenuItemId, IsActive)`, `StampProgramItems`, `StampCards(MemberId, ProgramId, Stamps, CompletedCards)`, `StampEvents`.

**Quy tắc** (BR-058, BR-059)
- **Tích:** 1 điểm / 10.000đ thực trả; mỗi lượt thu tối đa 1 dòng `EARN`. Món thuộc chương trình tem = 1 tem (món được tặng không tích); tem dư chuyển sang thẻ mới.
- **Đổi thưởng:** 1 thưởng / lượt thu; cần hội viên; không dùng cùng giảm tay (`400 REWARD_WITH_MANUAL`); trừ điểm trong cùng transaction lượt thu (`sp_ApplyLoyalty`).
- **Hoàn tiền:** `sp_ReverseLoyalty` trừ lại điểm tích (không để âm); hoàn toàn bộ → trả lại điểm đã đổi.
- **Điều chỉnh tay:** chỉ ADMIN, có lý do.

**Kiểm**
- Trả 125.000 → +12 điểm.
- Có 80 điểm đổi quà 100 → 409.
- Có 150 điểm, hai quầy cùng đổi quà 100 → một bên `409 POINTS_INSUFFICIENT`.
- Đủ 10 tem → 1 lượt món miễn phí.

### F-038 — Giới thiệu bạn & voucher

**Dữ liệu**
- `Members` thêm `ReferredByMemberId`, `ReferralRewardedAt`.
- `Vouchers(VoucherId, Code UNIQUE, MemberId, DiscountPercent, DiscountAmount, MaxDiscount, MinOrderAmount, StackWithMember, ExpiresAt, UsedAt, UsedPaymentId, Source REFERRAL|CAMPAIGN|MANUAL)`.

**Quy tắc** (BR-060, BR-061)
- Người giới thiệu phải là hội viên đang hoạt động (`404 REFERRER_NOT_FOUND`), khác chính mình (`400 SELF_REFERRAL`).
- Tối đa 5 lượt / tháng / người giới thiệu (`409 REFERRAL_LIMIT`).
- Thưởng chỉ xét ở **lượt thu đầu tiên** của người mới: ≥ 30.000đ → 2 voucher 10 % / 30 ngày, tạo trong cùng transaction lượt thu.
- Voucher: 1 voucher / lượt thu, dùng 1 lần, còn hạn, đúng chủ.
- Mã lỗi voucher: `409 VOUCHER_USED / EXPIRED / NOT_OWNER / MIN_ORDER / UNAVAILABLE`, `404 VOUCHER_NOT_FOUND`.

**API:** `POST /api/members { …, referrerPhone? }`, `GET /api/members/{id}/vouchers`, `POST /api/vouchers/validate`; thu tiền nhận `voucherCode` trong body.

**Realtime:** `member.vouchers_issued` — bản gửi quầy có mã, bản gửi phiên khách không có mã.

### F-037 — Chiến dịch theo phân khúc

**Dữ liệu**
- `Members` thêm `OptOut`, `LastContactedAt`.
- `Segments(SegmentId, Name, RuleJson)`: AND các điều kiện `tier`, `lastVisitDaysGte/Lte`, `visitCountGte/Lte`, `totalSpentGte`, `birthdayMonth`, `hasPointsGte`.
- `Campaigns(…, Channel EXPORT|ZALO_OA|SMS, MessageTemplate, VoucherPercent, VoucherDays, ScheduledAt, Status DRAFT|SCHEDULED|RUNNING|DONE|FAILED)`.
- `CampaignDeliveries(CampaignId, MemberId, VoucherId, Status, SentAt, Error)`.

**Quy tắc** (BR-062)
- Luôn loại hội viên ngừng / ẩn danh / OptOut.
- Mỗi hội viên tối đa 1 tin / 7 ngày; trường hợp bị chặn → `SKIPPED` kèm lý do.
- Mỗi chiến dịch × hội viên có 1 bản ghi gửi.
- Màn hình che tên / SĐT; SĐT đầy đủ chỉ có trong CSV và mỗi lần tải ghi audit.
- `ZALO_OA` qua `src/channels/zaloOa.js` (`send({phone, text}) → {ok, error}`), chỉ khi có `ZALO_OA_TOKEN` (thiếu → `400 CHANNEL_NOT_CONFIGURED`). `SMS` → `400 CHANNEL_NOT_SUPPORTED`.
- Job `campaigns-due` chạy chiến dịch hẹn giờ.

**Kiểm**
- Phân khúc trả đúng tập seed.
- CSV có đúng số dòng.
- Hội viên OptOut không có trong danh sách.
- Chạy chiến dịch lần 2 trong 7 ngày → mọi người `SKIPPED`.

## 5.6. Giai đoạn 8 — Phân tích

### F-041 — Menu engineering

- **API:** `GET /api/admin/reports/menu-engineering?from&to` → mỗi món `qty, revenue, cogs, margin, marginPerUnit, share, class`.
- **Phân loại** (BR-063), theo trung vị số lượng và trung vị lãi gộp / món của các món bán ≥ 5 lần (bằng trung vị tính là "cao"):
  - `STAR` (cao / cao) → giữ giá, ưu tiên gợi ý;
  - `PLOWHORSE` (bán nhiều / lãi thấp) → xem lại BOM / giá;
  - `PUZZLE` (lãi cao / bán ít) → khuyến mãi / ghim;
  - `DOG` (thấp / thấp) → cân nhắc bỏ / gộp combo;
  - < 5 lần → `INSUFFICIENT`.
- **UI:** biểu đồ phân tán SVG + bảng; nút "Ghim món này" (F-017), "Tạo khuyến mãi" (F-016). Chỉ ADMIN.

### F-042 — Giờ cao điểm, dự báo doanh thu, so sánh kỳ, doanh thu theo bàn

**API**
- `GET /api/admin/reports/heatmap?metric=orders|revenue` — ma trận 7 × 24 theo giờ quán, hàng 0 = Thứ Hai.
- `GET …/revenue-forecast?days=7` — WMA 4 cùng thứ ± 1 độ lệch chuẩn.
- `GET …/compare?period=week|month&offset=` — kỳ đang chạy so với **cùng số ngày đầu** của kỳ trước.
- `GET …/tables` — số phiên, doanh thu, thời gian ngồi TB, doanh thu / giờ ngồi; gắn cờ bàn "ngồi lâu – doanh thu thấp".

**Quy tắc:** BR-064. Heatmap vẽ bằng bảng HTML tô màu, không dùng thư viện.

**Kiểm:** 4 cùng thứ gần nhất (gần → xa) 100k, 200k, 300k, 400k → dự báo 200k.

### F-043 — Dashboard chủ quán ("Hôm nay")

- **Dữ liệu:** `DailySummaries(SummaryDate, RevenueNet, OrderCount, AvgBill, CashVariance, NewMembers, TopItemsJson, LowStockJson, ExpiringJson, PendingApprovals, ComputedAt)`. Job `daily-summary` 00:30 (MERGE theo ngày) + nút "Tính lại hôm nay".
- **UI** `/admin/today`:
  - 5 thẻ: doanh thu hôm qua (so với cùng thứ tuần trước), lệch két, nguyên liệu sắp hết / sắp hết hạn, top 3 món, hội viên mới + voucher đã dùng;
  - "Việc cần làm": chi chờ duyệt, PO đến hạn, lô hết hạn, kiểm kê quá 7 ngày;
  - responsive ≤ 400 px.
- **Quyền** (BR-065): MANAGER nhận bản rút gọn — **server** bỏ `cogs`, `grossProfit`, tổng chi chờ duyệt. STAFF → 403.

## 5.7. Bổ sung 18/10/2026

### F-046 — Sửa / xóa món đã gọi, xóa đơn, hủy bàn (ADR-007)

**Phạm vi** (BR-066): dòng **chưa thu** của đơn tại bàn `PENDING` / `PREPARING` / `COMPLETED`, phiên chưa đóng.
- Chỉ **giảm** số lượng (sai → `400 INVALID_QTY`); về 0 → xóa dòng kèm dòng con / tùy chọn / lượt KM.
- Xóa đơn → `CANCELLED`, giữ các dòng làm lịch sử.
- Mỗi lần bỏ món ghi một dòng `OrderItemVoids`.
- Món đã thu / mang đi / đã hủy / phiên đã đóng → `409 ITEM_NOT_EDITABLE` (dùng Hoàn tiền).

**Quyền** (BR-067)
- Đơn `PENDING` → mọi nhân viên.
- Đơn đã tiếp nhận / đã pha → MANAGER / ADMIN tự làm; STAFF phải kèm `adminUsername` / `adminPassword`.
- SP kiểm lại trạng thái **lúc ghi**: thiếu người duyệt → `403 ADMIN_APPROVAL_REQUIRED`.
- Lý do luôn bắt buộc. Hai máy cùng xóa → máy sau nhận `404 ITEM_NOT_FOUND`.

**Kho** (BR-068)
- `PENDING` / `PREPARING` → `RELEASE`.
- `COMPLETED` → **Ghi hủy hàng** (mặc định) hoặc **Hoàn kho** (`VOID_BACK`). Không vượt phần đã trừ (bất biến `OVER_RESTOCK`).

**Tiền** (BR-069): tính lại từ các dòng còn lại; KM đơn dưới mức tối thiểu → bỏ. Bất biến `ORDER_LINES_MISMATCH`, `COGS_MISMATCH`.

**Hủy bàn** (BR-070)
- Hủy mọi đơn chưa thu, đóng phiên không tạo lượt thu, ghi `CancelledBy` / `CancelReason`.
- Phiên đã có lượt thu → `409 SESSION_HAS_PAYMENTS`.

**SP:** `sp_VoidOrderItem` (+ `sp_VoidLineCore`, `sp_RecalcOrder`, `sp_CloseIfSettled`), `sp_CancelOrders`. **Service:** `voidService`.

### F-047 — Hội viên tại bàn, Thẻ thành viên, quyền lợi trên bill (ADR-008)

- **Gọi món tại bàn có ô SĐT** (BR-071): tra cứu → "Gắn vào bàn". Số mới → đăng ký nhanh (bắt buộc đồng ý, thiếu → `400 CONSENT_REQUIRED`). Bàn trống → mở bàn rồi gắn. Phát `session.member_changed` (tên che).
- **Thẻ thành viên** (BR-072): `GET /api/sessions/{id}/member-card`, chỉ khi phiên mở + đang gắn hội viên + thiết bị thuộc phiên.
  - Hiện tên / SĐT che, hạng, %, điểm, ≤ 10 giao dịch điểm, thẻ tem, quà, voucher còn dùng (**không có mã**).
  - Response `no-store`.
  - Lỗi: `404 NO_MEMBER`, `409 SESSION_CLOSED`, 403.
- **Bill thanh toán** (BR-073): in khối "THẺ THÀNH VIÊN (lúc in)" gồm điểm / tem / voucher còn hạn. Phiếu tạm tính không in khối này.
- **Không đổi schema.**

---

# 6. Bộ tính giá dùng chung `pricing`

Vị trí: `ứng-dụng/máy-chủ/src/pricing/pricing.js` — **hàm thuần**, không phụ thuộc Express / DB, có unit test cho mọi tổ hợp.

```
priceLines(items, catalog, promotions, now, channel)
  -> { lines:[{menuItemId, qty, listPrice, unitPrice, lineDiscount, promotionId, allowMemberStack, modifiers:[…], children:[…]}],
       subtotal, orderPromotion:{id, discount}|null, promoDiscount }

settleTotals({ orders|order|splitLines, member, tiers, voucher, rewards[], manual:{amount|percent, reason}, settings })
  -> { subtotal, promoDiscount, memberDiscount, voucherDiscount, rewardDiscount, manualDiscount, roundingAdj, amountDue,
       memberPercent, firstOrderDiscount, pointsEarned, stampsEarned, breakdownLines:[…] }
```

**Thứ tự cố định** (BR-021, BR-057)
1. Giá niêm yết → KM dòng (giá thấp nhất) / giá combo → cộng `PriceDelta` tùy chọn → subtotal.
2. KM đơn: một KM, lớn nhất, phải đạt mức tối thiểu. Đã khóa lúc gửi đơn.
3. Chiết khấu hội viên = % × Σ dòng `allowMemberStack` (đơn đầu −10 % thay % hạng nếu lớn hơn).
4. **Voucher**: một voucher; `StackWithMember = 0` → không áp % hạng.
5. **Đổi thưởng**: một thưởng, dạng dòng `REWARD`.
6. Giảm tay.
7. Làm tròn **xuống** 500đ (`roundingAdj ≥ 0`).
8. `AmountDue = Subtotal − Promo − Member − Voucher − Reward − Manual − RoundingAdj`. Không âm; không giảm quá subtotal.

Chia bill: KM đơn **phân bổ theo dòng** (theo tỉ lệ thành tiền, phần dư cho phần lẻ lớn nhất). Điểm / tem tính trên `amountDue` cuối, trừ dòng REWARD.

**Cách dùng**
- Service gọi `pricing` **trước** khi gọi SP và truyền số đã tính. SP chỉ kiểm ràng buộc tối thiểu (`AmountDue ≥ 0`, `AmountReceived ≥ AmountDue`, `@ExpectedDue` khớp) và ghi.
- Bill in và màn hình đều lấy từ cùng `breakdownLines`. **Không tính lại ở FE.**

---

# 7. Job nền — một bộ lập lịch duy nhất `src/jobs/`

| Job | Lịch (giờ quán) | Việc | Feature |
| --- | --- | --- | --- |
| `refresh-caches` | mỗi 15 phút | Cache gợi ý, thời gian chuẩn món | F-017, F-025 |
| `attendance-autoclose` | mỗi 15 phút | Đóng chấm công quên đăng xuất | F-035 |
| `campaigns-due` | mỗi 5 phút | Chạy chiến dịch `SCHEDULED` tới giờ | F-037 |
| `daily-summary` | 00:30 | `DailySummaries` hôm qua | F-043 |
| `prep-stats` | 02:00 | `ItemPrepStats` | F-025 |
| `demand-forecast` | 02:00 | `DemandForecasts` 14 ngày | F-029 |
| `audit-retention` | 03:00 | Xóa audit > 12 tháng (lô 5.000 dòng) | F-035 |
| `lot-expiry` | 06:00 | `inventory.expiring` / `expired` | F-028 |
| `runout-alert` | 06:05 | `inventory.runout` | F-029 |

**Yêu cầu với mọi job**
- Đăng ký trong `src/jobs/index.js` (`at: 'HH:MM'` hoặc `everyMinutes`).
- **Idempotent** (MERGE theo khóa).
- Có khóa `Settings.job.<name>.running` (hết hạn 30 phút); ghi `JobRuns` RUNNING → OK / FAILED / SKIPPED.
- `JOBS_ENABLED=false` → không tự chạy, nhưng vẫn gọi được `runJob(name)` / `POST /api/admin/jobs/{name}/run`.
- Không dùng `node-cron`, không rải `setInterval` riêng.

---

# 8. Quy trình cho mỗi feature

1. **Khảo sát** (mục 2) → `tài-liệu/kế-hoạch/<TASK>-plan.md` có bảng map tên.
2. **ADR**: quyết định mặc định chưa có ADR → tạo `tài-liệu/quyết-định/ADR-0xx-<tên>.md` (một dòng / quyết định). Quyết định ngoài danh sách D-xx → chọn phương án **chặt hơn**, ghi Q + ADR "tạm".
3. **Migration**: file mới `cơ-sở-dữ-liệu/chuyển-đổi/NNNN_<tên>.sql`.
   - Chỉ `ALTER` / `CREATE`, có `IF NOT EXISTS`. **Không sửa migration đã chạy.**
   - Seed cấu hình (hạng, settings) trong migration hoặc `kịch-bản/seed-data.js`.
4. **SP**: `CREATE OR ALTER` trong `cơ-sở-dữ-liệu/thủ-tục/`.
   - `SET XACT_ABORT ON`, một transaction.
   - Khóa theo thứ tự `Sessions → Orders → Ingredients`; `Ingredients WITH (UPDLOCK, HOLDLOCK)` theo `IngredientId` tăng dần.
   - Tham số mới có **giá trị mặc định** để code cũ vẫn gọi được.
   - Không bỏ constraint bảo vệ kho / tiền.
   - Mã lỗi mới → map trong `src/errors.js`.
5. **Backend**: theo tầng `routes → services → repositories`.
   - Mở rộng endpoint cũ bằng trường tùy chọn (tương thích ngược).
   - Quyền mới → thêm vào `PERMISSIONS`.
   - Tiền → qua `pricing`.
   - Realtime → `publish()` **sau commit**.
   - Route đổi tiền / kho / quyền / giá → thêm vào luật audit.
   - Job → vào bộ lập lịch chung.
6. **Frontend**: HTML / CSS / JS thuần trong đúng khu vực (`t/`, `pos/`, `admin/`) + `js/pages/<trang>.js`.
   - Dùng `api.js`, `socket.js`, `ui.js`.
   - Khi (re)connect phải tải lại ảnh chụp.
   - Không thêm framework / thư viện ngoài tech-stack (biểu đồ vẽ SVG tự viết).
   - Bill đổi → cập nhật `print.js` / trang receipt.
7. **Test**
   - Unit: `pricing`, dự báo, phân loại, hàm thuần trong `src/domain/`.
   - Integration endpoint + SP trên **SQL Server thật**, gồm kịch bản **đồng thời** khi chạm kho / tiền / điểm.
   - E2E luồng chính của feature.
   - **Regression** hai luồng lõi + luồng hội viên / thu tiền.
   - Thêm bất biến mới vào `tests/helpers/testDb.js → inventoryViolations`.
8. **Docs** cập nhật trong cùng task:
   - `tài-liệu/chức-năng/FEATURE-0xx.md` + `README.md`;
   - `nghiệp-vụ/business-rules.md` (BR mới có ID), `roles-permissions.md`, `workflows-states.md`;
   - `kiến-trúc/data-model.md`, `api-contract.md`, `realtime-events.md`, `system-overview.md`;
   - `giao-diện/screens-flows.md`, `vận-hành/local-development.md` (lệnh / env / job), `công-việc/README.md`.
9. **Bàn giao** theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`:
   - thay đổi, AC đạt / chưa;
   - lệnh test **thực chạy** + kết quả; NOT_RUN + lý do;
   - docs đã cập nhật, Q mới, trạng thái đề xuất.

Lệnh kiểm:

```bash
npm test && npm run test:e2e && npm run load && npm run lint && npm run format:check
```

---

# 9. Validation chung (chạy sau mỗi feature)

**Luồng lõi vẫn chạy**
- Đặt món → tiếp nhận → hoàn tất (trừ kho đúng) → gọi thanh toán → thu tiền → in bill.
- Bán mang đi.

**Bất biến kho**
- `StockQty ≥ 0`; `ReservedQty` khớp các đơn chưa hoàn tất.
- (OrderId, IngredientId, LotId) ≤ 1 dòng `DEDUCT`.
- Σ lô mở = `StockQty` (`LOTS_MISMATCH`).
- `PREP_OUT` / `PREP_IN` của một mẻ cân bằng giá trị.
- `RESTOCK` + `VOID_BACK` + lượng ghi hủy ≤ `DEDUCT` (`OVER_RESTOCK`).

**Bất biến tiền**
- Mỗi phiên không chia / mỗi phần có đúng một `Payments`.
- `AmountDue` đúng công thức mục 6; `AmountReceived ≥ AmountDue`; Σ hoàn ≤ đã thu.
- `ExpectedCash` chốt ca khớp công thức có sổ quỹ.
- Đơn không hủy: tạm tính = Σ dòng (`ORDER_LINES_MISMATCH`); `COGS_MISMATCH` sạch.
- Điểm / tem không âm, = Σ sổ điểm; mỗi `PaymentId` tối đa một `EARN`.

**Quyền**
- Ma trận `PERMISSIONS` pass.
- Khách không gọi được API quầy / admin (401 / 403).
- MANAGER không vào `/api/admin/*`.
- Mọi hành động nhạy cảm trong test đều có dòng audit.

**Dữ liệu cá nhân**
- SĐT đầy đủ chỉ có ở tra cứu quầy và CSV có audit.
- Log không chứa SĐT / tên.
- Màn khách chỉ hiện tên che; thẻ thành viên không có mã voucher.

---

# 10. Khi thất bại / không chắc

- Tên bảng / SP thật khác đề xuất → thích nghi theo tên thật, ghi vào plan; **không tạo SP / bảng trùng chức năng**.
- Tiền đề thiếu hoặc khác → dừng feature đó, báo, làm feature độc lập khác.
- Luồng lõi lệch docs → ghi Q, không sửa trong task này.
- Deadlock (lỗi 1205) trong test đồng thời / FEFO / sơ chế → kiểm thứ tự khóa (`IngredientId` tăng dần), giữ transaction ngắn, app retry ≤ 3 lần. **Không nới lock / constraint.**
- Gặp Q-xxx đang NEEDS_CONFIRMATION liên quan → dừng phần đó, làm phần độc lập, ghi vào báo cáo.

# 11. Không làm

- Không tích hợp cổng thanh toán / ví / chuyển khoản (ADR-000: chỉ tiền mặt), OTP, SMS, kế toán, EDI; không push notification; không máy học (dự báo chỉ WMA); không đa chi nhánh / nhiều kho.
- Không đổi stack (HTML / CSS / JS thuần, Node / Express, SQL Server, Socket.io).
- Không tính tiền / điểm ở FE; không bỏ qua `pricing` để "tính nhanh" trong route.
- Không "SELECT rồi UPDATE" ngoài transaction; không phát realtime trước commit.
- Không gộp nhiều feature vào một migration / PR; không sửa migration đã chạy.
- Không nới constraint để test pass; không bịa lệnh, kết quả test hay tên file chưa tồn tại.
- Không sửa tay `.claude/skills/` (bản đồng bộ) — sửa `.agent/skills/` rồi chạy `npm run skills:sync`.

# 12. Hoàn thành khi

Feature được giao có đủ: migration + SP + API + UI + job (nếu có) + test (gồm bất biến, kịch bản đồng thời và regression lõi) **PASS trên SQL Server thật**; docs và ADR đồng bộ; báo cáo bàn giao có PASS / FAIL / NOT_RUN thật; diff không chạm phần ngoài phạm vi.
