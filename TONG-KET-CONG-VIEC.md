# Tổng kết công việc — Zoustec AR Stamp Platform

> File này để mở đầu session làm việc mới: trạng thái hiện tại, những gì đã
> làm, còn gì chưa làm, và các "bẫy" đã biết. Cập nhật lần cuối: **2026-07-07**.
>
> Tài liệu chi tiết đi kèm: [TONG-QUAN-DU-AN.md](TONG-QUAN-DU-AN.md) (kiến trúc
> + nghiệp vụ), [CUSTOM-DOMAIN.md](CUSTOM-DOMAIN.md) (phương pháp white-label
> domain), [API-UI-MAP.md](API-UI-MAP.md) (map màn hình ↔ API),
> [DEPLOY.md](DEPLOY.md) (hướng dẫn deploy + checklist bàn giao).

---

## 1. Trạng thái production (đang SỐNG, đã nghiệm thu 7/7)

| Thành phần | Giá trị |
|---|---|
| Frontend | https://zoustec-frontend.onrender.com — Render free, **region Singapore** |
| Backend | https://zoustec-backend.onrender.com — Render free, **region Singapore** |
| Database | Neon free (ap-southeast-1 Singapore) — PostGIS + RLS, endpoint `ep-square-union-aoeiguy7.c-2` (**direct, không -pooler**) |
| Custom domain demo | https://vinh-bnk.mooo.com → website tenant `bnk` (FreeDNS, A record `216.24.57.1`) |
| LIFF | ID `2010613964-3UzmddVV`, channel `2010613964`, Endpoint URL = frontend root |
| LIFF permalink | https://liff.line.me/2010613964-3UzmddVV |
| GitHub | git@github-work:ducdoanbnk/ar-platform.git (SSH alias `github-work`) |
| Deploy | Render Blueprint (`render.yaml`) — push main = auto deploy cả 2 service |
| Hiệu năng đo được | API có DB ~0.2–0.45s (trước khi chuyển region: 1.5–2.7s) |
| Tests backend | 66/66 (`backend && .venv/bin/python -m pytest tests/ -q`, cần Docker db-test port 5434) |

3 tenant seed: `taipei` (#0ea5e9) / `riverside-mall` (#f59e0b) / `bnk` (#dc2626 —
account LINE thật của Đức là tenant_admin). Dev admin: `admin-bnk`,
`admin-taipei`, `admin-mall`, `platform-boss` (AUTH_DEV_MODE=true còn bật).

## 2. Những gì đã hoàn thành (toàn hành trình)

1. **UI**: chuyển mockup HTML tĩnh → Next.js 14 App Router (inline styles),
   full-screen responsive, 7+ màn: portal, experience (login/map/AR/stamps/
   rewards), dashboard, builder, ar-studio, console, members, branding.
2. **Backend port**: FastAPI + SQLAlchemy async + PostGIS, multi-tenant RLS
   (FORCE + GUC `app.tenant_id`, role `zoustec_app`), JWT tenant-scoped,
   LINE OIDC + dev mode, migration/seed tự chạy khi khởi động.
3. **LINE LIFF end-to-end trên LINE thật**: login người chơi + login admin
   (2 phiên độc lập tenant/platform), QR = URL-token qua LIFF permalink,
   OAuth return xử lý ở root (LiffOAuthCompleter + guard code/state).
4. **AR**: MindAR + three.js (getUserMedia, KHÔNG WebXR — ràng buộc iOS LINE),
   AR Studio: upload ảnh → job AI-3D (mock engine, seam chờ engine Zoustec)
   → preview GLB → compile .mind ngay trên trình duyệt → gắn vào task.
5. **Spec §VII/§VIII khép kín**: sections theo loại sự kiện (city/hiking/
   shopping), upload ảnh hero, branding end-to-end (1 màu → palette 5 shade,
   CSS vars), website sự kiện SSR `/e/{tenant}/{event}`, custom domain
   tự phục vụ ở `/dashboard/branding` + middleware Host→tenant.
6. **Deploy production**: Render Blueprint + Neon, PoC 4/4 nghiệm thu bằng
   LINE thật trên URL vĩnh viễn.
7. **Custom domain chạy thật** (session 2026-07-07): FreeDNS `vinh-bnk.mooo.com`
   (A record vì FreeDNS free khóa CNAME) → Render custom domain (TLS tự cấp)
   → branding lưu domain → middleware rewrite → website BnK, URL giữ domain khách.

## 3. Session 2026-07-07 — việc đã làm (commit `64aabfe`…`3f240ac`)

