#!/usr/bin/env python3
"""Generate the 3 end-to-end workflows (Zoustec admin / Tenant admin / Player in LINE)
in 2 formats (BPMN swimlane "A", vertical column flow "B") x 3 languages (vi/en/zh-TW).

Usage:  python3 docs/flows/gen_flows.py            -> writes SVG + PNG next to this file
Needs Google Chrome for the PNG screenshot; SVGs are always written.
"""
import html, os, subprocess, unicodedata

OUT = os.path.dirname(os.path.abspath(__file__))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
LANGS = ("vi", "en", "zh")

# --------------------------------------------------------------------------- text
T = {
 "title": {"vi": "Zoustec AR — 3 luồng vận hành và mối liên hệ",
           "en": "Zoustec AR — the 3 operating workflows and how they connect",
           "zh": "Zoustec AR — 三大作業流程與彼此關聯"},
 "subtitle": {"vi": "Luồng đã triển khai: Zoustec tạo khách hàng → Khách hàng dựng sự kiện → Người chơi tham gia trong LINE",
              "en": "As implemented: Zoustec onboards a customer → the customer builds the event → players join inside LINE",
              "zh": "已實作流程：Zoustec 建立客戶 → 客戶建置活動 → 玩家於 LINE 內參與"},
 "actors": {
   "Z": {"vi": ["Admin Zoustec", "(Console nền tảng)"], "en": ["Zoustec Admin", "(Platform Console)"], "zh": ["Zoustec 管理員", "（平台後台）"]},
   "T": {"vi": ["Admin khách hàng", "(Trang quản trị)"], "en": ["Customer Admin", "(Admin dashboard)"], "zh": ["客戶管理員", "（管理後台）"]},
   "S": {"vi": ["Hệ thống nền tảng", "(Backend)"], "en": ["Platform System", "(Backend)"], "zh": ["平台系統", "（後端）"]},
   "L": {"vi": ["LINE", "(App / API)"], "en": ["LINE", "(App / API)"], "zh": ["LINE", "（App／API）"]},
   "P": {"vi": ["Người chơi", "(trong LINE)"], "en": ["Player", "(inside LINE)"], "zh": ["玩家", "（LINE 內）"]},
   "D": {"vi": ["Kênh phát hành", "(LINE OA / QR)"], "en": ["Distribution", "(LINE OA / QR)"], "zh": ["發布管道", "（LINE 官方帳號／QR）"]},
 },
 "flows": {
   "A": {"vi": "Luồng 1 — Zoustec tạo và bàn giao khách hàng", "en": "Flow 1 — Zoustec onboards and hands over a customer", "zh": "流程 1 — Zoustec 建立並交付客戶"},
   "B": {"vi": "Luồng 2 — Khách hàng tự cấu hình LINE, dựng và phát hành sự kiện", "en": "Flow 2 — The customer connects LINE, builds and publishes an event", "zh": "流程 2 — 客戶自行連結 LINE、建置並發布活動"},
   "C": {"vi": "Luồng 3 — Người chơi tham gia trong LINE", "en": "Flow 3 — The player takes part inside LINE", "zh": "流程 3 — 玩家於 LINE 內參與"},
 },
 "handoff": {
   "AB": {"vi": "Bàn giao: tài khoản admin khách · link trang quản trị · khóa API", "en": "Hand-over: customer admin account · dashboard link · API key", "zh": "交付：客戶管理員帳號・管理後台連結・API 金鑰"},
   "BC": {"vi": "Phát hành: website sự kiện · link LIFF · mã QR từng nhiệm vụ", "en": "Release: event website · LIFF link · per-task QR codes", "zh": "發布：活動網站・LIFF 連結・各任務 QR Code"},
   "CB": {"vi": "Kết quả hoàn thành hiện ngay trong thống kê của khách hàng", "en": "Completions appear immediately in the customer's statistics", "zh": "完成結果即時顯示於客戶統計"},
 },
 "overview_h": {"vi": "Mối liên hệ giữa 3 luồng", "en": "How the 3 workflows connect", "zh": "三大流程的關聯"},
 "overview_sys": {"vi": ["Hệ thống nền tảng Zoustec", "dữ liệu tách riêng từng khách · API · nhật ký"], "en": ["Zoustec platform system", "per-customer data isolation · API · audit log"], "zh": ["Zoustec 平台系統", "客戶資料隔離・API・稽核日誌"]},
 "legend_A": {"vi": [("user","Thao tác người dùng"),("sys","Xử lý hệ thống"),("ext","LINE / dịch vụ ngoài"),("alt","Nhánh thay thế"),("flow","Trình tự"),("data","Luồng dữ liệu")],
              "en": [("user","User task"),("sys","System task"),("ext","LINE / external"),("alt","Alternative branch"),("flow","Sequence"),("data","Data flow")],
              "zh": [("user","使用者任務"),("sys","系統任務"),("ext","LINE／外部服務"),("alt","替代分支"),("flow","順序"),("data","資料流程")]},
 "alt_tag": {"vi": "Nhánh khác", "en": "Alternative", "zh": "替代分支"},
}

