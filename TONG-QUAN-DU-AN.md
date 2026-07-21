# TỔNG QUAN DỰ ÁN — Zoustec AR Stamp Platform

> Tổng hợp dễ hiểu từ tài liệu khách hàng (`Zoustec_AR_Ban_Dich_Tieng_Viet.docx`)
> và hiện trạng code trong repo này. Đọc kèm: [API-UI-MAP.md](API-UI-MAP.md).

---

## 🎯 Dự án này làm gì?

### Hình dung bằng một câu chuyện thực tế

Ở Đài Loan/Nhật có văn hóa rất phổ biến gọi là **"stamp rally" (集章 — đi thu
thập con dấu)**: ban tổ chức đặt các con dấu tại nhiều địa điểm (đền chùa, trạm
tàu, cửa hàng...), người dân cầm sổ đi đến từng nơi đóng dấu, gom đủ dấu thì
được đổi quà. Nó được dùng để **kéo khách du lịch đến các địa điểm** và **kéo
khách hàng vào trung tâm thương mại**.

**Zoustec muốn số hóa trò chơi này.** Ví dụ cụ thể:

> Sở Du lịch Đài Nam tổ chức "Tour di tích cổ thành Đài Nam 2026". Chị Mei mở
> **LINE** (app quốc dân của Đài Loan), bấm vào link sự kiện → **tự động đăng
> nhập, không cần cài app**. Màn hình hiện bản đồ 12 điểm di tích. Chị đến
> Xích Khảm Lâu, **quét mã QR** trên bảng đứng → camera bật lên, **linh vật
> rùa 3D xuất hiện bằng AR** ngay trên di tích thật → chị nhận được 1 con dấu
> ảo. Đi đủ điểm, gom đủ 6 dấu → **mở khóa quà** (voucher, quà lưu niệm).
> Trong lúc đó, nhân viên Sở Du lịch mở dashboard thấy **ngay lập tức**: bao
> nhiêu người đang chơi, điểm nào đông nhất.

### Điểm mấu chốt: đây KHÔNG phải là 1 website sự kiện

Tài liệu khách nhấn mạnh nhiều lần: **không được xây như một dự án đơn lẻ**.
Zoustec muốn một **"cỗ máy sản xuất website sự kiện"** — nền tảng SaaS mà:

- Sở Du lịch Đài Nam thuê → tạo sự kiện tour cổ thành, giao diện màu đỏ, logo của Sở
- Trung tâm thương mại Dream Mall thuê → tạo sự kiện săn quà Tết, giao diện màu cam, logo của Mall
- **Cùng một hệ thống**, mỗi khách một "ngăn" riêng biệt (dữ liệu không nhìn
  thấy nhau — multi-tenant), thương hiệu riêng, thậm chí **tên miền riêng**
  (white-label — khách hàng cuối không biết Zoustec đứng sau)

---

## 🧩 3 năng lực cốt lõi (theo tài liệu)

| # | Năng lực | Giải thích đời thường |
|---|---|---|
| 1 | **Tạo website sự kiện nhanh** (Website Builder) | Nhân viên Sở Du lịch (không biết code) chọn loại sự kiện → hệ thống tự sinh website. 3 loại: **Thành phố** (tour di tích), **Leo núi** (cảnh báo an toàn, checkpoint GPS), **Mua sắm trong nhà** (vị trí cửa hàng, nhiệm vụ tiêu dùng). 🔥 Trọng tâm: **xuất được template frontend** làm deliverable cho gói thầu |
| 2 | **Nhiệm vụ & thu thập dấu** (Gamification Engine) | Trái tim của trò chơi: mỗi nhiệm vụ xác minh bằng **QR** (quét mã tại chỗ), **GPS** (đứng đúng vị trí), hoặc **hybrid** (cả hai). Đủ dấu → mở quà. Kết quả ghi về admin ngay lập tức |
| 3 | **AI tạo 3D + WebAR** | Nhân viên marketing upload **ảnh 2D** linh vật → **AI tự dựng model 3D** → chỉnh màu/kích thước → xuất ra WebAR. Không cần thuê designer 3D |

---

## 👥 3 loại người dùng — ứng với các màn hình

