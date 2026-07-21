# Tổng kết công việc — Zoustec AR Stamp Platform

> File này để mở đầu session làm việc mới: trạng thái hiện tại, những gì đã
> làm, còn gì chưa làm, và các "bẫy" đã biết. Cập nhật lần cuối: **2026-07-09**.
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
| LIFF (platform, dùng chung) | ID `2010613964-3UzmddVV`, channel `2010613964`, Endpoint = frontend root |
| LIFF riêng BnK (white-label) | ID `2010638570-ZXXAqde5`, channel `2010638570`, Endpoint = `https://vinh-bnk.mooo.com/` — đã chạy thật trong LINE |
| Console Zoustec | `/zoustec/console` — login email/password tại `/zoustec/login` (`admin@zoustec.tw` + env `PLATFORM_ADMIN_PASSWORD`; dev fallback `platform-boss`) |
| LIFF permalink | https://liff.line.me/2010613964-3UzmddVV |
| GitHub | git@github-work:dylan-doan/ar-platform.git (SSH alias `github-work`) |
| Deploy | Render Blueprint (`render.yaml`) — push main = auto deploy cả 2 service |
| Hiệu năng đo được | API có DB ~0.2–0.45s (trước khi chuyển region: 1.5–2.7s) |
| Tests backend | 70/70 (`backend && .venv/bin/python -m pytest tests/ -q`, cần Docker db-test port 5434 — Docker Desktop phải bật) |

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
   tự phục vụ ở `/admin/dashboard/branding` + middleware Host→tenant.
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

Ngoài ra (sau `3f240ac`): **mọi trang quản trị dời vào `/admin/*`** —
`/admin/dashboard` (+`/branding`, `/members`), `/admin/builder` (+`/new`),
`/admin/ar-studio`, `/admin/console`. URL cũ (bookmark, liff.state cũ) vẫn
sống nhờ redirect 307 trong `next.config.mjs`. Sidebar admin thống nhất:
builder + ar-studio bọc trong `AdminShell` (có sidebar, không còn "trang lạ"),
AR Studio thành mục menu thật; bỏ 3 mục chết (任務與集章/報表/設定 — trỏ trùng
màn khác). CSS `.app-main > .editor-shell` cho editor lồng trong shell.

**Multi-event trên domain khách** (spec không định nghĩa — đã chốt theo PRD
§6.2 tenant resolver): trang gốc domain theo `brand_config.home_mode` —
`auto` (1 sự kiện vào thẳng, ≥2 hiện trang tổng quan `TenantLanding`),
`list` (luôn tổng quan), `event` + `home_event_slug` (ghim 1 sự kiện, chọn ở
品牌與網域 → 首頁顯示). Kèm URL trắng nhãn `/{event-slug}` trên domain khách
(middleware rewrite → `/e/{tenant}/{slug}`). Chi tiết: CUSTOM-DOMAIN.md §4b.
Tests: 67/67.

## 3b. Session 2026-07-08 — việc đã làm (commit `766ec06`…`a5410d0`)

