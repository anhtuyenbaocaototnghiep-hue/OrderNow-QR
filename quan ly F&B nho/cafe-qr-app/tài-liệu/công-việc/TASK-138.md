# TASK-138 — Gọi nhân viên: tối đa 5 lần trong 1 phút (F-021, ADR-072)

- **Status:** READY_FOR_REVIEW (26/11/2026)
- **Tài liệu:** [ADR-072](../quyết-định/ADR-072-goi-nhan-vien-5-lan-moi-phut.md) D-265, [FEATURE-021](../chức-năng/FEATURE-021.md) (AC-021-02 viết lại, AC-021-05)
- **Màn hình:** SCR-04 theo dõi đơn (nút Gọi nhân viên), SCR-01 màn chào (ô Gọi nhân viên)
- **Nguồn:** chủ dự án 26/11/2026 — ảnh hộp "Gọi nhân viên" + "cái này được spam 5 lần thôi rồi sau đó chờ khoảng 1 phút".
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-138-goi-nhan-vien-5-lan`, chồng lên `task/TASK-137-tat-o-hoi-vien`
- **Kế hoạch:** [TASK-138-plan.md](../kế-hoạch/TASK-138-plan.md)

## Phạm vi

- Máy chủ: đếm số lần gọi của phiên trong 60 giây gần nhất (một câu lệnh có khóa); ≥ 5 → `429 TOO_SOON`, `retryAfter` theo lần cũ nhất trong 5 lần.
- Điện thoại: nút chỉ khóa + đếm ngược khi nhận `TOO_SOON`.

## Test

- `tests/sales.test.js` "Gọi nhân viên (F-021)": 5 lần được, lần 6 → 429 (`retryAfter` 1–60), lùi giờ lần gọi cũ nhất quá 60 giây → gọi lại được; phiên khác 403. Trước đây bài này kiểm "lần 2 → 429" (quy tắc cũ, ADR-072 thay).
- E2E "gọi nhân viên…": sau một lần gọi nút vẫn bấm được (AC-021-05).

## Lệnh kiểm chứng

Xem phần Bàn giao (cập nhật sau khi chạy).
