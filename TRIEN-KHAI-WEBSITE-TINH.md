# Triển khai Website Tĩnh theo Version (2026-08-13)

> Hiện thực hóa `html_website_builder_deployment_platform.md` (và
> `website_builder_static_deployment_architecture.md`) trên stack thật của
> dự án: **FastAPI + Postgres (Neon) + Render free** — không có Nginx/S3
> riêng, disk ephemeral. Mọi khái niệm trong tài liệu đều được map tương
> đương (bảng dưới).

## 1. Mô hình

```
User tạo website trên platform (Builder / design JSON — giữ nguyên)
        ↓
POST /api/admin/events/{id}/site/generate
        → render design thành site tĩnh THẬT: index.html, {page}.html,
          css/style.css, js/site-config.js, js/main.js, assets/*
        → site_versions (source_type = generated), file lưu nguyên văn
        ↓
Preview  /sites/preview/{version_id}/          (UUID = token, chưa lên sóng)
Publish  POST .../site/versions/{vid}/publish  → events.site_version_id = vid
Serve    /sites/{tenant}/{event}/              (production)
        ↓
Download GET .../site/versions/{vid}/download  → website.zip
          (+ .website/manifest.json nhận diện project khi upload lại)
        ↓
User mở VS Code, sửa HTML/CSS/JS TỰ DO (kể cả <script> của họ)
        ↓
Upload   POST .../site/upload  → validate → version mới (user_upload),
          LƯU NGUYÊN VĂN — không dịch ngược về block (doc §26)
        ↓
Preview → Publish → version mới lên sóng. Publish version cũ = ROLLBACK.
```

Dữ liệu động (doc §17/§23): `js/main.js` fetch
`GET /api/public/site/{tenant}/{event}` kèm header `X-Site-Key` và cập nhật
mọi vùng đánh dấu `[data-zs]` (số task, ngưỡng集章, phần thưởng, danh sách
task, link LIFF). User xóa/di chuyển vùng nào thì vùng đó không cập nhật nữa
— API và data layer không đổi.

## 2. Map tài liệu → stack thật

| Tài liệu | Triển khai thật | Vì sao |
|---|---|---|
| Laravel + MySQL | FastAPI + Postgres (sẵn có) | không đổi stack |
| S3/MinIO lưu source | bảng `site_files` (bytea) | disk Render ephemeral; đúng pattern `media_assets`. Đổi sang R2/S3 sau nếu dung lượng lớn |
| Nginx + `releases/ + current symlink` | `site_versions` (immutable) + `events.site_version_id` (pointer) | flip pointer = 1 UPDATE — atomic, rollback tức thì, không rebuild |
| Deploy Service | không cần — publish là flip pointer | |
| `project_versions.source_path` | quan hệ `site_files.version_id` | |
| Project | = 1 event (site = website sự kiện) | tránh refactor rộng; nâng cấp sau nếu cần |
| Site API Key per project | key per-tenant sẵn có (`export_keys`, event_id NULL) nướng vào `js/site-config.js` | đã có sẵn hạ tầng cấp/thu hồi/reveal; per-event nâng cấp sau |
| preview.your-platform.com/{project}/{version} | `/sites/preview/{version_id}/` | UUID không đoán được = token |

## 3. Bảo mật (doc §11/§33)

- **Upload validate** (`backend/app/services/site_static.py`):
  path traversal (chuẩn hóa + cấm `..`), zip bomb (≤300 file, ≤10MB/file,
  ≤40MB tổng — đọc byte THẬT chứ không tin header), whitelist extension
  tĩnh (`.html .css .js .json .svg .png .jpg .jpeg .webp .gif .ico .woff
  .woff2 .txt`), bắt buộc `index.html`, manifest sai project → 422.
  Tự bóc 1 lớp thư mục bọc ngoài (zip cả folder vẫn nhận).
- **Origin isolation**: site upload chứa JS tùy ý của user, được serve
  **nguyên văn**. Mọi response HTML từ `/sites/...` mang CSP
  `sandbox allow-scripts allow-forms allow-popups allow-modals` — trang chạy
  trong opaque origin: script chạy được, fetch public API được (CORS `*`),
  nhưng KHÔNG đụng được localStorage/cookie của origin dashboard (kể cả khi
  đi qua proxy `/sites` trên frontend). Đây là điều kiện để dám serve JS
  của khách trên hạ tầng chung.
- **Site Key = public identifier, không phải secret** (doc §19): chỉ đọc
  public API. CORS public (`PublicReadCors`) mở thêm đúng 1 header
  `X-Site-Key` cho preflight; `X-Export-Key`/Authorization vẫn bị chặn
  cross-origin như cũ.
- **Version immutable + audit**: mọi generate/upload/publish/delete ghi
  `audit_logs`; version đang online không xóa được (409).
- **RLS**: `site_versions`/`site_files` có tenant RLS như mọi bảng khác
  (migration 0012).

## 4. Code cũ đã gỡ (đi ngược doc §26)

- `GET/PUT /api/admin/events/{id}/design/html` — luồng "HTML dịch ngược về
  design JSON" (sanitize + mất `<script>`). Thay bằng luồng version ở trên.
- `backend/app/services/site_html.py` xóa; sanitizer tách ra
  `app/services/html_sanitizer.py` (Builder Mode vẫn dùng cho `HtmlBlock`).
- **Giữ nguyên**: design JSON lifecycle (draft/preview/publish), site-preview
  tool, export Next.js (`/api/export-nextjs` — offering tự host riêng),
  SSR `/e/{tenant}/{event}` (site không publish tĩnh vẫn chạy như cũ).

## 5. File đụng đến

Backend: `app/models/site.py` (mới), `app/models/event.py`,
`alembic/versions/0012_site_versions.py` (mới), `app/services/site_static.py`
(mới), `app/services/html_sanitizer.py` (mới), `app/api/sites.py` (mới),
`app/api/admin.py` (section 靜態網站 + refactor `_tenant_site_key`),
`app/main.py` (router + CORS header).
Frontend: `next.config.mjs` (proxy `/sites`),
`app/admin/builder/design/page.jsx` (panel 靜態網站: 產生/上傳/預覽/上線/
下載, danh sách version, rollback).
Tests: `tests/nodb/test_site_static.py`, `tests/test_site_versions_api.py`
(mới); test luồng cũ đã xóa. **116/116 pass.**

## 6. Chưa làm (nâng cấp sau)

- Custom domain trỏ thẳng vào site tĩnh (hiện domain khách vẫn vào SSR
  `/e/...`; muốn chuyển: middleware frontend rewrite Host → `/sites/...`).
- Site Key per-event + ràng buộc key↔domain (doc §22), rate limit.
- Theme catalog riêng cho site tĩnh (hiện dùng template/theme của Builder).
- Chuyển `site_files` sang R2/S3 khi dung lượng lớn.
