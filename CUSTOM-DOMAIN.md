# Phương pháp gắn domain khách hàng cho website white-label (spec §VIII)

> Kịch bản: khách thuê (tenant) có domain riêng, ví dụ `vinh.concept.com`.
> Khi người dùng mở domain đó, họ thấy **website sự kiện của chính khách**
> (đúng logo/màu/nội dung tạo từ builder), thanh địa chỉ **giữ nguyên domain
> khách** — không lộ domain nền tảng.
>
> Kiến trúc: **định tuyến multi-tenant theo Host header** — cùng mô hình
> Shopify / Vercel / Webflow dùng cho custom domain.

Đã chứng minh chạy thật: `https://vinh-bnk.mooo.com/` → website "BnK Demo
Vinh 2026" (tenant `bnk`, màu #DC2626) trên hạ tầng production
(FreeDNS → Render → Neon), 2026-07-07.

---

## Tổng quan luồng

```
Trình duyệt ──GET https://vinh.concept.com/──▶ DNS (CNAME của khách)
                                                    │
                                                    ▼
                                       Render edge (SNI + TLS tự cấp)
                                                    │  Host: vinh.concept.com
                                                    ▼
                                       Next.js middleware (frontend)
                                                    │
                     GET /api/public/domains/vinh.concept.com  (cache 60s)
                                                    │
                                                    ▼
                                       FastAPI: tenants.custom_domain = ?
                                                    │  → tenant_slug: "bnk"
                                                    ▼
                              NextResponse.rewrite("/e/bnk")   ← REWRITE,
                                                    │            không redirect
                                                    ▼
                              SSR website sự kiện (branding của tenant)
```

Một request duy nhất, không chuyển hướng — URL người dùng thấy từ đầu tới
cuối là domain của khách.

## 5 mảnh ghép

### 1. Dữ liệu — cột `tenants.custom_domain`

- Migration thêm cột `custom_domain` (nullable, **unique**) vào bảng `tenants`.
- Lưu **hostname trần** (`vinh.concept.com`), validate bằng regex
  `^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$`.
- Unique → một domain chỉ thuộc một tenant; tenant khác cố gắn domain đã có
  chủ sẽ nhận `409 domain_taken`.

### 2. Tự phục vụ — `/admin/dashboard/branding`

- Khách nhập domain vào ô 自訂網域 → `PATCH /api/admin/branding`
  (`custom_domain` hoặc `clear_custom_domain: true` để gỡ).
- Frontend **chuẩn hóa input** trước khi gửi: cắt `https://`, path, port,
  dấu chấm cuối — khách paste nguyên URL vẫn lưu được
  (`app/dashboard/branding/page.jsx`, hàm `save()`).
- API chạy trong phiên tenant (RLS) — khách chỉ sửa được domain của mình.

### 3. API tra cứu công khai — `GET /api/public/domains/{host}`

- Không cần auth; nhận hostname → trả `tenant_slug` + branding công khai
  (tên, logo, màu, cờ powered-by). Không lộ dữ liệu nhạy cảm.
- Chạy trong phiên platform-admin ở backend (đọc xuyên tenant chỉ cho đúng
  một bản ghi khớp domain). 404 nếu domain chưa thuộc ai.

### 4. Bộ định tuyến — `nextjs-zoustec/middleware.js`

Chạy trên **request tới `/` và path 1 cấp `/{event-slug}`** (PRD §6.2
tenant resolver: domain/path → tenant → sự kiện), theo thứ tự:

1. **Bỏ qua** path không phải root/slug-1-cấp, slug thuộc danh sách
   RESERVED (`api`, `media`, `experience`, `admin`, `e`, `portal`…),
   hoặc URL root mang tham số OAuth/deep-link (`code`, `liff.state`,
   `tenant`, `event`) — để không phá luồng đăng nhập LINE (đây từng là
   nguồn bug "login kẹt vòng lặp", nên guard này là bắt buộc).
2. **Bỏ qua** nếu Host là host nền tảng (regex `localhost` /
   `*.trycloudflare.com` / `*.vercel.app` / `*.onrender.com`) — các host
   này luôn hiện portal.