# step = (id, actor, kind, text{lang: [lines]}, alt{lang: [lines]} | None)
def S(i, actor, kind, vi, en, zh, alt=None):
    return dict(id=i, actor=actor, kind=kind, text={"vi": vi, "en": en, "zh": zh}, alt=alt)

FLOW_A = [
 S("A1","Z","user",["Đăng nhập Console Zoustec","(email + mật khẩu)"],["Log in to the Zoustec Console","(email + password)"],["登入 Zoustec 後台","（電子郵件＋密碼）"]),
 S("A2","Z","user",["Tạo khách hàng: tên, mã định danh,","gói dịch vụ (SaaS / 1 lần / white-label)"],["Create the customer: name, slug,","service plan (SaaS / one-time / white-label)"],["建立客戶：名稱、識別碼、","方案（SaaS／一次性／白標）"]),
 S("A3","S","sys",["Tạo hồ sơ khách + cấp khóa API riêng,","dữ liệu tách biệt, ghi nhật ký"],["Create the customer record + issue its API key,","isolate its data, write audit log"],["建立客戶資料＋核發專屬 API 金鑰，","資料隔離並寫入稽核日誌"]),
 S("A4","Z","user",["Tạo tài khoản admin cho khách","(email + mật khẩu tạm, đổi khi đăng nhập lần đầu)"],["Create the customer's admin account","(email + temporary password, changed on first login)"],["建立客戶管理員帳號","（電子郵件＋臨時密碼，首次登入須更改）"]),
 S("A5","Z","user",["Đặt bật/tắt「Powered by Zoustec」,","xem/thu hồi khóa API"],["Set the “Powered by Zoustec” switch,","view / revoke the API key"],["設定「Powered by Zoustec」開關，","檢視／撤銷 API 金鑰"],
   alt={"vi":["Khách không tự cấu hình LINE được","→ Zoustec dán Channel ID + Secret và tạo LIFF hộ từ Console"],"en":["Customer cannot self-configure LINE","→ Zoustec pastes Channel ID + Secret and creates the LIFF from the Console"],"zh":["客戶無法自行設定 LINE","→ Zoustec 於後台代為貼上 Channel ID＋Secret 並建立 LIFF"]}),
 S("A6","Z","user",["Bàn giao: link trang quản trị,","tài khoản admin, khóa API"],["Hand over: admin dashboard link,","admin account, API key"],["交付：管理後台連結、","管理員帳號、API 金鑰"]),
]
FLOW_B = [
 S("B1","T","user",["Đăng nhập trang quản trị","(chỉ thấy dữ liệu của khách mình)"],["Log in to the admin dashboard","(sees only this customer's data)"],["登入管理後台","（僅能看到自家資料）"]),
 S("B2","T","user",["Thương hiệu: logo, màu chủ đề,","tên miền riêng → lưu"],["Branding: logo, theme colour,","custom domain → save"],["品牌設定：Logo、主題色、","自訂網域 → 儲存"]),
 S("B3","T","user",["Kết nối LINE: dán Channel ID + Secret của","LINE Login channel → bấm「Tự động tạo LIFF」"],["Connect LINE: paste the LINE Login channel's","Channel ID + Secret → click “Create LIFF”"],["連結 LINE：貼上 LINE Login channel 的","Channel ID＋Secret → 點擊「自動建立 LIFF」"],
   alt={"vi":["Chưa có channel / tên miền riêng","→ dùng LIFF chung của nền tảng, bỏ qua bước này"],"en":["No own channel / domain yet","→ use the platform's shared LIFF, skip this step"],"zh":["尚無自有 channel／網域","→ 使用平台共用 LIFF，略過此步驟"]}),
 S("B4","L","ext",["LINE cấp token → LIFF Server API tạo app,","endpoint = tên miền khách → trả LIFF ID"],["LINE issues a token → LIFF Server API creates the app,","endpoint = customer domain → returns LIFF ID"],["LINE 核發 token → LIFF Server API 建立 app，","endpoint＝客戶網域 → 回傳 LIFF ID"]),
 S("B5","S","sys",["Lưu LIFF ID + channel vào hồ sơ khách;","link vào sự kiện = https://liff.line.me/{LIFF ID}"],["Save LIFF ID + channel to the customer record;","entry link = https://liff.line.me/{LIFF ID}"],["儲存 LIFF ID＋channel 至客戶資料；","活動入口＝https://liff.line.me/{LIFF ID}"]),
 S("B6","T","user",["Tạo sự kiện: tên, loại","(thành phố / leo núi / khu mua sắm)"],["Create the event: name, type","(city / hiking / indoor mall)"],["建立活動：名稱、類型","（城市／登山／室內商場）"]),
 S("B7","S","sys",["Sinh bố cục mặc định","theo loại sự kiện"],["Generate the default layout","for the event type"],["依活動類型","產生預設版面"]),
 S("B8","T","user",["Trình kéo-thả: sửa khối nội dung, tải ảnh;","thêm nhiệm vụ: QR / GPS / kết hợp, vị trí, bán kính, ngưỡng thưởng"],["Drag-and-drop builder: edit blocks, upload images;","add tasks: QR / GPS / hybrid, location, radius, reward threshold"],["拖放編輯器：編輯區塊、上傳圖片；","新增任務：QR／GPS／混合、位置、半徑、獎勵門檻"]),
 S("B9","T","user",["AR Studio: tải ảnh linh vật → AI tạo 3D","→ chỉnh màu / kích thước → gắn vào nhiệm vụ"],["AR Studio: upload mascot → AI builds 3D","→ adjust colour / size → attach to a task"],["AR Studio：上傳吉祥物 → AI 產生 3D","→ 調整顏色／大小 → 綁定至任務"]),
 S("B10","T","user",["Bấm「Xuất bản」"],["Click “Publish”"],["點擊「發布」"]),
 S("B11","S","sys",["Kiểm tra nội dung hợp lệ → sinh website tĩnh","theo phiên bản + mã QR cho từng nhiệm vụ"],["Validate content → generate the static site","as a version + a QR code per task"],["驗證內容 → 產生靜態網站版本","＋各任務 QR Code"]),
 S("B12","T","user",["(Tùy chọn) Tải template: gói Next.js / HTML tĩnh /","JSON thiết kế → sửa → tải lên → xem trước → xuất bản"],["(Optional) Export template: Next.js / static HTML /","design JSON → edit → upload → preview → publish"],["（選用）匯出範本：Next.js／靜態 HTML／","設計 JSON → 編輯 → 上傳 → 預覽 → 發布"],
   alt={"vi":["Website tải về vẫn lấy dữ liệu sự kiện,","nhiệm vụ, con dấu qua khóa API của khách"],"en":["A downloaded site still pulls events,","tasks and stamps through the customer's API key"],"zh":["匯出的網站仍透過客戶 API 金鑰","讀取活動、任務與集章資料"]}),
 S("B13","D","ext",["Phát hành: gắn link LIFF / mã QR vào","LINE OA, Rich Menu, ấn phẩm tại điểm"],["Release: put the LIFF link / QR codes on the","LINE OA, Rich Menu, on-site signage"],["發布：將 LIFF 連結／QR Code 放上","LINE 官方帳號、Rich Menu、現場文宣"]),
 S("B14","T","user",["Theo dõi: thống kê, thành viên, xuất CSV","(cập nhật ngay khi người chơi hoàn thành)"],["Monitor: statistics, members, CSV export","(updates as soon as players complete tasks)"],["追蹤：統計、會員、匯出 CSV","（玩家完成任務即時更新）"]),
]
FLOW_C = [
 S("C1","P","user",["Mở link từ LINE OA / Rich Menu","hoặc quét mã QR"],["Open the link from the LINE OA / Rich Menu","or scan a QR code"],["從 LINE 官方帳號／Rich Menu 開啟連結","或掃描 QR Code"]),
 S("C2","L","ext",["LINE mở LIFF → website sự kiện","dưới tên miền của khách hàng"],["LINE opens LIFF → the event website","under the customer's domain"],["LINE 開啟 LIFF → 以客戶網域","顯示活動網站"]),
 S("C3","S","sys",["Tự đăng nhập: xác minh token với LINE (channel khách","trước, rồi channel chung) → tạo / nhận diện thành viên"],["Auto login: verify the token with LINE (customer channel","first, then shared) → create / recognise the member"],["自動登入：向 LINE 驗證 token（先客戶 channel，","再共用 channel）→ 建立／辨識會員"]),
 S("C4","P","user",["Xem danh sách nhiệm vụ","và bản đồ"],["View the task list","and the map"],["查看任務清單","與地圖"]),
 S("C5","P","user",["QR: quét mã bằng camera → mở đúng nhiệm vụ","GPS: bấm「Xác minh vị trí」→ gửi tọa độ"],["QR: scan with the camera → opens the right task","GPS: tap “Verify location” → send position"],["QR：以相機掃描 → 開啟對應任務","GPS：點擊「驗證位置」→ 送出座標"]),
 S("C6","S","sys",["Kiểm tra trên máy chủ: mã hợp lệ / trong bán kính","→ cấp con dấu, ghi nhật ký kèm bằng chứng"],["Server-side check: valid code / within radius","→ grant the stamp, log it with evidence"],["伺服器驗證：代碼有效／在半徑內","→ 發放印章並寫入含證據的日誌"],
   alt={"vi":["Không đạt → báo lý do, thử lại;","camera hỏng → nhập mã tay"],"en":["Fails → show the reason, retry;","camera broken → type the code manually"],"zh":["未通過 → 顯示原因並重試；","相機異常 → 手動輸入代碼"]}),
 S("C7","L","ext",["Mở AR trong LINE: camera nhận diện hình ảnh","→ hiện mô hình 3D (AR lỗi vẫn giữ con dấu)"],["AR opens inside LINE: camera recognises the image","→ 3D model appears (stamp is kept even if AR fails)"],["於 LINE 內開啟 AR：相機辨識圖像","→ 顯示 3D 模型（AR 失敗仍保留印章）"]),
 S("C8","S","sys",["Đủ ngưỡng con dấu","→ mở phần thưởng"],["Stamp threshold reached","→ unlock the reward"],["達到集章門檻","→ 解鎖獎勵"]),
 S("C9","P","user",["Xem con dấu và phần thưởng;","kết quả hiện ngay trong thống kê của khách hàng"],["View stamps and rewards;","the result shows immediately in the customer's statistics"],["查看印章與獎勵；","結果即時顯示於客戶統計"]),
]
FLOWS = [("A", FLOW_A), ("B", FLOW_B), ("C", FLOW_C)]

