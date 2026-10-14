# ADR-002 — Stack: FE HTML/CSS/JS thuần, BE Node.js + Express, SQL Server, REST + Socket.io

- **Trạng thái:** ACCEPTED
- **Ngày quyết định:** 14/10/2026 (D-4, chủ dự án). Phần Express/`mssql`/`zod` theo đề xuất của tài liệu nguồn, áp dụng khi triển khai cùng ngày.
- **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md`, bảng "Thay đổi so với demo.docx" (D-4), mục 10, Q-002
- **Câu hỏi đóng:** Q-002

## Quyết định

| Lớp | Chọn |
| --- | --- |
| Front-end | HTML5 + CSS3 + JavaScript (ES modules), **không framework, không bước build**. Mỗi màn hình một file HTML; dùng chung `api.js`, `socket.js`, `ui.js`, `cart.js`, `auth.js`, `print.js` |
| Back-end | Node.js (máy dev: v24) + **Express 5** (REST API, serve FE tĩnh, route trang sạch) |
| Database | SQL Server, driver `mssql` (tedious) gọi stored procedure + TVP |
| Realtime | Socket.io 4 (server gắn vào cùng HTTP server; client nạp `/socket.io/socket.io.js`) |
| Validation / bảo mật | `zod`, `jsonwebtoken`, `bcryptjs` (thuần JS, khỏi phải build native trên Windows), `helmet`, `express-rate-limit`, `cookie-parser` |
| Test | Test runner có sẵn của Node (`node --test`) + `supertest` + `socket.io-client`, integration test trên SQL Server thật. Không dùng Jest vì code là ES modules (Jest cần cờ thử nghiệm) |
| Env | `node --env-file=.env` (có sẵn trong Node), không cần `dotenv` |

## Phương án đã cân nhắc

- Next.js (Word ghi) / C# + SignalR: bị loại theo D-4.
- NestJS: bị loại vì nhiều boilerplate. Tầng `routes → services → repositories` được giữ bằng cấu trúc thư mục và review.

## Hệ quả

- Chỉ chạy một tiến trình Node (API + FE tĩnh + Socket.io) cộng một SQL Server; chạy được trong LAN của quán.
- Rules: không tự thêm React/Vue/Next/jQuery/Bootstrap.
- Biểu đồ báo cáo vẽ bằng SVG tự viết, không cần Chart.js.
