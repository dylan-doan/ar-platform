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

### 2. Tự phục vụ — `/dashboard/branding`

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

Chạy trên **mọi request tới `/`** (matcher root-only), theo thứ tự:

1. **Bỏ qua** nếu URL mang tham số OAuth/deep-link (`code`, `liff.state`,
   `tenant`, `event`) — để không phá luồng đăng nhập LINE (đây từng là
   nguồn bug "login kẹt vòng lặp", nên guard này là bắt buộc).
2. **Bỏ qua** nếu Host là host nền tảng (regex `localhost` /
   `*.trycloudflare.com` / `*.vercel.app` / `*.onrender.com`) — các host
   này luôn hiện portal.
3. Host lạ → tra `GET {BACKEND}/api/public/domains/{host}`, **cache
   in-memory 60 giây** (kể cả kết quả "không có" — nên sau khi khách lưu
   domain, tối đa 1 phút mới nhận diện).
4. Tìm thấy tenant → `NextResponse.rewrite('/e/{slug}')`. **Rewrite chứ
   không redirect** — nội dung là website sự kiện nhưng địa chỉ vẫn là
   domain khách. Đây chính là điểm làm nên "white-label".
5. Không tìm thấy / backend chết → **fail-open**: hiện portal như thường,
   không bao giờ trả trang lỗi vì khâu tra domain.

Deep path (`/experience/...`, `/api/...`, `/e/...`) không qua middleware —
app phục vụ bình thường trên mọi host.

### 5. Hạ tầng — DNS + Render

Tầng duy nhất nằm ngoài code, làm **một lần cho mỗi domain**:

| Bước | Ai làm | Việc |
|---|---|---|
| DNS | Khách | Thêm **CNAME** `vinh.concept.com → zoustec-frontend.onrender.com` (hướng dẫn hiện sẵn trong `/dashboard/branding`) |
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
4. **LIFF channel riêng theo tenant**: cột `line_liff_id` đã có sẵn trong
   payload branding — khi khách có LINE channel riêng, permalink dùng LIFF
   ID của họ → white-label trọn vẹn cả trong LINE.
