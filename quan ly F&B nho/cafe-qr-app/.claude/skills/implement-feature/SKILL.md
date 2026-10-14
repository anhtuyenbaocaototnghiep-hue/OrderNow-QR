---
name: implement-feature
description: Triển khai hoặc thay đổi một chức năng có nghiệp vụ, quyền hoặc nhiều thành phần (API + SP + UI + realtime) trong cafe-qr-app; dùng khi task có FEATURE-xxx và AC rõ.
---

# Mục đích
Hiện thực đúng feature trong tầng/boundary của dự án và tạo bằng chứng cho từng AC.

## Khi dùng
Task thêm/sửa hành vi sản phẩm (đặt món, thanh toán, hoàn tất, admin CRUD…). Không cần cho sửa typo, đổi màu.

## Điều kiện trước
- Task trong `tài-liệu/công-việc/` có scope, FEATURE và AC IDs.
- Các Q-xxx mà feature ghi "chặn bởi" đã có ADR, hoặc task ghi rõ phương án áp dụng.
- Có SQL Server dev chạy được (docker compose) và lệnh trong `tài-liệu/vận-hành/local-development.md` đã xác minh.

## Đầu vào và tài liệu
- `tài-liệu/chức-năng/FEATURE-xxx.md` (luồng, lỗi, AC).
- Rule IDs và quyền: `tài-liệu/nghiệp-vụ/business-rules.md`, `roles-permissions.md`, `workflows-states.md`.
- `tài-liệu/kiến-trúc/system-overview.md` (tầng), `api-contract.md`, `realtime-events.md`, `data-model.md` khi chạm tương ứng.
- `tài-liệu/giao-diện/screens-flows.md` khi có UI.

## Quy trình
1. Đọc task, feature, AC và rule được link. Liệt kê AC sẽ chứng minh bằng gì (test tự động / thủ công).
2. Xác định điểm chạm: controller/hub → service → repository/SP → FE page/component → sự kiện realtime.
3. Tìm nguồn/tests thật đang có cho module đó; đọc pattern hiện hữu (DTO validation, error mapping, guard).
4. Nếu chạm DB/SP, quyền, contract, realtime hoặc ≥ 2 module → viết `tài-liệu/kế-hoạch/TASK-xxx-plan.md` (mẫu ở `tài-liệu/kế-hoạch/README.md`) rồi mới code.
5. Implement theo lát cắt nhỏ, theo thứ tự: SP/migration (skill `change-database`) → service + test → controller + DTO → realtime publish sau commit → FE → E2E.
6. Kiểm input (DTO), quyền (guard), ownership (phiên thuộc client), trạng thái hợp lệ (BR-013), mã lỗi đúng contract.
7. Với thao tác ghi kho/thu tiền: chỉ gọi SP; map lỗi SP theo bảng mã lỗi ở `tài-liệu/kiến-trúc/data-model.md`
   (50001/50002/50003/50010/50020/50030–50033, deadlock 1205 → retry ≤ 3).
8. Viết/chỉnh test: unit cho service, integration cho endpoint + SP, E2E cho luồng chính nếu task yêu cầu.
9. Chạy skill `verify-change`.
10. Đồng bộ docs: feature (nếu hành vi được chốt khác), api-contract, realtime-events, data-model, local-development (lệnh mới).
11. Xem diff; loại thay đổi ngoài scope.

## Validation
- Mỗi AC ↔ test hoặc bằng chứng thủ công (ảnh/ghi chú).
- Test concurrency (AC có "đồng thời") chạy trên SQL Server thật.
- Thiếu môi trường (máy in nhiệt, Wi-Fi quán) → NOT_RUN + cách kiểm sau.

## Khi thất bại
- Lỗi kỹ thuật trong scope: sửa nguyên nhân, chạy lại.
- Thiếu quyết định nghiệp vụ: thêm Q-xxx vào `tài-liệu/open-questions.md`, dừng phần đó, tiếp tục phần độc lập.
- Không sửa rule/contract/constraint đã chốt để test pass.

## Đầu ra
Code + test + docs đồng bộ + báo cáo bàn giao (mẫu ở `tài-liệu/chất-lượng/test-strategy.md#ban-giao`).

## Không làm
Đổi stack; thêm module ngoài yêu cầu; chép rule vào code comment thay vì link ID; tắt test; báo Done thiếu bằng chứng.

## Hoàn thành khi
Mọi AC trong scope đạt có bằng chứng; checks áp dụng PASS; NOT_RUN có lý do; diff đúng phạm vi; docs đồng bộ.