# --------------------------------------------------------------------------- helpers
COL = {"user": ("#e9f3ea", "#2f7a3c"), "sys": ("#e8eff9", "#2d5aa8"), "ext": ("#f1ecf7", "#6f4aa3")}
ACTOR_COL = {"Z": "#2f7a3c", "T": "#0f766e", "S": "#2d5aa8", "L": "#6f4aa3", "P": "#b45309", "D": "#6f4aa3"}
ACTOR_BG = {"Z": "#f5faf5", "T": "#f2f9f8", "S": "#f4f7fc", "L": "#f8f5fc", "P": "#fdf8f1", "D": "#f8f5fc"}
ALT = ("#fff8e6", "#d97706")
FONT = "'Helvetica Neue', Helvetica, 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', Arial, sans-serif"

def esc(s): return html.escape(s)

def tw(s, size):
    """approx text width in px"""
    w = 0
    for ch in s:
        w += size * (1.0 if unicodedata.east_asian_width(ch) in "WF" else 0.56)
    return w

import re
_TOK = re.compile(r'[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]|[^\s\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]+|\s+')

def wrap(line, maxw, size):
    """Wrap by words; CJK characters may break anywhere."""
    if tw(line, size) <= maxw: return [line]
    out, cur = [], ""
    for tok in _TOK.findall(line):
        if tok.isspace():
            if cur: cur += " "
            continue
        cand = cur + tok
        if tw(cand, size) <= maxw or not cur.strip():
            cur = cand
        else:
            out.append(cur.rstrip()); cur = tok
    if cur.strip(): out.append(cur.rstrip())
    return out

