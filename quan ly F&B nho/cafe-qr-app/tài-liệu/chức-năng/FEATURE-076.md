# FEATURE-076 — Quy trình 1 chạm ở màn Đơn hàng

> **Nguồn:** chủ dự án 07/11/2026 ("tinh chỉnh gọn lại… bỏ mục đang pha đi để nhân viên đỡ thao tác"; duyệt: "tiến hành làm những cái tôi vừa nhắn"). Quyết định: [ADR-034](../quyết-định/ADR-034-quy-trinh-1-cham.md) D-153…D-155. Nền: F-007 dashboard quầy, F-025 thời gian chờ.

- **Status:** CONFIRMED (ADR-034) · Triển khai: [TASK-093](../công-việc/TASK-093.md)
- **Actor:** **ACT-STAFF / ACT-LEAD** (bấm Xong); **ACT-ADMIN** (bật / tắt).
- **Màn hình:** **Đơn hàng** (SCR-10): cột **Cần làm** + nút **Xong**; **Cài đặt** (SCR-33): thẻ **Màn Đơn hàng ở quầy** → **Quy trình 1 chạm**.
- **Dữ liệu:** cài đặt `pos.one_tap` (mặc định bật). Không đổi bảng.

## User Story

- **US-076-1:** Là nhân viên quầy, tôi muốn mỗi đơn chỉ bấm một lần "Xong" mà kho vẫn trừ đúng và khách vẫn được báo, để không bỏ quên đơn ở bước giữa khi đông khách.

## Quy tắc (BR-114)

1. `pos.one_tap` mặc định bật; chỉ quản lý đổi (`PUT /api/admin/settings` → nhân viên 403). Máy quầy đọc qua `/api/auth/me` (`pos.oneTap`).
2. Bật: "Cần làm" = đơn mới (chưa giữ) + đơn đang pha, chờ lâu nhất trước; đơn đang giữ ở cuối; Xong = tiếp nhận + hoàn tất (hoặc hoàn tất); Hủy chỉ với đơn mới. Tắt: 3 cột như F-007.
3. Thống kê thời gian làm: đơn nhận + xong cách nhau < 10 giây → từ max(lúc sẵn sàng, lúc đơn trước xong) tới lúc xong; còn lại từ lúc tiếp nhận.

## API

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| `GET` · `PUT /api/admin/settings` | ADMIN | Thêm `oneTap` (boolean) |
| `GET /api/auth/me` | Nhân viên | Thêm `pos: { oneTap }` |

## Acceptance Criteria

- AC-076-01: Chưa đặt → `oneTap` = true; quản lý tắt / bật được, `/auth/me` trả đúng; nhân viên đổi → 403.
- AC-076-02: Đơn 3 bước (tiếp nhận −600 s, xong −480 s) tính 120 giây; đơn 1 chạm (tới −500 s, nhận −300 s, xong −298 s, đơn trước xong −480 s) tính 182 giây (không phải 2 giây); trung vị 151 giây, 2 mẫu.
- AC-076-03: Trên trình duyệt: quản lý bật ở Cài đặt → màn Đơn hàng tiêu đề "Cần làm", cột "Đang pha" ẩn; đơn mang đi hiện trong "Cần làm" với nút "Xong", không có "Tiếp nhận"; bấm Xong → "Đã hoàn tất #…", đơn sang "Đã xong hôm nay".

## Bằng chứng

`tests/one-tap.test.js` (AC-076-01, 02) · E2E "quy trình 1 chạm…" (AC-076-03).