| Commit | Nội dung |
|---|---|
| `766ec06` | **Luồng AR 2 bước**: nhiệm vụ QR/hybrid vào từ map đi qua màn quét QR in-app (getUserMedia + `jsqr` — scanCodeV2 không ổn định mọi client) rồi mới tới AR; quét nhầm standee trạm khác → tự chuyển nhiệm vụ; mã sai khi chụp → quay lại bước quét. Deep-link `?qr=` bỏ qua bước 1. Xóa thanh demo 1-2-3-4; màn login lấy banner hero của khách (fix đọc `config.heroImage` vs `hero_image` phẳng) |
| `3d9864c` | **LIFF riêng theo tenant** (white-label trọn trong LINE): backend verify id_token thử channel tenant (suy từ tiền tố LIFF ID) → fallback channel platform (admin vẫn login app chung); client `resolveLiffId(tenant?)` tra branding → host → fallback; CTA/QR builder dùng LIFF ID tenant (kèm vá QR ghi cứng env slug). **Đã nghiệm thu thật với channel BnK** |
| `741650c` | **Console dời `/admin/console` → `/zoustec/console`** + login **email/password** tại `/zoustec/login` (bảng platform_admins thêm email/password_hash — scrypt stdlib, migration 0006; account seed/rotate từ env `PLATFORM_ADMIN_EMAIL`/`PASSWORD` mỗi lần khởi động). `/admin/login` chỉ còn cho khách; redirect URL cũ |
| `2aeca0e` | Deliverable spec mục 5: đánh giá tự động hóa LIFF — tạo channel ❌ không có API (thủ công), LIFF app ✅ LIFF Server API (ghi vào CUSTOM-DOMAIN.md) |
| `a5410d0` | **Nút 自動建立 LIFF** trong console: `POST /api/platform/tenants/{id}/liff` — phát hành channel access token (v3 fallback v2) từ Channel ID + Secret (cột `line_channel_secret`, migration 0007, không bao giờ trả ra ngoài) → tạo LIFF app endpoint = custom domain, hoặc cập nhật endpoint app hiện có khi khách đổi domain |
| `832d66e` | Console Zoustec: bỏ menu chết (客戶/全平台活動/流量/營收/設定 — chưa có màn), 入口網站 thành link thật → /portal, bottom nav mobile thêm 登出; dọn chuông/篩選/dropdown giả |
| `14b8349` | **Chuẩn hóa ngôn ngữ toàn code**: comment tiếng Việt → tiếng Anh (~46 chỗ); mọi message lỗi user-facing (55 ApiError backend + admin-client) → tiếng Trung phồn thể; `error.code` giữ tiếng Anh. QUY TẮC từ nay: comment = EN, text/lỗi hiển thị = zh-TW, docs .md = VI |
| `c995f5b` | **Chốt quy trình channel trọn gói** (CUSTOM-DOMAIN.md): khách KHÔNG phải tự tạo channel — Zoustec tạo hộ từ account mình, **mỗi khách 1 provider riêng đặt tên khách** (quy định LINE TW cho integrator; userId cấp theo provider, channel không chuyển provider được); khách có OA riêng thì mời Zoustec làm Admin provider của họ. Không mâu thuẫn spec (§III.4 chỉ đòi quy trình cho người không phải kỹ sư) |
| `7493047` | **Admin khách bỏ LINE login → email/password** (spec chỉ bắt LINE cho người chơi): console cấp tài khoản từ modal 白標設定 (mật khẩu tạm hiện 1 lần, bắt đổi lần đầu — token giữ memory tới khi đổi xong), nút 新增客戶 tạo tenant; migration 0008 (members.email/password_hash/must_change_password); /admin/login thành form email/password (dev-mode giữ). Tests 71/71 |
| `4764d29` | Fix UX console: 自動建立 LIFF tự lưu form trước khi gọi API (hết 422 khó hiểu); validate slug phía client. Đã wipe data prod (giữ platform_admins) để test lại từ đầu |
| `7fe9d95` | **Xây lại AR Studio thành pipeline 4 bước**: ① ảnh 2D gốc (= ảnh in nhận diện tại hiện trường — nút 開啟/列印/下載, hướng dẫn test) ② AI sinh 3D ③ compile .mind + nút 重新編譯 ④ chỉ định vào nhiệm vụ. **Ảnh gốc chuyển vào DB** (media_assets — trước đây nằm disk ephemeral, redeploy là mất; bug sót từ 3e53ae7); xóa job dọn luôn media. Thumbnail + kéo-thả |
| `bf1f3a1`→`db17d0b` | **Meshy chạy thật trên prod** (user set env `MODEL3D_PROVIDER=meshy` + `MESHY_API_KEY`, ~1100 credits): fix dropdown 3D tụt về demo (mock URL giờ có `?m=` riêng từng job, builder khớp job trước demo); ô đổi tên job; box texture prompt khi upload; GlbPreview+ARStage phát animation GLB (AnimationMixer); bước ④ hiện ✓ kèm danh sách nhiệm vụ đang dùng model |
| `f271c87` | **Sinh động tác trong hệ thống**: provider seam thêm rigging (Meshy auto-rig `input_task_id`, ~5 credits) → tải GLB walk/run vào DB → `params.variants`; POST `/jobs/{id}/animate`, PATCH `{variant}` đổi static/walk/run; UI mục 動作 với 3 chip. Chỉ hợp model dạng người có texture |
| `add9f86` | **Fix GLB engine 404 sau redeploy** (GLB Meshy nằm disk ephemeral → chuyển vào media_assets DB, provider trả URL gốc để service tải) + **材質描述 theo từng model**: sửa mô tả + 依描述重新生成材質 (Meshy Retexture, ~10 credits, giữ hình đổi bề mặt, xóa rig cũ, provider_job_id trỏ sang retexture task) |

Nghiệm thu trong session: hệ thống AR 2 bước chạy thật trên LINE iOS; BnK
white-label trọn vẹn (domain riêng + LINE channel riêng, header LIFF hiện
`vinh-bnk.mooo.com`); console tách cửa Zoustec.

**Chẩn đoán "sập" trên free tier** (giải thích cho user 2 lần): (1) mỗi lần
push = Render free dừng bản cũ rồi mới build bản mới → **cửa sổ chết 1–3
phút mỗi deploy** (không zero-downtime); (2) cold start 30–60s sau 15 phút
vắng; (3) đừng quên Render có lịch bảo trì công bố trên banner dashboard.
→ Khi demo: gom thay đổi push 1 lần; thương mại: Render Starter ~7 USD/service.