def text_lines(x, y, arr, size=12.5, weight=400, anchor="middle", fill="#1e2a3a", dy=16, bold_first=False):
    n = len(arr); y0 = y - (n - 1) * dy / 2
    return "".join(
        f'<text x="{x}" y="{y0 + i*dy:.1f}" font-size="{size}" font-weight="{700 if (bold_first and i==0) else weight}" '
        f'text-anchor="{anchor}" fill="{fill}" dominant-baseline="middle">{esc(t)}</text>' for i, t in enumerate(arr))

def badge(x, y, n, color):
    return (f'<circle cx="{x}" cy="{y}" r="11" fill="{color}"/>'
            f'<text x="{x}" y="{y+0.5}" font-size="11" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="middle">{n}</text>')

def step_lines(step, w, lang, size):
    return [l for raw in step["text"][lang] for l in wrap(raw, w - 50, size)]

def step_box(x, y, w, h, step, n, lang, size=12.5):
    fill, stroke = COL[step["kind"]]
    lines = step_lines(step, w, lang, size)
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9" fill="{fill}" stroke="{stroke}" stroke-width="1.6"/>'
            + badge(x + 16, y + 16, n, stroke)
            + text_lines(x + w/2 + 8, y + h/2, lines, size, 500, dy=15.5))

