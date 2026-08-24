#!/usr/bin/env python3
"""Generate the 'LINE channel / LIFF provisioning' BPMN in 3 languages (HTML + PNG)."""
import html, os, subprocess, sys

OUT = os.path.dirname(os.path.abspath(__file__))
NAMES = {"vi": "line-liff-provisioning-vi", "en": "line-liff-provisioning-en", "zh": "line-liff-provisioning-zh-TW"}
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

L = {
 "vi": dict(
  title="Quy trình cấu hình kênh LINE & LIFF cho khách hàng",
  subtitle="Luồng đã triển khai — khách hàng tự thao tác trong trang Thương hiệu (Zoustec có thể làm hộ từ Console), hệ thống tự tạo LIFF qua API của LINE",
  lane_admin=["Admin khách hàng", "(Trang Thương hiệu)"],
  lane_sys=["Hệ thống", "(Backend nền tảng)"],
  lane_line=["LINE", "(Console & API)"],
  start="Bắt đầu", end="Kết thúc",
  t1=["1. Mở trang Thương hiệu,", "đã lưu tên miền riêng"],
  t2=["2. Nhập Channel ID", "+ Channel Secret"],
  t3=["3. Bấm", "「Tự động tạo LIFF」"],
  t7=["7. Nhận LIFF ID", "và link vào sự kiện"],
  g1=["Đúng quyền", "admin khách hàng?"],
  g2=["Khách đã gắn", "tên miền riêng?"],
  deny1="Từ chối truy cập",
  deny2=["Yêu cầu gắn", "tên miền trước"],
  t4=["4. Xin access token", "của channel"],
  t5=["5. Tạo / cập nhật LIFF app", "Endpoint = https://tên-miền-khách/"],
  t6=["6. Lưu cấu hình", "vào hồ sơ khách"],
  audit=["Nhật ký", "hoạt động"],
  t0=["0. Tạo LINE Login Channel", "trên LINE Developers Console", "(thủ công — LINE không có API)"],
  api_token=["LINE OAuth API", "cấp channel access token"],
  api_liff=["LIFF Server API", "tạo app, trả về LIFF ID"],
  yes="Có", no="Không",
  a_copy="sao chép Channel ID + Secret",
  a_tok_down="Channel ID + Secret", a_tok_up="access token",
  a_liff_down="tạo app / đặt endpoint", a_liff_up="LIFF ID",
  a_result="kết quả",
  result_h="Kết quả sau khi hoàn tất",
  result=[
   "• Người chơi mở link https://liff.line.me/{LIFF ID} từ LINE OA, Rich Menu hoặc mã QR của khách.",
   "• LINE mở thẳng website dưới tên miền riêng của khách; đăng nhập được xác minh bằng chính channel của khách.",
   "• Không nhập gì thêm: khách chỉ có LIFF chung của nền tảng thì hệ thống tự dùng LIFF chung (dự phòng theo chuỗi: khách → tên miền → chung).",
  ],
  legend=[("start","Sự kiện bắt đầu"),("end","Sự kiện kết thúc"),("user","Thao tác người dùng"),("sys","Xử lý hệ thống"),("ext","Dịch vụ bên ngoài (LINE)"),("gw","Điều kiện rẽ nhánh"),("db","Lưu trữ dữ liệu"),("msg","Luồng dữ liệu")],
  summary_h="Tóm tắt",
  summary=["Tạo channel (thủ công)","Mở hồ sơ khách","Nhập ID + Secret","Bấm tạo LIFF","Xin token","Tạo LIFF app","Lưu cấu hình","Nhận LIFF ID"],
 ),
 "en": dict(
  title="LINE Channel & LIFF Provisioning Flow for a Customer",
  subtitle="As implemented — the customer does it on the Branding page (Zoustec can assist from the Console); the system creates the LIFF app through LINE's API",
  lane_admin=["Customer Admin", "(Branding page)"],
  lane_sys=["System", "(Platform Backend)"],
  lane_line=["LINE", "(Console & API)"],
  start="Start", end="End",
  t1=["1. Open the Branding page,", "custom domain already saved"],
  t2=["2. Enter Channel ID", "+ Channel Secret"],
  t3=["3. Click", "“Create LIFF”"],
  t7=["7. Receive LIFF ID", "and the event entry link"],
  g1=["Customer admin", "permission?"],
  g2=["Custom domain", "bound?"],
  deny1="Access denied",
  deny2=["Bind a domain", "first"],
  t4=["4. Request the channel", "access token"],
  t5=["5. Create / update LIFF app", "Endpoint = https://customer-domain/"],
  t6=["6. Save configuration", "to the customer record"],
  audit=["Audit", "log"],
  t0=["0. Create a LINE Login Channel", "on the LINE Developers Console", "(manual — LINE offers no API)"],
  api_token=["LINE OAuth API", "issues channel access token"],
  api_liff=["LIFF Server API", "creates app, returns LIFF ID"],
  yes="Yes", no="No",
  a_copy="copy Channel ID + Secret",
  a_tok_down="Channel ID + Secret", a_tok_up="access token",
  a_liff_down="create app / set endpoint", a_liff_up="LIFF ID",
  a_result="result",
  result_h="Outcome",
  result=[
   "• Players open https://liff.line.me/{LIFF ID} from the customer's LINE OA, Rich Menu or QR code.",
   "• LINE opens the website directly under the customer's own domain; login is verified against the customer's own channel.",
   "• Nothing else to enter: a customer without their own channel simply uses the platform's shared LIFF (fallback chain: customer → domain → shared).",
  ],
  legend=[("start","Start event"),("end","End event"),("user","User task"),("sys","System task"),("ext","External service (LINE)"),("gw","Gateway"),("db","Data store"),("msg","Data flow")],
  summary_h="Summary",
  summary=["Create channel (manual)","Open customer","Enter ID + Secret","Click Create LIFF","Request token","Create LIFF app","Save config","Receive LIFF ID"],
 ),
 "zh": dict(
  title="客戶 LINE 頻道與 LIFF 設定流程",
  subtitle="已實作流程 — 客戶於品牌設定頁自行操作（Zoustec 亦可於後台代辦），系統透過 LINE API 自動建立 LIFF",
  lane_admin=["客戶管理員", "（品牌設定頁）"],
  lane_sys=["系統", "（平台後端）"],
  lane_line=["LINE", "（Console 與 API）"],
  start="開始", end="結束",
  t1=["1. 開啟品牌設定頁，", "已儲存自訂網域"],
  t2=["2. 輸入 Channel ID", "與 Channel Secret"],
  t3=["3. 點擊", "「自動建立 LIFF」"],
  t7=["7. 取得 LIFF ID", "與活動入口連結"],
  g1=["具客戶", "管理員權限？"],
  g2=["客戶已綁定", "自訂網域？"],
  deny1="存取拒絕",
  deny2=["請先綁定", "自訂網域"],
  t4=["4. 向 LINE 取得", "channel access token"],
  t5=["5. 建立／更新 LIFF app", "Endpoint = https://客戶網域/"],
  t6=["6. 儲存設定", "至客戶資料"],
  audit=["稽核", "日誌"],
  t0=["0. 於 LINE Developers Console", "建立 LINE Login Channel", "（手動 — LINE 未提供 API）"],
  api_token=["LINE OAuth API", "核發 channel access token"],
  api_liff=["LIFF Server API", "建立 app，回傳 LIFF ID"],
  yes="是", no="否",
  a_copy="複製 Channel ID + Secret",
  a_tok_down="Channel ID + Secret", a_tok_up="access token",
  a_liff_down="建立 app／設定 endpoint", a_liff_up="LIFF ID",
  a_result="結果",
  result_h="完成後的效果",
  result=[
   "• 玩家從客戶的 LINE 官方帳號、Rich Menu 或 QR Code 開啟 https://liff.line.me/{LIFF ID}。",
   "• LINE 直接以客戶自有網域開啟活動網站；登入由客戶自己的 channel 驗證。",
   "• 無需額外設定：未建立自有 channel 的客戶自動使用平台共用 LIFF（備援順序：客戶 → 網域 → 共用）。",
  ],
  legend=[("start","開始事件"),("end","結束事件"),("user","使用者任務"),("sys","系統任務"),("ext","外部服務（LINE）"),("gw","閘道條件"),("db","資料儲存"),("msg","資料流程")],
  summary_h="摘要流程",
  summary=["建立頻道（手動）","開啟客戶","輸入 ID + Secret","點擊建立 LIFF","取得 token","建立 LIFF app","儲存設定","取得 LIFF ID"],
 ),
}

