# Kiến trúc hệ thống

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §9 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

## 9.1. Thành phần và trách nhiệm

```
┌──────────────────────┐   HTTPS/JSON    ┌─────────────────────────────┐   TDS    ┌───────────────┐
│  HTML/CSS/JS thuần   │ ◄─────────────► │  Node.js (Express) REST API │ ◄──────► │  SQL Server   │
│  /t/{qr}  khách      │   WebSocket     │  + Socket.io hub            │          │  Tables, SP   │
│  /pos     quầy       │ ◄─────────────► │  (cũng serve file tĩnh FE)  │          │  Transactions │
│  /pos/takeaway       │                 └─────────────────────────────┘          └───────────────┘
│  /admin   quản lý    │
└──────────────────────┘
        │ window.print()
   ┌────────────┐
   │ Máy in nhiệt│        Không có dịch vụ thanh toán bên ngoài (D-1). Toàn bộ hệ thống có thể chạy
   └────────────┘        trong LAN quán hoặc trên Internet (Q-008); không cần URL công khai cho webhook.
```

| Thành phần | Trách nhiệm | Không làm |
| --- | --- | --- |
| **Frontend HTML/CSS/JS thuần** (D-4; 3 khu vực: `/t/*` khách, `/pos/*` quầy, `/admin/*` quản lý — mỗi khu vực một bộ trang HTML + module JS dùng chung `api.js`, `socket.js`, `ui.js`) | Render UI bằng DOM API/template, giữ giỏ hàng (localStorage), gọi REST API bằng `fetch`, subscribe Socket.io, trang in | Không tính tiền, không quyết định kho, không kiểm quyền "thật" |
| **Backend API** | Xác thực/phân quyền, validate input, điều phối use case, gọi SP, phát sự kiện realtime | Không chứa logic trừ kho bằng "đọc rồi ghi" ngoài transaction |
| **Realtime hub** (trong cùng process backend) | Quản lý kết nối, room `staff` và `session:{id}`, broadcast | Không phải nguồn sự thật; không lưu trạng thái |
| **SQL Server** | Lưu dữ liệu; **giữ invariant kho** bằng SP + transaction + row-lock + CHECK constraint | — |

## 9.2. Phân tầng backend và hướng phụ thuộc

Áp dụng **phân tầng đơn giản** (không cần Clean Architecture đầy đủ cho đồ án 8 tuần — PROPOSED):

```
HTTP/WS adapter (controllers, hubs, DTO, auth guard)
        │  gọi
        ▼
Application services (use case: SubmitOrder, AcceptOrder, CompleteOrder, RequestPayment, SettleSession, …)
        │  gọi
        ▼
Repositories / DB access (gọi SP, query) ──► SQL Server
        │
Integrations (RealtimePublisher, ReceiptRenderer) ◄── được Application gọi qua interface
```

Quy tắc:
- Controller **không** gọi DB trực tiếp; chỉ parse request, gọi service, map lỗi → HTTP status.
- Service **không** biết HTTP; ném lỗi nghiệp vụ có mã (`OUT_OF_STOCK`, `ALREADY_PROCESSED`, …).
- Mọi thao tác **đổi trạng thái đơn + kho** đi qua SP hoặc một transaction duy nhất; không "SELECT rồi UPDATE" tách rời.
- Realtime được phát **sau khi commit** (không phát trong transaction).
- Một thư mục theo module: `orders/`, `sessions/`, `payments/`, `inventory/`, `menu/`, `auth/`, `reports/`, `realtime/` — khớp 5 module trong Word.
- Express **serve FE tĩnh** từ `ứng-dụng/giao-diện/public` và có route trang sạch (`GET /t/:qrToken` → `t/index.html`, `GET /pos` → `pos/index.html`); mọi dữ liệu đi qua `/api/*` dạng JSON — FE không nhúng dữ liệu server-side.
- FE là **ứng dụng nhiều trang** (mỗi màn hình một HTML); state dùng chung (token nhân viên, `sessionId`/`clientToken` khách, giỏ hàng) lưu `localStorage`/cookie; không cần router phía client.

## 9.3. Mapping module Word → thành phần code

| Module Word | Backend module | Frontend khu vực | SP |
| --- | --- | --- | --- |
| 1. Đặt món & định danh | `sessions`, `orders` | `/t/*`, `/pos/takeaway` (D-3) | `sp_SubmitOrder` |
| 2. Thanh toán (D-1/D-2: gọi thanh toán + thu tiền mặt + in bill) | `payments` (request-payment, settle, receipt) | `/t/*` nút Gọi thanh toán, `/pos` drawer Thu tiền bàn, `/pos/sessions/*/receipt` | `sp_SettleSession` |
| 3. Vận hành & realtime | `realtime`, `orders` | `/pos` | `sp_CompleteOrder` |
| 4. Kho & BOM | `inventory`, `menu` (BOM) | `/admin/ingredients`, `/admin/menu/[id]/bom` | `sp_SubmitOrder`, `sp_CompleteOrder`, `sp_CancelOrder` |
| 5. Quản trị & báo cáo | `auth`, `users`, `reports`, `menu`, `tables` | `/admin/*` | — |