def alt_lines(step, w, lang):
    return [l for raw in step["alt"][lang] for l in wrap(raw, w - 24, 11.5)]

def alt_box(x, y, w, h, step, lang, tag):
    lines = alt_lines(step, w, lang)
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="7" fill="{ALT[0]}" stroke="{ALT[1]}" stroke-width="1.4" stroke-dasharray="6 4"/>'
            f'<rect x="{x+10}" y="{y-9}" width="{tw(tag,10.5)+16:.0f}" height="18" rx="9" fill="{ALT[1]}"/>'
            f'<text x="{x+18}" y="{y}" font-size="10.5" font-weight="700" fill="#fff" dominant-baseline="middle">{esc(tag)}</text>'
            + text_lines(x + w/2, y + 12 + (h-12)/2, lines, 11.5, 400, fill="#7c3f00", dy=14.5))

def poly(points, color="#1e2a3a", dashed=False, width=1.7, marker="arw"):
    d = " ".join(f"{p[0]:.1f},{p[1]:.1f}" for p in points)
    dash = ' stroke-dasharray="6 5"' if dashed else ""
    return f'<polyline points="{d}" fill="none" stroke="{color}" stroke-width="{width}"{dash} marker-end="url(#{marker})"/>'

def defs():
    return ('<defs>'
            '<marker id="arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#1e2a3a"/></marker>'
            '<marker id="arwo" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#d97706"/></marker>'
            '</defs>')

def svg_wrap(W, H, body):
    W, H = int(round(W)), int(round(H))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="{FONT}">'
            + defs() + f'<rect width="{W}" height="{H}" fill="#ffffff"/>' + body + '</svg>')

def header(W, lang, y=0):
    return (f'<rect x="30" y="{y+22}" width="{W-60}" height="78" rx="10" fill="#15213a"/>'
            f'<text x="{W/2}" y="{y+54}" font-size="24" font-weight="800" fill="#fff" text-anchor="middle">{esc(T["title"][lang])}</text>'
            f'<text x="{W/2}" y="{y+82}" font-size="13.5" fill="#c9d3e6" text-anchor="middle">{esc(T["subtitle"][lang])}</text>')