W, H = 1900, 1330
Y_ADM, Y_SYS, Y_LINE, Y_BOT = 120, 400, 700, 940   # lane boundaries
CY_ADM, CY_SYS, CY_LINE = 245, 520, 830
BW, BH = 170, 84

def esc(s): return html.escape(s)

def lines(x, y, arr, size=13, weight=400, anchor="middle", fill="#1e2a3a", dy=17):
    n = len(arr); y0 = y - (n-1)*dy/2
    return "".join(f'<text x="{x}" y="{y0+i*dy:.0f}" font-size="{size}" font-weight="{weight if i==0 else 400}" text-anchor="{anchor}" fill="{fill}" dominant-baseline="middle">{esc(t)}</text>' for i,t in enumerate(arr))

def task(x, y, arr, kind):
    fill = {"user":"#e9f3ea","sys":"#e8eff9","ext":"#f1ecf7","sysw":"#e8eff9"}[kind]
    stroke = {"user":"#2f7a3c","sys":"#2d5aa8","ext":"#6f4aa3","sysw":"#2d5aa8"}[kind]
    w = {"user":BW,"sys":BW,"ext":190,"sysw":230}[kind]
    if kind=="sysw": kind="sys"
    return (f'<rect x="{x-w/2}" y="{y-BH/2}" width="{w}" height="{BH}" rx="10" fill="{fill}" stroke="{stroke}" stroke-width="1.6"/>'
            + lines(x, y, arr, 13, 600))