3. Host lạ → tra `GET {BACKEND}/api/public/domains/{host}`, **cache
   in-memory 60 giây** (kể cả kết quả "không có" — nên sau khi khách lưu
   domain, tối đa 1 phút mới nhận diện).
4. Tìm thấy tenant → root rewrite `/e/{slug}`, còn `/{event-slug}` rewrite
   `/e/{slug}/{event-slug}` (URL trắng nhãn cho từng sự kiện). **Rewrite
   chứ không redirect** — nội dung là website sự kiện nhưng địa chỉ vẫn là
   domain khách. Đây chính là điểm làm nên "white-label".
5. Không tìm thấy / backend chết → **fail-open**: hiện portal như thường,
   không bao giờ trả trang lỗi vì khâu tra domain.

Deep path (`/experience/...`, `/api/...`, `/e/...`) không bị đụng tới —
app phục vụ bình thường trên mọi host. Lưu ý matcher dùng regex
negative-lookahead vì dạng `'/:seg'` compile sai trên Next 14.2.

### 4b. Trang gốc domain hiển thị gì khi tenant có nhiều sự kiện

Quy tắc 3 bậc, quyết định ở `GET /api/public/site/{tenant}` theo
`brand_config.home_mode` (khách tự chỉnh ở `/admin/dashboard/branding`,
mục 首頁顯示):

| `home_mode` | Trang gốc domain |
|---|---|
| `event` (+ `home_event_slug`) | Website sự kiện được ghim; slug phải là sự kiện đang active (validate khi lưu); nếu sau đó sự kiện bị tắt → tự rơi về `auto` |
| `list` | Trang tổng quan thương hiệu khách (`TenantLanding`) liệt kê mọi sự kiện active |
| `auto` (mặc định) | 1 sự kiện → vào thẳng; ≥2 sự kiện → trang tổng quan |

Response của `/api/public/site/{tenant}` có field `mode`:
`"event"` (payload như cũ) hoặc `"landing"` (`branding` + `events[]`).

Nội dung trang tổng quan khách tự soạn ở cùng màn branding (mục
活動總覽首頁內容): `landing_title` (rỗng = tên tổ chức), `landing_tagline`
(rỗng = câu chào mặc định), `landing_hero` (ảnh nền, rỗng = gradient màu
thương hiệu). Tên tổ chức gốc (tenant.name) do platform quản lý qua console.

### 5. Hạ tầng — DNS + Render

Tầng duy nhất nằm ngoài code, làm **một lần cho mỗi domain**:

