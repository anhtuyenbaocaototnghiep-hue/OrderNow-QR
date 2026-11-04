# FEATURE-069 — Mừng khách quay lại

> **Nguồn:** chủ dự án 04/11/2026. Quyết định: [ADR-027](../quyết-định/ADR-027-mung-khach-quay-lai.md) D-107…D-111.

- **Status:** CONFIRMED (ADR-027) · Triển khai: [TASK-086](../công-việc/TASK-086.md)
- **Actor:** **ACT-MEMBER** (được chào, nhận quà tự trừ); **ACT-STAFF / ACT-LEAD** (thấy dải "Khách quay lại sau N ngày", có thể không dùng quà lượt này); **ACT-ADMIN** (bật / tắt, chọn quà, xem hiệu quả).
- **Màn hình:** Quầy → Thu tiền bàn / Bán mang đi (S-13, S-14); khách → ô hội viên (S-03, S-05) + Thẻ thành viên; Hóa đơn (S-12); Quản lý → Tích điểm & voucher → Mừng khách quay lại (S-40); Hội viên (S-26) bộ lọc "Lâu chưa quay lại".
- **Dữ liệu:** `WinbackGifts`, `Vouchers.Source = 'WINBACK'`, khóa cài đặt `winback.*`, `Members.LastVisitAt`.

## User Story

- **US-069-1:** Là hội viên lâu không ghé, tôi muốn quán nhận ra và tặng quà nhỏ khi tôi quay lại, để thấy mình vẫn được nhớ.
- **US-069-2:** Là chủ quán, tôi muốn chọn quà cho khách quay lại và biết quà có giữ chân được khách không, để kéo khách cũ về mà kiểm soát chi phí.

## Quy tắc (BR-106)

1. Vắng = `LastVisitAt` có giá trị và số ngày (giờ quán) từ lần thanh toán gần nhất tới hôm nay ≥ `winback.after_days` (45).
2. Bật + hội viên đang hoạt động, chưa ẩn danh, đang vắng, chưa có quà của đợt vắng này, không có quà nào trong `winback.cooldown_days` (180) → **một** voucher `WINBACK` gắn hội viên, hạn hết ngày thứ `winback.hold_days` (14). Hai yêu cầu cùng lúc không tạo hai quà.
3. Quà: `PERCENT` (1–50%, trần), `AMOUNT` (≥ 1.000đ), `FREE_ITEM` (như BR-104).
4. Thu tiền có hội viên, chưa chọn voucher, không có quà sinh nhật được áp, không gửi `skipWinback` → tự áp quà còn dùng được (kể cả quà đang giữ từ lần trước).
5. Khách thấy lời chào + giá trị quà + hạn, không thấy mã.

## API

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| `GET /api/admin/winback` · `PUT …` | ADMIN | `{ enabled, kind, value, maxDiscount, menuItemId, afterDays, holdDays, cooldownDays }`; `GET` kèm `stats` (90 ngày), `recent` (quà gần đây), `awayNow` (số hội viên đang vắng) |
| `GET /api/members/{id}/loyalty`, thông tin hội viên của phiên, Thẻ thành viên | như cũ | Thêm `winback: { away, days, lastVisitAt, visitCount, status: READY \| USED \| EXPIRED \| COOLDOWN \| OFF, gift, lastGiftAt } \| null` (khách: không có `gift.code`) |
| Xem trước / thu tiền (bàn, chia bill, mang đi) | Nhân viên | Body thêm `skipWinback`; `totals.winbackApplied` |
| `GET /api/admin/members/overview` | ADMIN | Thêm `lapsedDays` (= `winback.after_days`); bộ lọc `lapsed` dùng số ngày này |

## Acceptance Criteria

- AC-069-01: (unit) số ngày vắng theo giờ quán; kiểm cài đặt (số ngày vắng 14–365, giữ quà 1–60, giữa hai quà ≥ số ngày vắng, quà như F-067).
- AC-069-02: Bật + hội viên vắng ≥ 45 ngày → quầy thấy `winback.status = READY` kèm mã, `days` đúng; gọi lại / cùng lúc không tạo quà thứ hai; tắt → `OFF` (vẫn có `days`); vắng 20 ngày / chưa thanh toán lần nào → `null`; đã có quà trong 180 ngày → `COOLDOWN`.
- AC-069-03: Thu tiền có hội viên vắng → quà tự áp (đúng %, có trần), hóa đơn "Quà quay lại", lần sau `winback: null`; `skipWinback` → không áp, quà giữ, lần ghé sau (không còn vắng) vẫn tự áp; hội viên đang sinh nhật → quà sinh nhật được áp, quà quay lại giữ.
- AC-069-04: Điện thoại khách / Thẻ thành viên thấy lời chào + quà, không có mã.
- AC-069-05: Cài đặt hợp lệ lưu được, sai → 400, nhân viên → 403; `stats` (đã tặng, đã dùng, ghé tiếp trong 30 ngày), `recent`; bộ lọc "Lâu chưa quay lại" theo `afterDays`.
- AC-069-06: Trên trình duyệt: quản lý bật ở tab Mừng khách quay lại; quầy gắn hội viên vắng 52 ngày → dải "Khách quay lại sau 52 ngày", bảng tính tiền có dòng "Quà quay lại", "Không dùng quà lần này" bỏ trừ; thu xong tab quản lý ghi "Đã dùng quà".

## Bằng chứng

`tests/winback.test.js` (AC-069-01…05) · E2E "mừng khách quay lại…" (AC-069-06).
