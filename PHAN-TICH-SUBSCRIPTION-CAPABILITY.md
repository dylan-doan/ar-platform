# Phân tích: Subscription theo capability template (JSON trong DB)

> Đề xuất kỹ thuật cho mô hình tiered pricing — mỗi tier là **1 capability
> template (JSON) lưu trong database**; hệ thống đặt **resolver/validator**
> tại các điểm cần thiết để tenant + event website tuân thủ template.
> Viết để techlead review. Cập nhật: 2026-08-13.

## 1. Nguyên tắc thiết kế

1. **Capability là DATA, không phải code.** Thêm/đổi tier = thêm row trong DB,
   không deploy. Đây là đúng triết lý đã dùng cho design JSON (block whitelist
   + validate server-side) — lặp lại pattern đã chứng minh trong repo.
2. **Enforce duy nhất ở backend.** Frontend chỉ đọc capabilities để ẩn/hiện
   UI; mọi guard thật nằm ở API layer (client bypass được UI, không bypass
   được API). Sai tier → 403 `plan_required`, message zh-TW.
3. **Fail-closed cho feature trả tiền, fail-open cho feature nền.** Không
   resolve được template (row bị xóa, key lạ) → feature trả tiền coi như
   không có; Event Website (mọi tier đều ✓) không bao giờ chết vì lỗi billing.
4. **Template bất biến theo version.** Đổi giá/quyền lợi = tạo version mới;
   tenant đang trỏ version cũ giữ nguyên quyền lợi (grandfathering) cho tới
   khi platform admin chủ động chuyển.

## 2. Mô hình dữ liệu

```
capability_templates
  id            UUID PK
  plan_key      VARCHAR(32)      -- "go" | "pro" | "ultimate"
  version       INT              -- tăng dần; (plan_key, version) UNIQUE
  display_name  VARCHAR(64)      -- "Pro"
  capabilities  JSONB            -- xem §3
  is_active     BOOL             -- version cũ tắt để không bán mới
  created_at

tenants (thêm cột — KHÔNG đụng cột `plan` hiện có*)
  plan_tier             VARCHAR(32)  NULL   -- FK mềm → plan_key
  plan_tier_version     INT          NULL
  capability_overrides  JSONB        NULL   -- add-on đã mua / ngoại lệ ký riêng
```

\* Cột `tenants.plan` hiện tại (`saas | white_label | one_time`, migration
0004) là **business model** phục vụ console thống kê, không phải tier — đè
lên nó sẽ vỡ màn console 05. Để riêng 2 khái niệm.

**Resolved capabilities** = `template.capabilities ⊕ tenant.capability_overrides`
(override thắng theo key). Add-on kiểu "Extra Participant Pack ×2" là override
cộng dồn: `{"limits.participants_extra": 20000}`.

## 3. JSON schema của capability template

Quy ước: **key phẳng có namespace**, giá trị **có kiểu rõ** (bool / enum /
số) — không lồng sâu để override theo key không cần deep-merge; key lạ bị
validator từ chối (cùng triết lý `ALLOWED_BLOCKS` của design JSON).

```jsonc
// 3 tier từ bảng đề xuất, mỗi row DB là 1 bản như sau
{
  "plan_key": "go",  "version": 1,  "display_name": "Go",
  "capabilities": {
    "website.event_site": true,
    "ar.stamp": "basic",                    // "basic" | "full"
    "ar.ai_3d": false,                      // false | true | "addon"
    "limits.participants_included": 1000,
    "limits.participant_pack_allowed": false,
    "export.template": false,
    "api.sdk": false,
    "support.level": "none"                 // "none" | "standard" | "premium"
  }
}
```