| Bước | Ai làm | Việc |
|---|---|---|
| DNS | Khách | Thêm **CNAME** `vinh.concept.com → zoustec-frontend.onrender.com` (hướng dẫn hiện sẵn trong `/admin/dashboard/branding`) |
| Khai báo | Platform | Render → zoustec-frontend → Settings → **Custom Domains** → Add domain. Render verify DNS rồi **tự cấp TLS** (Let's Encrypt) |

Không khai báo với Render thì request không bao giờ tới app (Render định
tuyến theo Host/SNI). Bước này **tự động hóa được** qua
[Render API `POST /services/{id}/custom-domains`](https://api-docs.render.com/reference/create-custom-domain)
— gọi ngay trong handler PATCH branding khi lên SaaS thật.

## Mảnh thứ 6 (dễ quên): link vào LINE từ domain khách

Nút 開始旅程 trên website **không được** dùng link tương đối
`/experience/login` — trên domain khách, redirectUri của LINE OAuth sẽ nằm
ngoài phạm vi LIFF endpoint → lỗi 400. Giải pháp
(`components/event/EventSite.jsx`): dùng **LIFF permalink**

```
https://liff.line.me/{LIFF_ID}/experience/login?tenant={slug}&event={id}
```

— cùng chiến lược với QR: mobile mở thẳng LINE, desktop vòng qua endpoint
nền tảng rồi quay lại. Hoạt động từ **mọi** host.

## Các quyết định thiết kế & lý do

| Quyết định | Lý do |
|---|---|
| Rewrite, không redirect | Giữ domain khách trên thanh địa chỉ (white-label thật) |
| Matcher chỉ `/` | OAuth return + deep path không bị can thiệp; ít bề mặt lỗi nhất |
| Cache 60s (cả kết quả rỗng) | Chi phí tra ≈ 0 sau lần đầu; kích hoạt domain gần như tức thì |
| Hostname trần + chuẩn hóa client | Regex server chặt chẽ, UX khoan dung (paste URL vẫn ổn) |
| Fail-open khi backend chết | Domain khách xấu nhất chỉ hiện portal, không bao giờ 500 |
| Unique constraint | Một domain một chủ, tranh chấp trả 409 rõ ràng |

## Ghi chú test với domain miễn phí

FreeDNS (freedns.afraid.org) **khóa CNAME** trên domain chia sẻ với tài
khoản free → dùng bản ghi **A → `216.24.57.1`** (IP anycast công bố của
Render) thay thế. Khách thật dùng domain riêng thì trỏ CNAME chuẩn, không
gặp giới hạn này. Nhược điểm A record: Render đổi IP thì phải cập nhật.

## Nâng cấp khi lên SaaS thật

1. **Tự động khai báo Render**: gọi Render API trong PATCH branding →
   khách lưu domain là xong, không cần thao tác tay của platform.
2. **Trạng thái domain trong UI**: hiển thị pending / verified / cert-issued
   (Render API trả trạng thái) thay vì khách tự đoán.
3. **Wildcard subdomain nền tảng**: tặng mỗi tenant `{{slug}}.zoustec.app`
   chạy cùng cơ chế, không cần khách có domain.
4. ~~LIFF channel riêng theo tenant~~ → **ĐÃ LÀM** (2026-07-08, xem mục dưới).

## LIFF riêng theo tenant — white-label trọn vẹn trong LINE

Mặc định mọi tenant dùng chung LIFF app của platform → trải nghiệm trong
LINE chạy trên `zoustec-frontend.onrender.com` (header LIFF hiện domain đó).
Gói white-label: tenant gắn **LINE channel + LIFF app của riêng họ** với
Endpoint URL = domain khách → header LIFF hiện domain khách, OA/chatbot
mang tên khách.

### Cách hệ thống chọn LIFF app (fallback dây chuyền, không cấu hình gì thêm)

- **CTA 開始旅程 / QR in từ builder**: `branding.line_liff_id ||
  NEXT_PUBLIC_LIFF_ID` (EventSite, builder — builder cũng lấy tenant slug
  thật từ branding thay vì env).
- **Client `liff.init`**: `resolveLiffId(tenant?)` — tra branding theo
  tenant, không có tenant thì tra host qua `/api/public/domains/{host}`
  (endpoint của LIFF tenant chính là domain khách nên host nhận diện được
  app khi LINE trả OAuth code về), cuối cùng fallback app chung. Dùng ở màn
  login (parse tenant TRƯỚC init) và LiffOAuthCompleter ở root.
- **Backend verify**: channel của tenant = `line_channel_id` hoặc suy từ
  tiền tố LIFF ID (`{channelId}-{suffix}`); thử channel tenant trước,
  **fallback channel platform** — vì member vào bằng app của tenant nhưng
  tenant ADMIN vẫn login dashboard bằng app chung.

### Ai tạo channel? — Zoustec làm trọn gói được, khách không phải mò console LINE

Spec không yêu cầu khách tự tạo channel (Module LINE §III.4 chỉ đòi
"hướng dẫn quy trình cấu hình cho người không phải kỹ sư"). LINE Đài Loan
có [hướng dẫn chính thức cho bên tích hợp làm hộ khách](https://tw.linebiz.com/manual/line-official-account/line-porvider-and-channel-intro/):
được phép, với quy tắc bắt buộc — **mỗi khách một provider riêng, đặt đúng
tên khách**, không dồn nhiều khách vào một provider "Zoustec". Lý do:

- Màn consent khi login hiện **tên provider** → tên khách = đúng white-label
  (spec §VIII).
- **userId cấp theo provider** — chung provider là chung userId giữa các
  channel → dữ liệu người chơi giữa các tenant đối chiếu chéo được, trái
  cách ly đa tenant (spec §XII).
- **Channel không chuyển provider được sau khi tạo** — đặt sai chỗ là phải
  tạo lại, mà tạo lại thì toàn bộ userId đổi (mất mapping thành viên).

Hai tình huống ([best practice của LINE](https://developers.line.biz/en/docs/line-developers-console/best-practices-for-provider-and-channel-management/)):

| Khách | Cách làm |
|---|---|
| Gói one_time / khách nhỏ, chưa có gì trên LINE | Zoustec tạo provider mang tên khách ngay từ account LINE Developers của Zoustec |
| SaaS dài hạn, chính phủ, hoặc **đã có OA riêng** | Khách mời Zoustec làm **Admin** provider của họ (1 link mời, không cần kỹ thuật) — bắt buộc nếu muốn link OA ↔ Login channel (phải cùng provider) và giữ quyền sở hữu dữ liệu để bàn giao |

### Các bước setup cho một khách (Zoustec thao tác, ~5 phút — LINE không có API tạo channel)

1. **Tạo channel**: [LINE Developers Console](https://developers.line.biz)
   → provider của khách (theo bảng trên) → Create channel → **LINE Login**
   → điền tên/ảnh thương hiệu khách → tạo. Nhớ **Publish** channel
   (mặc định Developing — chỉ admin/tester của channel login được).
2. Copy **Channel ID + Channel Secret** (tab Basic settings).
3. **Console Zoustec** (`/zoustec/console`) → 白標設定 của tenant → nhập
   Channel ID + Channel Secret → bấm **自動建立 LIFF** — platform tự tạo
   LIFF app (Size Full, Endpoint = `https://<domain-khách>/`, scope
   `profile`+`openid`) và lưu LIFF ID vào tenant. Khách đổi domain sau này:
   bấm lại nút là endpoint tự cập nhật.
4. Kiểm tra: mở website khách → 開始旅程 → link giờ là
   `liff.line.me/<LIFF-của-khách>/...`; login xong header LIFF hiện domain
   khách. Gỡ trắng nhãn = xóa ô LIFF ID trong console.

(Cách tay cũ vẫn dùng được khi không muốn platform giữ Channel Secret:
tự tạo LIFF app trong console LINE — Size Full, Endpoint = root domain
khách — rồi dán LIFF ID vào ô "LIFF ID (Option B)"; Channel ID tự suy từ
tiền tố LIFF ID.)

### Đánh giá tự động hóa (spec mục 5 — deliverable)

| Thao tác | API? |
|---|---|
| Tạo Provider / LINE Login channel | ❌ Không có API công khai (chỉ đối tác certified của LINE có) — thủ công, nhưng là việc của Zoustec, ~3 phút/khách |
| Tạo / sửa / xóa LIFF app trong channel | ✅ LIFF Server API `POST/PUT/DELETE https://api.line.me/liff/v1/apps` — đã làm, nút 自動建立 LIFF |

Auth: channel access token từ **Channel ID + Channel Secret** (grant
`client_credentials`, `POST /oauth2/v3/token`, fallback v2). → Quy trình
khi thương mại hóa: Zoustec tạo channel tay (1 lần/khách, checklist trên)
+ nhập Channel ID/Secret vào console → platform tự tạo LIFF app đúng
endpoint, tự cập nhật endpoint khi khách đổi domain
(`PUT /liff/v1/apps/{id}`). Với khách, trải nghiệm là trọn gói. Đánh đổi:
platform lưu Channel Secret (cột `line_channel_secret`, không bao giờ trả
ra ngoài; Neon mã hóa at-rest) — ghi vào điều khoản dịch vụ.

Điều kiện tiên quyết: tenant đã gắn custom domain hoạt động (mục trên) —
endpoint LIFF trỏ về domain đó. Lưu ý: đổi endpoint một LIFF app đang dùng
sẽ ảnh hưởng NGƯỜI ĐANG login app đó; app riêng của khách thì độc lập hoàn
toàn với app chung.