def gateway(x, y, arr, pos="above"):
    d = f'<polygon points="{x},{y-34} {x+34},{y} {x},{y+34} {x-34},{y}" fill="#fff5dc" stroke="#c9961a" stroke-width="1.6"/>' \
        f'<text x="{x}" y="{y+1}" font-size="16" text-anchor="middle" dominant-baseline="middle" fill="#9a6f00" font-weight="700">?</text>'
    if pos == "above":
        return d + lines(x, y-54, arr, 11.5, 600, dy=14)
    return d + lines(x-42, y, arr, 11.5, 600, anchor="end", dy=14)

def db(x, y, arr):
    return (f'<path d="M{x-28},{y-24} a28,9 0 0 0 56,0 a28,9 0 0 0 -56,0 v44 a28,9 0 0 0 56,0 v-44" fill="#ffffff" stroke="#445" stroke-width="1.5"/>'
            f'<path d="M{x-28},{y-24} a28,9 0 0 0 56,0" fill="none" stroke="#445" stroke-width="1.5"/>'
            + lines(x, y+48, arr, 12, 600))

def circ(x, y, label, kind):
    if kind=="start":
        c = f'<circle cx="{x}" cy="{y}" r="20" fill="#e9f3ea" stroke="#2f7a3c" stroke-width="2"/>'
    else:
        c = f'<circle cx="{x}" cy="{y}" r="20" fill="#fbe5e5" stroke="#c0392b" stroke-width="3"/>'
    return c + lines(x, y+36, [label] if isinstance(label,str) else label, 12, 600)