| key | Go | Pro | Ultimate |
|---|---|---|---|
| `website.event_site` | `true` | `true` | `true` |
| `ar.stamp` | `"basic"` | `"full"` | `"full"` |
| `ar.ai_3d` | `false` | `"addon"` | `true` |
| `limits.participants_included` | `1000` | `10000` | `100000` |
| `limits.participant_pack_allowed` | `false` | `true` | `true` |
| `export.template` | `false` | `true` | `true` |
| `api.sdk` | `false` | `true` | `true` |
| `support.level` | `"none"` | `"standard"` | `"premium"` |

Giá trị `"addon"` nghĩa là: tier không kèm sẵn, nhưng **được phép mua** —
mua xong ghi `{"ar.ai_3d": true}` vào `capability_overrides` của tenant.
`support.level` là metadata hiển thị (console/hợp đồng), không có guard code.

## 4. Resolver & validator

Một module duy nhất `backend/app/services/capabilities.py` (mirror cách
`site_design.py` đang làm cho design JSON):

```python
CAPABILITY_SCHEMA = {...}  # pydantic: key whitelist + kiểu từng key

async def resolve_capabilities(session, tenant) -> Caps:
    """template (cache TTL 60s theo (plan_key, version)) ⊕ overrides.
    Tenant chưa gán tier (dữ liệu cũ) → tier mặc định cấu hình được
    (đề xuất: ultimate trong giai đoạn chuyển tiếp, hạ dần sau)."""

def require(caps, key):            # feature bool/enum — sai → 403 plan_required
def check_limit(caps, key, used):  # limit số — vượt → 403 limit_exceeded
```

- **Validator chạy 2 chỗ**: (1) platform admin tạo/sửa template qua console →
  reject key lạ/kiểu sai ngay lúc ghi; (2) ghi `capability_overrides` (mua
  add-on) → chỉ nhận key có trong schema.
- **Không nhét capabilities vào JWT** — đổi tier phải có hiệu lực ngay,
  không chờ token hết hạn. Resolve mỗi request từ cache là đủ rẻ (1 query
  cache-hit ~0ms).
- Frontend: `GET /api/admin/capabilities` trả bản resolved để ẩn nút/mục menu
  (匯出, AR Studio AI…) + banner "升級方案" — thuần cosmetic, guard thật ở API.

## 5. Ma trận enforcement — điểm chặn cụ thể trong repo hiện tại

| Feature | Guard đặt ở đâu (code thật) | Ghi chú |
|---|---|---|
| Event Website | *(không chặn — mọi tier ✓)* | vẫn khai key để tương lai có tier không kèm website |
| AR Stamp basic/full | `PATCH/POST /api/admin/events/{id}/tasks` (admin.py) khi task gắn `ar_config`; và `POST /api/me/tasks/{id}/verify-qr` phía chơi | **cần chốt nghiệp vụ**: đề xuất basic = stamp QR/GPS không lớp 3D, full = có AR overlay (xem §7-Q1) |
| AI / 3D AR | `POST /api/model3d/jobs` + `/animate` + `/retexture` (model3d.py:29,181,216) | fail-closed; chặn ở tạo job = chặn luôn tiêu credit Meshy |
| Participant Included | Điểm tạo Member player duy nhất: `app/api/auth.py:86` (login LINE lần đầu) | đếm `Member` role=player theo tenant; vượt quota → chặn join + message zh-TW; cảnh báo 80% trên dashboard. **Hard cap tại điểm join**, không phải soft-log, vì đây là trục tiền chính |
| Extra Participant Pack | Không phải guard — là add-on ghi `limits.participants_extra` | tổng quota = included + extra |
| Export Template | `POST /api/admin/tenant-api-key` (admin.py:738), `POST /events/{id}/export-keys` (:817), route Next `/api/export-nextjs`, `GET/PUT /events/{id}/design` (JSON round-trip mới) | chặn mint key + export zip + tải design JSON |
| API / SDK | `resolve_export_key()` (headless.py:54) — key của tenant hết quyền `api.sdk` → 403 khi dùng | tách với Export Template: export = lấy site đem đi; API/SDK = key headless còn *sống* để tự tích hợp (xem §7-Q2) |
| Priority Support | Metadata — hiện ở console chi tiết tenant | không có code path |

