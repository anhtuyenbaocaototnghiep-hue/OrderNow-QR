# TASK-137 — Công tắc bật / tắt ô "Nhập SĐT để nhận ưu đãi" trên màn khách (F-101, ADR-071)

- **Status:** READY_FOR_REVIEW (26/11/2026)
- **Tài liệu:** [FEATURE-101](../chức-năng/FEATURE-101.md) (AC-101-01…03), [ADR-071](../quyết-định/ADR-071-tat-o-hoi-vien-man-khach.md) D-264, BR-131, US-101-1
- **Màn hình:** SCR-33 Cài đặt, SCR-01 màn chào, SCR-02 / SCR-03 thực đơn + giỏ hàng, SCR-04 theo dõi đơn
- **Nguồn:** chủ dự án 26/11/2026 — ảnh ô "Nhập SĐT để nhận ưu đãi" + "làm cho tôi nút tắt cái này trong cài đặt bật tắt".
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-137-tat-o-hoi-vien`, chồng lên `task/TASK-136-nhom-mon-xuong-dong`
- **Kế hoạch:** [TASK-137-plan.md](../kế-hoạch/TASK-137-plan.md)

## Phạm vi

- Cài đặt `guest.member_box` (mặc định bật, chỉ chủ quán), công tắc ở thẻ "Màn gọi món của khách".
- Tắt → màn chào, giỏ hàng, theo dõi đơn không gắn ô hội viên; máy chủ chặn khách tự tra / đăng ký / gắn SĐT / thêm ngày sinh (`403 MEMBER_SELF_OFF`). Quầy không đổi.

**Ngoài phạm vi:** tắt cả chương trình hội viên ở quầy; dòng "Hội viên: thêm ngày sinh…" trên thẻ QR bàn (đi theo cài đặt quà sinh nhật).

## Test

- `tests/guest-member-box.test.js` (mới): AC-101-01, AC-101-02.
- E2E `flow.spec.js` "ô hội viên trên màn khách: …" (AC-101-03).
- `/api/shop` có thêm khóa `memberBox` → 2 test so nguyên danh sách khóa (basic-mode, guest-theme) cập nhật theo hợp đồng mới.

## Lệnh kiểm chứng

- **Kết quả 26/11/2026 (nhánh `task/TASK-138-goi-nhan-vien-5-lan`, gồm TASK-137):**
  - `npm run lint`, `npm run format:check`: sạch.
  - `npm test`: 518/518 PASS. 2 test mới (AC-101-01/02) FAIL trên mã máy chủ cũ (cất bằng `git stash`), PASS trên mã mới.
  - `npm run test:e2e`: 120/120 PASS.
  - `npm run trace -- --check`: 208 US, 597 AC — PASS 597, FAIL 0, NOT_RUN 0, GAP 0.
- **Các lần chạy trước:** E2E hỏng mỗi lần một bài khác nhau, không do thay đổi này:
  - "thu tiền mặt" — tiền thừa chưa kịp cập nhật;
  - TASK-133 tìm thẻ Bàn NV1 khi trang In QR chưa vẽ xong — đã thêm bước chờ, e9edd84;
  - F-088 quá 60 giây.
  - Chạy lại đều đạt.
