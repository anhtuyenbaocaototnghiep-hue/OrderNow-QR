# FEATURE-014 — Hội viên (SĐT + họ tên, không bắt buộc)

> **Nguồn:** skill `extend-features` §4 F-014 (chủ dự án giao 16/10/2026). Quyết định: [ADR-005](../quyết-định/ADR-005-mo-rong-giai-doan-2.md) D-5, D-6, D-8, D-16.

- **Status:** CONFIRMED (ADR-005) · Triển khai: READY_FOR_REVIEW (16/10/2026)
- **Actor:**
  - Khách: tra cứu, đăng ký, gắn hội viên vào phiên.
  - STAFF: tra cứu thấy tên đầy đủ, đăng ký nhanh, gắn khi thu tiền / mang đi.
  - ADMIN: quản lý hội viên và hạng.
- **Màn hình:**
  - Khách: ô "⭐ Nhập SĐT để nhận ưu đãi" ở giỏ hàng và màn theo dõi đơn.
  - Quầy: mục "Hội viên · giảm giá" trong drawer Thu tiền bàn và màn Bán mang đi.
  - Quản lý → **Hội viên** (`/admin/members`, gồm tab Hạng hội viên).
- **Dữ liệu:** migration `0003_hoi_vien.sql`.
  - Bảng: `MemberTiers` (MEMBER 0đ 3% · LOYAL 1.000.000đ 5% · VIP 3.000.000đ 8%), `Members`, `MemberTransactions`.
  - Cột `MemberId` trên `Sessions`, `Orders` (mang đi), `Payments`.
  - Breakdown trên `Payments`.
- **Quy tắc:**
  - SĐT chuẩn hóa `0xxxxxxxxx` → `+84xxxxxxxxx`; sai định dạng → `400 INVALID_PHONE`.
  - Khách chỉ thấy tên che ("Nguyễn V. A."). Quầy (đăng nhập) thấy tên đầy đủ. SĐT/tên không ghi ra log.
  - Đăng ký bắt buộc tick đồng ý (lưu `ConsentAt`), nếu không → `400 CONSENT_REQUIRED`. Trùng SĐT → `409 PHONE_EXISTS`.
  - Khách gắn hội viên bằng SĐT, chỉ vào phiên của mình (403 nếu không phải). Quầy gắn bằng `memberId`.
  - Chiết khấu tính lúc **thu tiền** (D-8), theo hạng lúc đó, chỉ trên dòng cho phép cộng dồn với khuyến mãi.
  - Đơn đầu tiên −10% (cài đặt), thay % hạng khi lớn hơn.
  - Sau thu tiền (trong cùng transaction — `sp_ApplyMemberPayment`):
    - cộng `TotalSpent` (số thực trả), `VisitCount`, `Points` (1/1.000đ);
    - đánh dấu đã dùng ưu đãi đơn đầu;
    - tự nâng hạng, không tự hạ;
    - ghi `MemberTransactions`.
  - Hoàn tiền (F-019) trừ `TotalSpent` (không hạ hạng).
  - Tra cứu/đăng ký của khách bị giới hạn 10 lần/phút/IP và 20 lần/phút/thiết bị. Nhân viên đăng nhập không bị giới hạn.
  - "Ẩn danh theo yêu cầu": xóa tên, thay SĐT bằng `anon:` + SHA-256, gỡ khỏi phiên đang mở, giữ thanh toán. SĐT đó đăng ký lại được.
- **API:**

  | Method | Path |
  | --- | --- |
  | POST | `/api/members/lookup` |
  | POST | `/api/members` |
  | POST, DELETE | `/api/sessions/{id}/member` |
  | POST | `/api/sessions/{id}/settle/preview` |
  | POST | `/api/sessions/{id}/settle` (thêm `memberId`) |
  | POST | `/api/orders/takeaway` (thêm `memberId`) |
  | GET | `/api/admin/members?q=&page=` |
  | GET, PUT | `/api/admin/members/{id}` |
  | POST | `/api/admin/members/{id}/anonymize` |
  | GET, PUT | `/api/admin/member-tiers` |

  Realtime: `session.member_changed`.
- **Acceptance Criteria**
  - AC-014-01: Đăng ký mới → đơn 93.000đ thu 83.500đ (−10% = 9.300đ, làm tròn xuống 500đ). Bill có dòng "Hội viên … −10%".
  - AC-014-02: Lần sau nhập SĐT → thấy "Nguyễn V. A.", giảm 3%.
  - AC-014-03: Tổng chi vượt 1.000.000đ → `MemberTransactions` ghi MEMBER → LOYAL; lần sau giảm 5%.
  - AC-014-04: SĐT sai → 400. Tra cứu lần thứ 11 trong một phút từ một IP → 429.
  - AC-014-05: Ẩn danh → không còn tên/SĐT, tra cứu không thấy, `Payments` vẫn đủ.
  - AC-014-06: Khách gọi `/api/admin/members` → 401. STAFF → 403. Danh sách quản lý che số (`09xx***678`).
- **Bằng chứng:**
  - `tests/members.test.js`.
  - `tests/pricing.test.js` (hội viên, đơn đầu).
  - E2E "hội viên: khách nhập SĐT ở giỏ…".