Điểm quan trọng: **guard đặt ở API tạo/ghi, không đặt ở đường render công
khai** — site khách đang sống không bao giờ sập giữa chừng vì billing; hạ
tier chỉ khóa *thao tác mới* (tạo job AI, mint key, member mới vượt quota).

## 6. Rollout (3 bước, không big-bang)

1. **Migration + seed**: bảng `capability_templates` + 3 cột tenants; seed 3
   template v1 (bảng §3). Tenant hiện hữu: `plan_tier=NULL` → resolver trả
   tier mặc định (đề xuất `ultimate`) — **zero behavior change ngay khi merge**.
2. **Console**: màn 方案管理 (CRUD template, validator chạy ở đây) + dropdown
   gán tier trong 白標設定 + hiển thị usage (participants dùng/quota).
3. **Bật guard theo thứ tự rủi ro thấp → cao**: model3d (ít user đụng) →
   export/API key → participant cap (đông người đụng nhất, bật cảnh báo 80%
   trước 1–2 tuần rồi mới hard-cap).

Ước lượng: bước 1+resolver ~1 ngày; console ~1–1.5 ngày; đặt guard + test
~1 ngày (pattern test đã có sẵn: mint tenant 2 tier trong conftest, assert
403/quota — giống test_site_design_api.py).

## 7. Câu hỏi cần techlead chốt

1. **"AR Stamp Basic" nghĩa là gì về nghiệp vụ?** Đề xuất: basic = QR/GPS
   stamp thuần (không 3D overlay); full = luồng AR đầy đủ. Phương án khác:
   basic = giới hạn N model AR/sự kiện. Guard đặt được cả hai, nhưng phải
   chốt trước khi viết.
2. **Export Template vs API/SDK chồng nhau ở export key.** Đề xuất tách:
   `export.template` gate việc *tải* (zip/design JSON/mint key lần đầu);
   `api.sdk` gate việc key *tiếp tục sống* cho tích hợp ngoài. Tenant Go bị
   thu hồi key đang có không? (đề xuất: có, revoke khi hạ tier — cần confirm.)
3. **Participant tính theo đời tenant hay theo sự kiện/chu kỳ?** Bảng ghi
   "Participant Included 1,000" — đề xuất đếm **member player active theo
   tenant** (đơn giản, khớp DB hiện tại). Nếu theo năm/chu kỳ billing thì cần
   thêm `period_start` và job reset — phức tạp hơn đáng kể, để v2.
4. **Đổi tier giữa chừng khi sự kiện đang chạy**: hạ tier có khóa ngay AR
   full đang dùng không? Đề xuất: quyền lợi đã "phát hành" (task AR đã tạo,
   member đã join) giữ nguyên; chỉ chặn thao tác mới — tránh sập sự kiện
   đang diễn ra của khách.
5. **Billing engine ngoài scope?** Đề xuất v1 chưa nối cổng thanh toán —
   platform admin gán tier/add-on tay trong console (khớp thực tế `mrr_ntd`
   đang nhập tay). JSON template thiết kế sẵn chỗ cho tự động hóa sau.

## 8. Vì sao cách này đáng làm (tóm cho reviewer)

- **1 nguồn chân lý trong DB** — sales đổi gói không cần dev; console chỉnh
  template là mọi resolver ăn theo.
- **Guard tập trung 1 module** + đặt tại ~6 endpoint đã định vị sẵn ở §5 —
  không rải if-else khắp codebase.
- **Grandfathering bằng version + overrides** — không bao giờ phải viết
  migration sửa quyền lợi tenant cũ.
- Lặp lại pattern đã chạy tốt trong repo (design JSON: schema whitelist +
  validate 2 đầu + fail có chủ đích) — team đã quen cách nghĩ này.