def overview(W, lang, y):
    """Relationship strip: Zoustec -> Tenant -> Player, all on top of the platform system."""
    s = [f'<text x="30" y="{y+14}" font-size="15" font-weight="700" fill="#15213a">{esc(T["overview_h"][lang])}</text>']
    by = y + 52; bh = 64; bw = 300
    xs = {"Z": W/2 - 560, "T": W/2 - 150, "P": W/2 + 260}
    for k, x in xs.items():
        c = ACTOR_COL[k]
        s.append(f'<rect x="{x}" y="{by}" width="{bw}" height="{bh}" rx="10" fill="{ACTOR_BG[k]}" stroke="{c}" stroke-width="2"/>')
        s.append(text_lines(x + bw/2, by + bh/2, T["actors"][k][lang], 14, 700, fill=c, dy=18, bold_first=True))
    # arrows Z->T, T->P
    s.append(poly([(xs["Z"]+bw, by+bh/2-8), (xs["T"], by+bh/2-8)]))
    s.append(text_lines((xs["Z"]+bw+xs["T"])/2, by-16, wrap(T["handoff"]["AB"][lang], 340, 11.5), 11.5, 500, fill="#3b4a5e", dy=13))
    s.append(poly([(xs["T"]+bw, by+bh/2-8), (xs["P"], by+bh/2-8)]))
    s.append(text_lines((xs["T"]+bw+xs["P"])/2, by-16, wrap(T["handoff"]["BC"][lang], 340, 11.5), 11.5, 500, fill="#3b4a5e", dy=13))
    # feedback P -> T
    s.append(poly([(xs["P"], by+bh/2+14), (xs["T"]+bw, by+bh/2+14)], dashed=True))
    s.append(text_lines((xs["T"]+bw+xs["P"])/2, by+bh+18, wrap(T["handoff"]["CB"][lang], 340, 11.5), 11.5, 500, fill="#3b4a5e", dy=13))
    # system bar
    sy = by + bh + 44
    s.append(f'<rect x="{xs["Z"]}" y="{sy}" width="{xs["P"]+bw-xs["Z"]}" height="46" rx="8" fill="#e8eff9" stroke="#2d5aa8" stroke-width="1.6"/>')
    s.append(text_lines((xs["Z"]+xs["P"]+bw)/2, sy+23, T["overview_sys"][lang], 12.5, 600, fill="#2d5aa8", dy=15, bold_first=True))
    for k, x in xs.items():
        s.append(poly([(x+bw/2, by+bh), (x+bw/2, sy)], color="#2d5aa8", dashed=True, width=1.3, marker="arw"))
    return "".join(s), sy + 46 + 30

def legend(W, lang, y, fmt):
    s = [f'<rect x="30" y="{y}" width="{W-60}" height="44" rx="8" fill="#fbfbfc" stroke="#cfd4dc" stroke-dasharray="5 4"/>']
    x = 60; cy = y + 22
    for kind, label in T["legend_A"][lang]:
        if kind in COL:
            f, st = COL[kind]; s.append(f'<rect x="{x}" y="{cy-9}" width="24" height="18" rx="4" fill="{f}" stroke="{st}"/>')
        elif kind == "alt":
            s.append(f'<rect x="{x}" y="{cy-9}" width="24" height="18" rx="4" fill="{ALT[0]}" stroke="{ALT[1]}" stroke-dasharray="4 3"/>')
        elif kind == "flow":
            s.append(poly([(x, cy), (x+26, cy)]))
        elif kind == "data":
            s.append(poly([(x, cy), (x+26, cy)], dashed=True))
        s.append(f'<text x="{x+34}" y="{cy}" font-size="12.5" fill="#1e2a3a" dominant-baseline="middle">{esc(label)}</text>')
        x += 34 + tw(label, 12.5) + 40
    return "".join(s), y + 44

