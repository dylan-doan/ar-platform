# DEPLOY — URL cố định miễn phí (Render + Neon)

> Mục tiêu: thay tunnel `trycloudflare` (chết vặt, đổi URL) bằng URL cố định
> `*.onrender.com` — máy cá nhân tắt vẫn chạy, LIFF endpoint sửa **một lần cuối**.
> Toàn bộ artifacts đã sẵn: `render.yaml` + `deploy/*.Dockerfile` (đã build thử local).

## Tổng quan 3 bước (~15–20 phút)

```
① NEON (database)  →  ② GIT (đẩy code lên repo)  →  ③ RENDER (bấm Blueprint)
                                                        └→ ④ sửa LIFF endpoint lần cuối
```

---

## ① Neon — PostgreSQL + PostGIS miễn phí (~5 phút)

1. https://neon.tech → **Sign up** (GitHub/Google) → **Create project**
   - Name: `zoustec` · Region: Singapore (gần nhất)
2. Vào **SQL Editor**, chạy để bật PostGIS (migration cũng tự bật, chạy trước cho chắc):
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
3. Lấy **connection string** (nút Connect): dạng
   `postgresql://neondb_owner:MẬT_KHẨU@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
4. Chuẩn bị 2 biến cho bước ③ (đổi scheme sang `postgresql+asyncpg://` và `ssl=require`):
   - `DATABASE_URL`     = `postgresql+asyncpg://neondb_owner:MẬT_KHẨU@ep-xxx.../neondb?ssl=require`
   - `APP_DATABASE_URL` = `postgresql+asyncpg://zoustec_app:zoustec_app_password@ep-xxx.../neondb?ssl=require`
     (role `zoustec_app` do migration 0001 tự tạo với mật khẩu này — đổi mật khẩu
     production bằng `ALTER ROLE zoustec_app PASSWORD '...'` trong SQL Editor rồi cập nhật biến)

## ② Git — đẩy code lên GitHub/GitLab (~3 phút)

Repo local đã được commit sẵn. Tạo repo trống trên GitHub (hoặc GitLab) rồi:

```bash
cd "AR LINE Platform"
git remote add origin https://github.com/<user>/zoustec-ar-line.git
git push -u origin main
```

## ③ Render — bấm Blueprint (~7 phút)

1. https://render.com → Sign up (bằng chính GitHub/GitLab ở bước ②)
2. **New → Blueprint** → chọn repo `zoustec-ar-line` → Render đọc `render.yaml`,
   hiện 2 service: `zoustec-backend` + `zoustec-frontend`
3. Điền các env được hỏi (đã khai `sync: false`):
   | Service | Biến | Giá trị |
   |---|---|---|
   | backend | `DATABASE_URL` | từ bước ① |
   | backend | `APP_DATABASE_URL` | từ bước ① |
   | backend | `CORS_ORIGINS` | tạm điền `*`, sửa sau khi có URL frontend |
   | frontend | `BACKEND_INTERNAL_URL` | tạm điền `https://placeholder` — sửa ở bước 5 |
4. **Apply** → chờ backend build & live → copy URL backend
   (vd `https://zoustec-backend-ab12.onrender.com`) → mở `/healthz` phải thấy `{"status":"ok"}`
5. Vào service **frontend → Environment**:
   - `BACKEND_INTERNAL_URL` = URL backend vừa copy
   - đồng thời sửa backend `CORS_ORIGINS` = URL frontend (`https://zoustec-frontend-xxxx.onrender.com`)
   → **Save & redeploy** frontend (env này là build-arg nên cần rebuild)
6. Mở URL frontend → portal hiện, `/e/bnk/...` hiện website sự kiện ✓

## ④ LIFF endpoint — sửa LẦN CUỐI

LINE Developers Console → channel **Zoustec AR Dev** → tab LIFF → app → **Endpoint URL**:
```
https://zoustec-frontend-xxxx.onrender.com/
```
Từ giờ không bao giờ phải sửa nữa. Mọi link LIFF + QR đã in vẫn nguyên giá trị.

---

## Custom domain của khách hàng (vd vinh.concept.com)

1. Khách nhập domain trong `/dashboard/branding` (đã có UI)
2. Render dashboard → service frontend → **Settings → Custom Domains → Add** domain đó
   → Render chỉ dẫn khách tạo **CNAME** trỏ về `zoustec-frontend-xxxx.onrender.com`
   → Render tự cấp SSL (Let's Encrypt)
3. Vào `https://vinh.concept.com/` → middleware nhận Host → render website sự kiện của khách

> Ghi chú scale: mỗi domain khách thêm 1 lần trong Render dashboard (thao tác ~1 phút).
> Khi cần tự động hoàn toàn (khách tự bind không cần Zoustec đụng tay): chuyển frontend
> sang VPS + **Caddy on-demand TLS** (thiết kế sẵn — Caddy hỏi
> `GET /api/public/domains/{host}`, 200 thì tự xin cert). Đó là bước nâng cấp sau PoC.

## Giới hạn free tier cần biết

| Giới hạn | Ảnh hưởng | Đối sách |
|---|---|---|
| Service "ngủ" sau 15' không truy cập | Request đầu chậm ~30–60s | Chấp nhận cho PoC; hoặc cron ping 10'/lần; hoặc plan trả phí |
| **Disk ephemeral** — file upload (ảnh bìa, logo, GLB AI, .mind) **mất khi redeploy** | Demo asset trong repo không sao; file admin upload phải up lại sau mỗi lần deploy code | PoC: chấp nhận. Bước sau: chuyển media sang Cloudflare R2 (free 10GB) — tôi làm được khi cần |
| Neon free: 0.5GB, auto-suspend | Đủ thoải mái cho PoC | — |

## Sau khi live — checklist bàn giao

- [ ] `AUTH_DEV_MODE=false` trên backend khi demo chính thức cho khách (tắt dev-login)
- [ ] Đổi mật khẩu role `zoustec_app` (xem ①.4)
- [ ] Test lại 4 tiêu chí PoC trên URL mới bằng LINE thật
- [ ] Điền ma trận tương thích thiết bị (deliverable)