Chẩn đoán đáng nhớ: "BE load chập" = 3 tầng — (1) lệch region Render↔Neon
(nặng nhất, đã sửa), (2) cold start free tier (chưa sửa — xem mục 5),
(3) thiếu loading UX (chưa làm).

## 3c. Session 2026-07-09 — việc đã làm (commit `2c91463`…`4f109ed`)

Session sửa UX/nghiệp vụ 3 màn quản trị. Không đổi schema/migration.

| Commit | Nội dung |
|---|---|
| `2c91463` | **AR Studio — 3 việc**: (1) **Rig 422/400 báo dễ hiểu**: payload/path Meshy `/rigging` VỐN ĐÚNG theo docs — 422 = model không phải nhân vật người hợp lệ (pose estimation failed), 400 = input task hết hạn (Meshy xóa task sau 3 ngày). Thêm `RiggingError`, map 2 mã thành câu zh-TW, `run_rigging_job` lưu nguyên văn vào `rig.error` (không còn `submit failed: ...` thô). (2) **GLB 404 job cũ**: job tạo trước `add9f86` lưu GLB ra disk ephemeral → redeploy mất → preview trống im lặng. `GlbPreview` thêm `onError`; AR Studio hiện cảnh báo "3D檔已遺失" + nút xóa nhanh. Job mới (GLB trong DB) không bị. (3) **Builder**: gỡ thanh stepper 1-2-3 (範本／內容／匯出) hardcode tĩnh gây hiểu nhầm "mãi không active" |
| `04016e6` | **Dashboard 完成率 + builder chặn ngưỡng**: 完成率 cũ = `rewards_unlocked/participants` → luôn 0% khi 集章門檻 > số nhiệm vụ (reward không bao giờ mở khóa). Đổi thành `total_stamps / Σ(participants_of_event × tasks_of_event)` = tỷ lệ lượt nhiệm vụ thực sự hoàn thành, độc lập ngưỡng, luôn ≤100% (2 thừa số đều DISTINCT nên không fan-out bởi join Task×Stamp). Builder: ô 集章門檻 thêm `max`=số nhiệm vụ, cảnh báo vàng khi vượt, tự clamp khi lưu. Tests +1 assert (73/73) |
| `4f109ed` | **Builder khóa AR 目標圖 theo model**: GLB + target là 1 cặp (cùng sinh từ 1 ảnh 2D ở AR Studio) → bỏ dropdown chọn target riêng (ngăn ghép mesh model A + marker model B). Chọn model → target tự bám, hiện read-only "已與上方模型配對"; model AI chưa compile target → cảnh báo + **chặn lưu**; demo→target demo; custom→vẫn cho nhập .mind URL. `selectTask` tái ghép target theo model khi mở task cũ lệch |
| `03da578` | **Deliverable tương thích LIFF+WebAR** (spec Giai đoạn 1 mục 1): trang **`/diag`** đo tự động (camera latency, MindAR FPS 8s, WebGL/WebXR caps, tự chấm 達成/未達成, nút copy kết quả — mở LIFF permalink `/diag` trên máy nào là điền được ma trận máy đó); **fix nút mở trình duyệt ngoài** — `openExternalBrowser=1` KHÔNG có tác dụng trên LIFF app (docs LINE) → ARStage chuyển sang `liff.openWindow({external:true})`. Kèm **BAO-CAO-TUONG-THICH-LIFF-WEBAR.md**: benchmark đo được (M4 72fps / throttle 4x 40fps / 6x 28fps), ma trận thiết bị (còn thiếu Android thật — ưu tiên 1 iPhone đời thấp + 1 Android tầm trung), chiến lược khuyến nghị Ở LẠI TRONG LIFF, đáp án chính thức: WebXR không tồn tại trong LIFF cả 2 nền; MINI App = cùng runtime LIFF (không phải camera fallback); 8th Wall đã đóng cửa 2/2026 |

**Chẩn đoán đáng nhớ (Meshy rigging 422 vs 400)**: rigging chỉ nhận model
**người, có tay chân rõ, có texture, mặt hướng +Z**. Model không phải người
→ **422** (pose estimation failed). Task `input_task_id` hết hạn 3 ngày →
**400** (invalid input task), KHÔNG phải 422. Payload `{"input_task_id":...}`
là đủ và đúng — sửa payload không giải quyết 422. (Nguồn: docs.meshy.ai/en/api/rigging)

