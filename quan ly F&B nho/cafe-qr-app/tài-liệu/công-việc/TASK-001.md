# TASK-001 — Khởi tạo repo: khung FE HTML/CSS/JS, lint, CI, SQL Server dev, kiểm thiết lập agent
Status: DONE (14/10/2026) — khung FE thuần `ứng-dụng/giao-diện/public`, ESLint/Prettier, `.env.example`, `docker-compose.yml` và CI `.github/workflows/ci.yml` (2 file này CHƯA XÁC MINH: máy không có Docker, repo chưa có remote), skill discovery PASS
Feature: —
Story: —
Owner: Tuyến (FE) + Nhật Anh · Tuần: 1

## Mục tiêu
Repo có `ứng-dụng/giao-diện/public` (HTML/CSS/JS thuần — D-4/ADR-002) với `api.js`, `socket.js`, `ui.js` và khung 3 khu vực; lint/format; CI chạy lint + test; SQL Server dev dựng được bằng lệnh đã xác minh; công cụ AI nhận diện được entrypoint và skills.

## Phạm vi và phần chưa làm
Trong:
- `ứng-dụng/giao-diện/public`: `css/base.css`, `js/api.js`, `js/socket.js`, `js/ui.js`, khung 3 khu vực `/t`, `/pos`, `/admin` (D-4: không framework, không build); ghi phiên bản **thực tế đã cài** vào tech-stack.
- Lint/format/type-check; CI (ví dụ GitHub Actions) chạy lint + test + `bash kịch-bản/sync-skills.sh --check`.
- SQL Server dev: `docker-compose.yml` dịch vụ `mssql` **hoặc** hướng dẫn dùng SQL Server cài sẵn (máy đã kiểm chưa có Docker — xem local-development).
- `.env.example` theo danh sách biến trong local-development.
- Xác minh skill discovery trong Claude Code (và Codex/Cursor nếu nhóm dùng), ghi kết quả vào local-development.

Ngoài:
- Backend (TASK-002), schema (TASK-003), UI thật.

## Context cần đọc
- `AGENTS.md`, `.agent/rules.md`
- `tài-liệu/kiến-trúc/tech-stack.md`
- `tài-liệu/vận-hành/local-development.md`
- `tài-liệu/README.md` (cây repo dự kiến)

## Skill
verify-change (cuối task)

## Acceptance Criteria
- `npm run dev` mở được 3 khu vực `/t/{qr}`, `/pos`, `/admin`.
- Lint/format pass; CI chạy lint + test.
- Kết nối được SQL Server dev bằng lệnh đã ghi; lệnh đã chạy thử trên ≥ 2 máy.
- Skill discovery được ghi PASS hoặc NOT_RUN kèm lý do.

## Dependencies
—

## Ràng buộc
Không thêm thư viện ngoài tech-stack mà không ghi lý do; không commit secret; phiên bản lấy từ manifest thật.

## Validation
Chạy các lệnh trên và ghi lệnh + kết quả vào `tài-liệu/vận-hành/local-development.md` (đánh dấu ĐÃ XÁC MINH).

## Đầu ra
`ứng-dụng/giao-diện`, cấu hình CI, `docker-compose.yml` hoặc hướng dẫn SQL Server, `.env.example`, local-development cập nhật. Kèm báo cáo bàn giao theo `tài-liệu/chất-lượng/test-strategy.md#ban-giao`.

## Câu hỏi hoặc blocker
Q-002 không chặn task này (chỉ làm FE và DB dev).