| Commit | Nội dung |
|---|---|
| `64aabfe` | CTA website sự kiện dùng **LIFF permalink** — login LINE hoạt động từ custom domain (link tương đối làm redirectUri lọt ngoài scope LIFF → 400) |
| `84b8381` | Form branding **tự chuẩn hóa domain** (paste `https://…/` vẫn lưu — trước đó 422 pattern mismatch) |
| `896bd46` | Viết CUSTOM-DOMAIN.md (phương pháp + quyết định thiết kế + nâng cấp SaaS) |
| `3e53ae7` | **2 bug fix lớn**: (1) GET /api/admin/branding thiếu `custom_domain` → form rỗng khi reload; (2) **media chuyển vào DB** — bảng `media_assets` (bytea, RLS, migration 0005), serve tại `/media/db/{id}` cache immutable. Lý do: disk Render free là ephemeral (redeploy/ngủ-dậy là mất file hero/logo/.mind). +2 test hồi quy (66/66) |
| `3f240ac` | **Chuyển region Oregon → Singapore** (render.yaml `region: singapore`). Region là immutable → đã XÓA 2 service và Manual Sync Blueprint tạo lại; env `sync:false` nhập tay lại; gắn lại custom domain. Kết quả: 1 query DB từ +1.4s → ~0ms; API nhanh gấp ~12 lần |

Chẩn đoán đáng nhớ: "BE load chập" = 3 tầng — (1) lệch region Render↔Neon
(nặng nhất, đã sửa), (2) cold start free tier (chưa sửa — xem mục 5),
(3) thiếu loading UX (chưa làm).

## 4. Kiến trúc — điểm không được quên

- **RLS pinned connection**: `_guc_session()` trong `backend/app/db/session.py`
  ghim 1 connection suốt phiên (pool hopping sau commit làm mất GUC → RLS ẩn
  sạch dữ liệu). Đừng thay bằng session pool thường.
- **LIFF Endpoint = site root** `/`: mọi redirectUri phải nằm trong scope này.
  Root page có `forwardLiffDeepLink` — GUARD `if (code && state) return` là
  sống còn (từng gây kẹt login vòng lặp).
- **Link vào experience từ mọi nơi**: dùng LIFF permalink
  `https://liff.line.me/{id}/path?query`, không dùng link tương đối.
- **Media**: từ 0005 mọi upload vào bảng `media_assets`, URL `/media/db/{id}`.
  `/media/*` còn lại là static (GLB demo nằm trong image). Đừng ghi file mới
  vào disk.
- **Neon**: bắt buộc endpoint direct (không `-pooler` — PgBouncer phá GUC/RLS),
  chuỗi `postgresql+asyncpg://…?ssl=require` (asyncpg không nhận
  `channel_binding`/`sslmode`).
- **Middleware custom domain**: chỉ chạy trên `/`, cache 60s (cả kết quả rỗng),
  fail-open về portal. Host platform (onrender/localhost/trycloudflare/vercel)
  bỏ qua.
- **NEXT_PUBLIC_* + BACKEND_INTERNAL_URL nướng lúc BUILD** (Docker ARG→ENV):
  đổi biến trên Render phải "Save, rebuild, and deploy", restart không ăn.
- **Render Blueprint**: biến `sync:false` KHÔNG được tạo khi sync tạo service
  mới → phải Add variable tay (backup 4 biến trong
  `scratchpad/render-env-backup.txt` phiên cũ hoặc DEPLOY.md).

## 5. Chưa làm / tùy chọn (theo độ ưu tiên)

1. **Re-upload ảnh hero BnK** qua /builder trên production (URL cũ trỏ disk đã
   chết; ảnh mới sẽ vào DB — vĩnh viễn). Logo tương tự nếu từng up.
2. **Keep-alive chống cold start**: cron-job.org (free) ping
   `GET /readyz` (backend) + `GET /` (frontend) mỗi 5–10 phút, GIỚI HẠN khung
   07–21h để không vượt 750 giờ free/tháng của Render.
3. **Loading UX**: thông báo "伺服器喚醒中…" khi request >4s (sửa tập trung ở
   `lib/admin-client.js` + `lib/liff-client.js`), thêm `loading.js` skeleton
   cho route `/e/`.
4. **Bàn giao chính thức**: tắt `AUTH_DEV_MODE`; **đổi password Neon**
   (`npg_Wp3ivO5HtJBz` đã lộ trong chat) + password role `zoustec_app`;
   điền ma trận tương thích thiết bị (test LINE thật iOS/Android trên prod).
5. Nâng cấp SaaS (đã ghi trong CUSTOM-DOMAIN.md): tự động khai báo domain qua
   Render API, xác minh sở hữu domain bằng TXT, wildcard `{slug}.zoustec.app`,
   LIFF channel riêng từng tenant.
6. Khác: nút "新增客戶" trên console (hiện tạo tenant qua API), media sang
   Cloudflare R2 khi dung lượng lớn, Meshy API key cho AI-3D thật, share-links
   panel trong builder.

## 6. Chạy local

```bash
# DB (Docker, project zoustec-ar-line): port 5433 dev / 5434 test
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000  # Python 3.12 (uv)
cd nextjs-zoustec && npm run dev                                   # port 3000
cd backend && .venv/bin/python -m pytest tests/ -q                 # 66 tests
```

Biến môi trường mẫu: xem `render.yaml` + DEPLOY.md. Dev login: nhập
`admin-bnk` / `platform-boss` ở /admin/login (chế độ dev).