# --------------------------------------------------------------------------- format A: BPMN swimlanes
def render_A(lang):
    BW, PITCH, FS = 214, 248, 11.5
    nmax = max(len(st) for _, st in FLOWS)
    W = 230 + (nmax - 1) * PITCH + BW + 60
    body = [header(W, lang)]
    y = 130
    ov, y = overview(W, lang, y)
    body.append(ov)
    for fid, steps in FLOWS:
        actors = []
        for st in steps:
            if st["actor"] not in actors: actors.append(st["actor"])
        BH = max(max(len(step_lines(st, BW, lang, FS)) for st in steps) * 15.5 + 22, 64)
        ALT_H = {st["id"]: len(alt_lines(st, BW + 12, lang)) * 14.5 + 22 for st in steps if st["alt"]}
        LANE_H = BH + 56
        lane_h = {a: LANE_H + (max([ALT_H[st["id"]] for st in steps if st["alt"] and st["actor"] == a], default=0) + 14) for a in actors}
        pool_h = 40 + sum(lane_h.values())
        # pool title band
        body.append(f'<rect x="30" y="{y}" width="{W-60}" height="40" rx="8" fill="#15213a"/>')
        body.append(f'<text x="50" y="{y+21}" font-size="15" font-weight="700" fill="#fff" dominant-baseline="middle">{esc(T["flows"][fid][lang])}</text>')
        ly = y + 40
        lane_cy = {}
        for a in actors:
            c = ACTOR_COL[a]; h = lane_h[a]
            body.append(f'<rect x="30" y="{ly}" width="{W-60}" height="{h}" fill="{ACTOR_BG[a]}" stroke="{c}" stroke-opacity="0.6" stroke-width="1.2"/>')
            body.append(f'<rect x="30" y="{ly}" width="150" height="{h}" fill="{c}" fill-opacity="0.12" stroke="{c}" stroke-opacity="0.6" stroke-width="1.2"/>')
            body.append(text_lines(105, ly + h/2, T["actors"][a][lang], 13.5, 700, fill=c, dy=18, bold_first=True))
            lane_cy[a] = ly + (LANE_H)/2
            ly += h
        # steps
        pos = {}
        x0 = 230
        for i, st in enumerate(steps):
            x = x0 + i * PITCH; cy = lane_cy[st["actor"]]
            body.append(step_box(x, cy - BH/2, BW, BH, st, i+1, lang, FS))
            pos[st["id"]] = (x, cy)
            if st["alt"]:
                body.append(alt_box(x - 6, cy + BH/2 + 22, BW + 12, ALT_H[st["id"]], st, lang, T["alt_tag"][lang]))
                body.append(poly([(x + BW/2, cy + BH/2), (x + BW/2, cy + BH/2 + 22)], color=ALT[1], dashed=True, width=1.3, marker="arwo"))
        # arrows
        for i in range(len(steps) - 1):
            a, b = steps[i], steps[i+1]
            (xa, ya), (xb, yb) = pos[a["id"]], pos[b["id"]]
            if ya == yb:
                body.append(poly([(xa + BW, ya), (xb, yb)]))
            else:
                xm = xa + BW + (PITCH - BW)/2
                body.append(poly([(xa + BW, ya), (xm, ya), (xm, yb), (xb, yb)]))
        y += pool_h
        # hand-off band
        if fid != "C":
            key = "AB" if fid == "A" else "BC"
            body.append(f'<rect x="30" y="{y}" width="{W-60}" height="36" fill="#fff8e6" stroke="#d97706" stroke-opacity="0.6"/>')
            body.append(f'<text x="{W/2}" y="{y+18}" font-size="12.5" font-weight="600" fill="#7c3f00" text-anchor="middle" dominant-baseline="middle">▼  {esc(T["handoff"][key][lang])}</text>')
            y += 36 + 26
        else:
            y += 26
    lg, y = legend(W, lang, y, "A")
    body.append(lg)
    return svg_wrap(W, y + 30, "".join(body))