def arrow(points, label=None, dashed=False, lx=None, ly=None, anchor="middle"):
    d = " ".join(f"{p[0]},{p[1]}" for p in points)
    dash = 'stroke-dasharray="6 5"' if dashed else ''
    s = f'<polyline points="{d}" fill="none" stroke="#1e2a3a" stroke-width="1.6" {dash} marker-end="url(#arw)"/>'
    if label:
        if lx is None: lx = (points[0][0]+points[-1][0])/2
        if ly is None: ly = (points[0][1]+points[-1][1])/2 - 8
        s += f'<text x="{lx}" y="{ly}" font-size="11.5" fill="#3b4a5e" text-anchor="{anchor}" dominant-baseline="middle">{esc(label)}</text>'
    return s

def lane(y0, y1, arr, color, bg):
    return (f'<rect x="20" y="{y0}" width="{W-40}" height="{y1-y0}" fill="{bg}" stroke="{color}" stroke-width="1.4"/>'
            f'<rect x="20" y="{y0}" width="150" height="{y1-y0}" fill="{color}" fill-opacity="0.10" stroke="{color}" stroke-width="1.4"/>'
            + lines(95, (y0+y1)/2, arr, 14, 700, fill=color, dy=19))

def build(t):
    s = []
    s.append(f'<text x="{W/2}" y="48" font-size="30" font-weight="800" text-anchor="middle" fill="#15213a">{esc(t["title"])}</text>')
    s.append(f'<text x="{W/2}" y="84" font-size="15" text-anchor="middle" fill="#5a677a">{esc(t["subtitle"])}</text>')
    s.append(lane(Y_ADM, Y_SYS, t["lane_admin"], "#2f7a3c", "#f7fbf7"))
    s.append(lane(Y_SYS, Y_LINE, t["lane_sys"], "#2d5aa8", "#f5f8fd"))
    s.append(lane(Y_LINE, Y_BOT, t["lane_line"], "#6f4aa3", "#faf7fd"))

    # --- admin lane
    X_START, X1, X2, X3, X7, X_END = 230, 360, 580, 800, 1630, 1810
    s.append(circ(X_START, CY_ADM, t["start"], "start"))
    s.append(task(X1, CY_ADM, t["t1"], "user"))
    s.append(task(X2, CY_ADM, t["t2"], "user"))
    s.append(task(X3, CY_ADM, t["t3"], "user"))
    s.append(task(X7, CY_ADM, t["t7"], "user"))
    s.append(circ(X_END, CY_ADM, t["end"], "end"))
    s.append(arrow([(X_START+20,CY_ADM),(X1-BW/2,CY_ADM)]))
    s.append(arrow([(X1+BW/2,CY_ADM),(X2-BW/2,CY_ADM)]))
    s.append(arrow([(X2+BW/2,CY_ADM),(X3-BW/2,CY_ADM)]))
    s.append(arrow([(X7+BW/2,CY_ADM),(X_END-20,CY_ADM)]))

    # --- system lane
    XG1, XG2, X4, X5, X6, XDB = 800, 950, 1130, 1380, 1630, 1810
    s.append(gateway(XG1, CY_SYS, t["g1"], "left"))
    s.append(gateway(XG2, CY_SYS, t["g2"]))
    s.append(task(X4, CY_SYS, t["t4"], "sys"))
    s.append(task(X5, CY_SYS, t["t5"], "sysw"))
    s.append(task(X6, CY_SYS, t["t6"], "sys"))
    s.append(db(XDB, CY_SYS-12, t["audit"]))
    # t3 -> g1
    s.append(arrow([(X3,CY_ADM+BH/2),(XG1,CY_SYS-34)]))
    # g1 yes -> g2 ; no -> deny
    s.append(arrow([(XG1+34,CY_SYS),(XG2-34,CY_SYS)], t["yes"], ly=CY_SYS-12))
    s.append(arrow([(XG1,CY_SYS+34),(XG1,CY_SYS+34)]) if False else "")
    # deny circles sit in bottom of system lane: y=628
    DY = 630
    s.append(arrow([(XG1,CY_SYS+34),(XG1,DY-20)], t["no"], lx=XG1+10, ly=CY_SYS+60, anchor="start"))
    s.append(circ(XG1, DY, t["deny1"], "end"))
    s.append(arrow([(XG2,CY_SYS+34),(XG2,DY-20)], t["no"], lx=XG2+10, ly=CY_SYS+60, anchor="start"))
    s.append(circ(XG2, DY, t["deny2"], "end"))
    # g2 yes -> t4 -> t5 -> t6 -> (up) t7
    s.append(arrow([(XG2+34,CY_SYS),(X4-BW/2,CY_SYS)], t["yes"], ly=CY_SYS-12))
    s.append(arrow([(X4+BW/2,CY_SYS),(X5-115,CY_SYS)]))
    s.append(arrow([(X5+115,CY_SYS),(X6-BW/2,CY_SYS)]))
    s.append(arrow([(X6+BW/2,CY_SYS-12),(XDB-30,CY_SYS-12)], dashed=True))
    s.append(arrow([(X6,CY_SYS-BH/2),(X7,CY_ADM+BH/2)], t["a_result"], lx=X6+10, ly=(CY_SYS+CY_ADM)/2, anchor="start"))

    # --- LINE lane
    X0 = 430
    s.append(f'<rect x="{X0-190}" y="{CY_LINE-50}" width="380" height="100" rx="10" fill="#f1ecf7" stroke="#6f4aa3" stroke-width="1.6" stroke-dasharray="7 4"/>')
    s.append(lines(X0, CY_LINE, t["t0"], 13, 600))
    s.append(task(X4, CY_LINE, t["api_token"], "ext"))
    s.append(task(X5, CY_LINE, t["api_liff"], "ext"))
    # prereq -> t2 (dashed, up)
    s.append(arrow([(X2,CY_LINE-50),(X2,CY_ADM+BH/2)], t["a_copy"], dashed=True, lx=X2+8, ly=Y_SYS+30, anchor="start"))
    # t4 <-> token api
    s.append(arrow([(X4-30,CY_SYS+BH/2),(X4-30,CY_LINE-BH/2)], t["a_tok_down"], dashed=True, lx=X4-38, ly=Y_LINE+40, anchor="end"))
    s.append(arrow([(X4+30,CY_LINE-BH/2),(X4+30,CY_SYS+BH/2)], t["a_tok_up"], dashed=True, lx=X4+38, ly=Y_LINE+62, anchor="start"))
    # t5 <-> liff api
    s.append(arrow([(X5-30,CY_SYS+BH/2),(X5-30,CY_LINE-BH/2)], t["a_liff_down"], dashed=True, lx=X5-38, ly=Y_LINE+40, anchor="end"))
    s.append(arrow([(X5+30,CY_LINE-BH/2),(X5+30,CY_SYS+BH/2)], t["a_liff_up"], dashed=True, lx=X5+38, ly=Y_LINE+62, anchor="start"))

    # --- legend
    ly0 = Y_BOT+22
    s.append(f'<rect x="20" y="{ly0}" width="{W-40}" height="52" rx="8" fill="#fbfbfc" stroke="#cfd4dc" stroke-dasharray="5 4"/>')
    lx = 50; cy = ly0+26
    for kind,label in t["legend"]:
        if kind=="start": s.append(f'<circle cx="{lx+10}" cy="{cy}" r="9" fill="#e9f3ea" stroke="#2f7a3c" stroke-width="2"/>')
        elif kind=="end": s.append(f'<circle cx="{lx+10}" cy="{cy}" r="9" fill="#fbe5e5" stroke="#c0392b" stroke-width="2.5"/>')
        elif kind=="user": s.append(f'<rect x="{lx}" y="{cy-9}" width="22" height="18" rx="4" fill="#e9f3ea" stroke="#2f7a3c"/>')
        elif kind=="sys": s.append(f'<rect x="{lx}" y="{cy-9}" width="22" height="18" rx="4" fill="#e8eff9" stroke="#2d5aa8"/>')
        elif kind=="ext": s.append(f'<rect x="{lx}" y="{cy-9}" width="22" height="18" rx="4" fill="#f1ecf7" stroke="#6f4aa3"/>')
        elif kind=="gw": s.append(f'<polygon points="{lx+11},{cy-11} {lx+22},{cy} {lx+11},{cy+11} {lx},{cy}" fill="#fff5dc" stroke="#c9961a"/>')
        elif kind=="db": s.append(f'<path d="M{lx+2},{cy-8} a9,3 0 0 0 18,0 a9,3 0 0 0 -18,0 v14 a9,3 0 0 0 18,0 v-14" fill="#fff" stroke="#445"/>')
        elif kind=="msg": s.append(f'<line x1="{lx}" y1="{cy}" x2="{lx+24}" y2="{cy}" stroke="#1e2a3a" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#arw)"/>')
        s.append(f'<text x="{lx+32}" y="{cy}" font-size="12.5" fill="#1e2a3a" dominant-baseline="middle">{esc(label)}</text>')
        lx += 32 + 12 + len(label)*7.6 + 34

    # --- result + summary
    ry0 = ly0+68
    s.append(f'<rect x="20" y="{ry0}" width="{W-40}" height="{H-ry0-20}" rx="8" fill="#f7fbf7" stroke="#2f7a3c" stroke-opacity="0.5"/>')
    s.append(f'<text x="44" y="{ry0+26}" font-size="14" font-weight="700" fill="#2f7a3c">{esc(t["result_h"])}</text>')
    for i,line in enumerate(t["result"]):
        s.append(f'<text x="44" y="{ry0+52+i*21}" font-size="13" fill="#1e2a3a">{esc(line)}</text>')
    # summary chain
    sy = ry0+124
    s.append(f'<text x="44" y="{sy}" font-size="13" font-weight="700" fill="#2f7a3c">{esc(t["summary_h"])}</text>')
    sx = 120; step = (W-240)/(len(t["summary"])-1)
    for i,lab in enumerate(t["summary"]):
        cx = sx + i*step
        s.append(f'<circle cx="{cx}" cy="{sy+32}" r="13" fill="#ffffff" stroke="#2f7a3c" stroke-width="1.6"/>')
        s.append(f'<text x="{cx}" y="{sy+33}" font-size="12" font-weight="700" text-anchor="middle" dominant-baseline="middle" fill="#2f7a3c">{i}</text>')
        s.append(f'<text x="{cx}" y="{sy+62}" font-size="12" text-anchor="middle" fill="#1e2a3a">{esc(lab)}</text>')
        if i < len(t["summary"])-1:
            s.append(f'<line x1="{cx+20}" y1="{sy+32}" x2="{cx+step-22}" y2="{sy+32}" stroke="#1e2a3a" stroke-width="1.4" marker-end="url(#arw)"/>')

    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="\'Helvetica Neue\', Helvetica, \'PingFang TC\', \'Noto Sans TC\', Arial, sans-serif">'
           f'<defs><marker id="arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#1e2a3a"/></marker></defs>'
           f'<rect width="{W}" height="{H}" fill="#ffffff"/>' + "".join(s) + '</svg>')
    return f'<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;background:#fff}}</style></head><body>{svg}</body></html>'

for code, t in L.items():
    p = os.path.join(OUT, f"{NAMES[code]}.html")
    open(p, "w").write(build(t))
    png = os.path.join(OUT, f"{NAMES[code]}.png")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    f"--window-size={W},{H}", "--force-device-scale-factor=2",
                    f"--screenshot={png}", f"file://{p}"], check=True, capture_output=True)
    print("ok", png)