**2 việc thủ công user cần làm trên prod** (dữ liệu cũ, code không tự sửa
được): (1) sự kiện `Tham quan Vinh` đặt 集章門檻=2 nhưng chỉ 1 nhiệm vụ →
vào builder đổi về 1 (hoặc thêm nhiệm vụ) rồi Lưu để reward mở khóa được;
(2) job `image_vinh_sk_bnk` bị 404 (GLB mất theo disk cũ) → xóa trong AR
Studio rồi upload lại. Lưu ý reward chỉ mở khóa TẠI thời điểm người chơi
hoàn thành đủ ngưỡng — hạ ngưỡng sau đó cần họ quét/làm lại 1 lần (chưa có
cấp bù hồi tố — xem mục 5 nếu cần).

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
- **LIFF theo tenant — chuỗi fallback**: CTA/QR dùng `branding.line_liff_id ||
  NEXT_PUBLIC_LIFF_ID`; client init qua `resolveLiffId(tenant?)` (branding →
  host → app chung); backend verify thử channel tenant trước rồi channel
  platform. LIFF ID luôn dạng `{channelId}-{suffix}` → channel suy từ tiền tố.
- **NEXT_PUBLIC_* + BACKEND_INTERNAL_URL nướng lúc BUILD** (Docker ARG→ENV):
  đổi biến trên Render phải "Save, rebuild, and deploy", restart không ăn.
- **Render Blueprint**: biến `sync:false` KHÔNG được tạo khi sync tạo service
  mới → phải Add variable tay (backup 4 biến trong
  `scratchpad/render-env-backup.txt` phiên cũ hoặc DEPLOY.md).

## 5. Chưa làm / tùy chọn (theo độ ưu tiên)

0. **Kiểm tra 2 việc user có thể chưa làm**: (a) set env
   `PLATFORM_ADMIN_PASSWORD` trên Render backend (chưa set thì /zoustec/login
   dùng dev `platform-boss`); (b) test nút 自動建立 LIFF với Channel Secret
   của channel BnK (2010638570).
1. **Re-upload ảnh hero BnK** qua /admin/builder trên production (URL cũ trỏ disk đã
   chết; ảnh mới sẽ vào DB — vĩnh viễn). Logo tương tự nếu từng up.
2. **Keep-alive chống cold start**: cron-job.org (free) ping
   `GET /readyz` (backend) + `GET /` (frontend) mỗi 5–10 phút, GIỚI HẠN khung
   07–21h để không vượt 750 giờ free/tháng của Render.
3. **Loading UX**: thông báo "伺服器喚醒中…" khi request >4s (sửa tập trung ở
   `lib/admin-client.js` + `lib/liff-client.js`), thêm `loading.js` skeleton
   cho route `/e/`.
4. **Bàn giao chính thức**: tắt `AUTH_DEV_MODE`; **đổi password Neon**
   (`npg_Wp3ivO5HtJBz` đã lộ trong chat) + password role `zoustec_app`;
   điền ma trận tương thích thiết bị — mở LIFF permalink `/diag` trên từng
   máy (~1 phút/máy), dán kết quả vào BAO-CAO-TUONG-THICH-LIFF-WEBAR.md
   mục 5. Thiếu nhất: 1 iPhone đời thấp + 1 Android tầm trung (chưa có
   datapoint Android thật nào).
5. Nâng cấp SaaS (đã ghi trong CUSTOM-DOMAIN.md): tự động khai báo domain qua
   Render API, xác minh sở hữu domain bằng TXT, wildcard `{slug}.zoustec.app`,
   LIFF channel riêng từng tenant.
6. Khác: media sang Cloudflare R2 khi dung lượng lớn (GLB/ảnh giờ đều là
   bytea trong Neon), share-links panel trong builder, nút upload GLB có
   sẵn vào AR Studio (cắm model từ công cụ ngoài), Meshy Animation API
   (thư viện động tác rộng hơn walk/run). Meshy đã chạy thật trên prod —
   nhớ revoke key `msy_…` đã lộ trong chat khi bàn giao (cùng đợt đổi
   password Neon).
7. **Cấp bù reward hồi tố** (chưa làm — session 2026-07-09): reward chỉ mở
   khóa tại thời điểm hoàn thành nhiệm vụ đủ ngưỡng (`services/tasks.py`).
   Nếu admin hạ 集章門檻 sau khi người chơi đã đạt, họ phải làm/quét lại 1
   lần mới được cấp. Có thể thêm job quét lại toàn tenant tạo `RewardClaim`
   cho member đã đủ ngưỡng theo cấu hình mới.

## 6. Chạy local

```bash
# DB (Docker, project zoustec-ar-line): port 5433 dev / 5434 test
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000  # Python 3.12 (uv)
cd nextjs-zoustec && npm run dev                                   # port 3000
cd backend && .venv/bin/python -m pytest tests/ -q                 # 73 tests
```

Biến môi trường mẫu: xem `render.yaml` + DEPLOY.md. Dev login: nhập
`admin-bnk` / `platform-boss` ở /admin/login (chế độ dev).