```
┌─────────────────────────────────────────────────────────────────┐
│  NGƯỜI DÂN (chơi qua LINE, không cài app)                        │
│  → /  (portal)    khám phá các sự kiện đang diễn ra (trang chủ)  │
│  → /experience    login LINE → bản đồ nhiệm vụ → AR → sổ dấu     │
├─────────────────────────────────────────────────────────────────┤
│  KHÁCH HÀNG CỦA ZOUSTEC (Sở du lịch, Mall... — người thuê)       │
│  → /admin/dashboard     xem thống kê realtime sự kiện của MÌNH         │
│  → /admin/builder       tạo website sự kiện (wizard + kéo thả + xuất)  │
│  → /admin/ar-studio     upload ảnh → AI tạo 3D                         │
├─────────────────────────────────────────────────────────────────┤
│  ZOUSTEC (chủ nền tảng)                                          │
│  → /admin/console       quản lý TẤT CẢ khách thuê, doanh thu, gói      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 💰 Mô hình kinh doanh (spec mục XI)

1. **SaaS** — khách thuê trả tiền hằng tháng
2. **Gói một lần** — tổ chức 1 sự kiện, trả 1 lần
3. **White-label** — trả nhiều hơn để xóa dấu vết Zoustec, dùng domain + LINE riêng

v1 quản lý gói/MRR thủ công qua platform admin (chưa có billing engine —
đã thống nhất trong phân tích scope).

---

## 🤝 Phân chia trách nhiệm (spec mục XIII — quan trọng cho hợp đồng)

| **BNK (outsource — phía chúng ta)** | **Zoustec (khách)** |
|---|---|
| Kiến trúc nền tảng, đa khách thuê | Engine WebAR chính thức |
| Hệ thống admin 2 cấp | Engine AI tạo 3D chính thức |
| Công cụ nhiệm vụ (QR/GPS/hybrid) | Thiết kế trải nghiệm |
| White-label, tích hợp LINE | |

→ Vì Zoustec **chưa có** 2 engine kia, chúng ta đã xây **bản tạm** (MindAR cho
WebAR, mock/Meshy cho AI-3D) đằng sau "seam" (`ARProvider`, `Model3DProvider`)
— khi Zoustec giao engine thật thì cắm vào, **không đập code**.

---

## 📱 Vì sao LINE quan trọng đến vậy?

LINE ở Đài Loan giống Zalo ở Việt Nam — **ai cũng có**. Yêu cầu cứng của khách
(module LINE): người dân bấm link trong LINE → vào thẳng sự kiện, **đăng nhập
tự động** (không đăng ký, không mật khẩu), chơi hết trò trong LINE luôn. Đây
là lý do dùng **LIFF** (LINE Front-end Framework — web app chạy bên trong LINE).

**PoC nghiệm thu của khách chỉ gồm 4 gạch đầu dòng:**

1. Vào sự kiện từ LINE OA (LIFF) → mở được trang
2. Tự động đăng nhập, lấy được userId
3. Hoàn thành 1 nhiệm vụ QR hoặc GPS
4. Kết quả ghi vào admin ngay

### Các giới hạn kỹ thuật phải công khai (tránh tranh chấp — spec mục V)

- **iOS LINE WebView không có WebXR** → AR trong LIFF là image-target/marker
  (không world-tracking). Đã chọn MindAR (getUserMedia + WebGL) vì lý do này.
- **GPS trong nhà không tin cậy** → nhiệm vụ indoor dùng QR/hybrid; đặt
  checkpoint GPS ở cửa vào với bán kính rộng (75–100m).
- **QR chính thống = URL chứa token** (quét bằng camera máy/LINE) — không dùng
  `liff.scanCodeV2` (không ổn định đa nền tảng).
- **Không tạo được LINE Channel qua API** → onboard khách white-label option B
  luôn có bước thủ công ~15 phút trên LINE Developers Console.
- **HTTPS bắt buộc** cho camera/GPS.

---

## ✅ Trạng thái hiện tại (cập nhật 2026-07-06)

### Đã xong

- **Backend FastAPI** (`backend/`): multi-tenant PostgreSQL RLS thật, LINE
  OIDC → JWT, engine nhiệm vụ QR/GPS(PostGIS)/hybrid + stamp idempotent +
  reward theo ngưỡng, admin 2 cấp, white-label (logo/màu/domain/LIFF binding),
  export template headless, AI-3D pipeline (mock/Meshy) — **62/62 tests pass**
- **Frontend** (`nextjs-zoustec/`): UI mới đã nối data thật:
  - `/admin/dashboard` — KPI + line chart + donut + bảng sự kiện (API `admin/overview`)
  - `/admin/console` — khách thuê + gói/MRR + bar chart (API `platform/overview`)
  - `/portal` — sự kiện công khai cross-tenant (API `public/events`)
  - `/experience/*` — luồng người chơi 4 màn end-to-end: login (LIFF thật khi
    có `NEXT_PUBLIC_LIFF_ID`, dev-mode khi không) → map nhiệm vụ thật → xác
    minh QR/GPS/hybrid → sổ dấu + giải thưởng
- **HTTPS công khai**: Cloudflare quick tunnel (URL đổi khi restart —
  xem terminal; dạng `https://xxx.trycloudflare.com`)
- **Đã test sống**: login → QR ✓ → GPS chặn đúng khi sai vị trí (422
  `gps_out_of_range`) ✓ → dấu vào sổ ✓ → thống kê nhảy trên dashboard ✓
  → **3/4 tiêu chí PoC chạy được**

### ✅ PRODUCTION (từ 2026-07-06) — mọi mục "còn lại" trước đây đã xong

| Thành phần | Địa chỉ |
|---|---|
| **Frontend** | https://zoustec-frontend.onrender.com |
| **Backend** | https://zoustec-backend.onrender.com |
| **Database** | Neon (Singapore) — PostGIS + RLS, 3 tenants |
| **LIFF** | ID `2010613964-3UzmddVV`, endpoint = frontend URL (đã chốt) |
| **Repo** | https://github.com/dylan-doan/ar-platform (Blueprint `render.yaml`) |

Đã nghiệm thu trên production: 4/4 tiêu chí PoC bằng LINE thật (login người chơi
+ login admin), 3 website khách white-label (`/e/{tenant}/{event}`), builder
CRUD + QR + sections + hero, AR Studio (AI-3D + compile target), branding
self-service (logo/màu/domain), custom domain middleware, portal.

### Việc tùy chọn tiếp theo (không chặn gì)

1. **Bàn giao**: tắt `AUTH_DEV_MODE` trên Render, reset password Neon
   (đã lộ trong quá trình setup), điền ma trận tương thích thiết bị
2. **Media bền**: chuyển upload sang Cloudflare R2 (free 10GB) — disk Render
   free là ephemeral, file upload mất khi redeploy
3. **Console**: thêm nút "新增客戶" (tạo tenant trên UI — hiện qua API)
4. **Engine Zoustec**: cắm WebAR + AI-3D chính thức vào seam khi khách giao

### Chạy dev (local — production xem bảng trên)

```bash
docker compose -f deploy/docker-compose.yml up -d db        # DB (cổng 5433)
cd backend && .venv/bin/uvicorn app.main:app --port 8000    # API
cd nextjs-zoustec && npm run dev                            # Web (cổng 3000)
cloudflared tunnel --url http://localhost:3000              # HTTPS công khai
```

Đăng nhập dev (backend `AUTH_DEV_MODE=true`): xem [API-UI-MAP.md](API-UI-MAP.md).

### Tài liệu liên quan

| File | Nội dung |
|---|---|
| [API-UI-MAP.md](API-UI-MAP.md) | Bản đồ màn hình ↔ endpoint + login dev |
| `../AR platform/Zoustec_PhanTich_TraLoi_KhachHang.md` | Phân tích yêu cầu đầy đủ + trả lời 6 câu hỏi nghiên cứu của khách (LIFF/WebAR, QR, GPS, multi-tenant LINE, LIFF API, LIFF vs MINI App) |
| `../AR platform/Zoustec_AR_Ban_Dich_Tieng_Viet.docx` | Tài liệu gốc của khách (bản dịch tiếng Việt) |