# --------------------------------------------------------------------------- format B: vertical columns
def render_B(lang):
    W = 1700
    cols = ["Z", "T", "S", "L", "P"]
    CX0, CW, GAP = 40, 316, 10
    colx = {c: CX0 + i * (CW + GAP) for i, c in enumerate(cols)}
    BW_, FS = CW - 28, 12
    body = [header(W, lang)]
    y = 130
    ov, y = overview(W, lang, y)
    body.append(ov)
    top = y
    # column headers
    body.append("")  # placeholder index for column backgrounds (filled later)
    bg_idx = len(body) - 1
    y += 46
    y0 = y
    for fid, steps in FLOWS:
        # section band
        body.append(f'<rect x="{CX0}" y="{y}" width="{W-2*CX0}" height="34" rx="6" fill="#15213a"/>')
        body.append(f'<text x="{CX0+14}" y="{y+18}" font-size="14" font-weight="700" fill="#fff" dominant-baseline="middle">{esc(T["flows"][fid][lang])}</text>')
        y += 34 + 22
        pos = {}
        GAPY = 26
        for i, st in enumerate(steps):
            actor = "L" if st["actor"] == "D" else st["actor"]
            x = colx[actor] + 14
            BH_ = max(len(step_lines(st, BW_, lang, FS)) * 15.5 + 22, 56)
            body.append(step_box(x, y, BW_, BH_, st, i+1, lang, FS))
            pos[st["id"]] = (x, y, BH_)
            if st["alt"]:
                side = -1 if actor in ("P",) else 1
                ax = x + side * (CW + GAP)
                ah = max(len(alt_lines(st, BW_, lang)) * 14.5 + 24, BH_)
                body.append(alt_box(ax, y + (BH_ - ah)/2, BW_, ah, st, lang, T["alt_tag"][lang]))
                if side == 1:
                    body.append(poly([(x + BW_, y + BH_/2), (ax, y + BH_/2)], color=ALT[1], dashed=True, width=1.3, marker="arwo"))
                else:
                    body.append(poly([(x, y + BH_/2), (ax + BW_, y + BH_/2)], color=ALT[1], dashed=True, width=1.3, marker="arwo"))
            y += BH_ + GAPY
        # arrows
        for i in range(len(steps) - 1):
            a, b = steps[i], steps[i+1]
            (xa, ya, ha), (xb, yb, hb) = pos[a["id"]], pos[b["id"]]
            if xa == xb:
                body.append(poly([(xa + BW_/2, ya + ha), (xb + BW_/2, yb)]))
            else:
                ym = ya + ha + GAPY/2
                body.append(poly([(xa + BW_/2, ya + ha), (xa + BW_/2, ym), (xb + BW_/2, ym), (xb + BW_/2, yb)]))
        # hand-off
        if fid != "C":
            key = "AB" if fid == "A" else "BC"
            body.append(f'<rect x="{CX0}" y="{y-10}" width="{W-2*CX0}" height="30" rx="6" fill="#fff8e6" stroke="#d97706" stroke-opacity="0.6" stroke-dasharray="6 4"/>')
            body.append(f'<text x="{W/2}" y="{y+5}" font-size="12.5" font-weight="600" fill="#7c3f00" text-anchor="middle" dominant-baseline="middle">▼  {esc(T["handoff"][key][lang])}</text>')
            y += 44
        else:
            y += 6
    bottom = y
    # column backgrounds + headers (drawn beneath content)
    bg = []
    for c in cols:
        x = colx[c]; col = ACTOR_COL[c]
        bg.append(f'<rect x="{x}" y="{top}" width="{CW}" height="{bottom-top}" rx="8" fill="{ACTOR_BG[c]}" stroke="{col}" stroke-opacity="0.45" stroke-width="1.2"/>')
        bg.append(f'<rect x="{x}" y="{top}" width="{CW}" height="40" rx="8" fill="{col}" fill-opacity="0.14"/>')
        bg.append(text_lines(x + CW/2, top + 20, [T["actors"][c][lang][0] + " " + T["actors"][c][lang][1]], 13, 700, fill=col))
    body[bg_idx] = "".join(bg)
    lg, y = legend(W, lang, bottom + 16, "B")
    body.append(lg)
    return svg_wrap(W, y + 30, "".join(body))

# --------------------------------------------------------------------------- main
def main():
    outs = []
    for lang in LANGS:
        for fmt, fn in (("A-bpmn", render_A), ("B-columns", render_B)):
            svg = fn(lang)
            code = {"vi": "vi", "en": "en", "zh": "zh-TW"}[lang]
            p = os.path.join(OUT, f"zoustec-workflows-{fmt}-{code}.svg")
            open(p, "w").write(svg)
            outs.append(p)
    if os.path.exists(CHROME):
        for p in outs:
            svg = open(p).read()
            w = int(svg.split('width="')[1].split('"')[0]); h = int(svg.split('height="')[1].split('"')[0])
            png = p[:-4] + ".png"
            subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                            f"--window-size={w},{h}", "--force-device-scale-factor=2",
                            f"--screenshot={png}", f"file://{p}"], check=True, capture_output=True)
            print("ok", os.path.basename(png), f"{w}x{h}")
    else:
        print("Chrome not found — SVG only")

if __name__ == "__main__":
    main()
