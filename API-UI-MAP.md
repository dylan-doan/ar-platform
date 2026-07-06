# API ↔ UI Map — Zoustec AR LINE Platform

> Backend: `backend/` (FastAPI, port từ `AR platform/` — 62/62 tests pass).
> Frontend: `nextjs-zoustec/` (UI mới, đang là mockup tĩnh — nối API theo bảng dưới).
> Chạy dev: `docker compose -f deploy/docker-compose.yml up -d db` →
> `cd backend && .venv/bin/uvicorn app.main:app --port 8000` →
> `cd nextjs-zoustec && npm run dev`.

## Đăng nhập dev (AUTH_DEV_MODE=true)

| Vai trò | Cách login |
|---|---|
| End user | `POST /api/auth/line` `{id_token: "dev::<id>::<Tên>", tenant_slug: "taipei"}` |
| Tenant admin | id_token `dev::admin-taipei::Taipei Admin` (taipei) / `dev::admin-mall::Mall Admin` (riverside-mall) |
| Platform admin | `POST /api/auth/platform` `{id_token: "dev::platform-boss::Boss"}` |

## Bản đồ màn hình → endpoint

| Màn UI (nextjs-zoustec) | Endpoint | Trạng thái |
|---|---|---|
| **01 `/dashboard`** KPI + line chart + donut + bảng sự kiện | `GET /api/admin/overview?days=14\|30\|90` — kpis / daily / methods / events | ✅ **mới thêm** |
| 01 chi tiết 1 sự kiện | `GET /api/admin/events/{id}/stats` | ✅ có sẵn |
| **02 `/builder/new`** wizard tạo sự kiện | `POST /api/admin/events` (slug, name, event_type: city\|hiking\|shopping, config) | ✅ có sẵn |
| **02 `/builder`** editor block + tasks | `PATCH /api/admin/events/{id}` (config JSONB = content blocks) · tasks CRUD `GET/POST /api/admin/events/{id}/tasks`, `PATCH/DELETE /api/admin/tasks/{id}` | ✅ có sẵn |
| 02 xuất template | `POST /api/admin/events/{id}/export-bundle` · export-keys list/revoke | ✅ có sẵn |
| **03 `/ar-studio`** | `POST/GET /api/model3d/jobs`, `GET/PATCH/DELETE /api/model3d/jobs/{id}` (engine: mock \| meshy) | ✅ có sẵn |
| **04 `/experience/*`** login→map→ar→rewards | `POST /api/auth/line` · `GET /api/me/events` · `GET /api/me/events/{id}/tasks` · `POST /api/me/tasks/{id}/complete` (`{qr_code}` / `{lat,lng}`) · `GET /api/me/events/{id}/progress` | ✅ có sẵn |
| **05 `/console`** KPI + bar chart + plans + bảng khách | `GET /api/platform/overview?months=6` — tenants / totals / plans / monthly | ✅ **mở rộng** (thêm plan+mrr_ntd: migration 0004, PATCH tenants nhận `plan`, `mrr_ntd`) |
| 05 quản lý tenant | `GET/POST /api/platform/tenants`, `PATCH /api/platform/tenants/{id}` | ✅ có sẵn |
| **06 `/` (portal — trang chủ; `/portal` redirect về `/`)** danh sách sự kiện công khai | `GET /api/public/events[?event_type=city\|hiking\|shopping]` | ✅ **mới thêm** |
| Branding pre-login (white-label) | `GET /api/public/tenants/{slug}/branding` · `GET /api/public/domains/{domain}` | ✅ có sẵn |

## Ghi chú thiết kế

- **`/api/admin/overview` & `/api/platform/overview` trả dict tổng hợp 1 round-trip** — mỗi màn dashboard chỉ cần 1 request.
- **Donut "phân bố loại nhiệm vụ"** = completions theo `stamps.method` (qr/gps/hybrid).
- **Bar chart console** = stamps/tháng (proxy hoạt động — v1 không track pageview).
- **MRR/plan** quản lý tay bởi platform admin (chưa có billing engine — spec §XI ghi nhận).
- **Portal endpoint** dùng RLS scope platform-admin phía server (read-only, chỉ field công khai).
- Việc còn lại phía frontend: API client + auth (JWT vào cookie/localStorage), nối từng màn, LIFF SDK + AR engine (MindAR — port từ `AR platform/frontend/src/components/ar/`).
