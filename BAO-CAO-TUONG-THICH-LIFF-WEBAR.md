# Báo cáo tương thích LIFF + WebAR (Deliverable Giai đoạn 1)

> Trả lời 3 câu hỏi của spec Giai đoạn 1 (camera trong LIFF, hiệu năng
> WebGL/WebXR/SDK, chiến lược fallback) kèm 2 deliverables: **ma trận tương
> thích thiết bị** (mục 5) và **chiến lược khuyến nghị** (mục 6).
> Lập ngày **2026-07-09**. Nguồn trích dẫn ở mục 7.
>
> Công cụ đi kèm báo cáo này: trang đo tự động **`/diag`** — mở
> `https://liff.line.me/2010613964-3UzmddVV/diag` trên bất kỳ thiết bị nào
> → bấm 開始檢測 → chạy đúng stack AR production ~10 giây → bấm 複製結果
> gửi về. Mỗi máy test mất chưa tới 1 phút.

---

## 0. Kết luận nhanh

| Câu hỏi của spec | Trả lời |
|---|---|
| Camera có mở ổn định trong LIFF WebView không? | **Có** — iOS ≥ 14.3 và Android mọi phiên bản. Đã nghiệm thu chạy thật trên LINE iOS tại production. Sàn phiên bản LINE năm 2026 (iOS 17+/Android 10+) khiến rủi ro "OS quá cũ" gần như bằng 0. |
| WebGL / WebXR / SDK bên thứ ba khác nhau thế nào? | **WebXR không tồn tại trong LIFF trên cả iOS lẫn Android** (không phải chậm — là không có API). Con đường duy nhất trong LIFF là getUserMedia + WebGL. Trong nhóm này MindAR (đang dùng) là lựa chọn image-tracking tốt nhất còn sống; 8th Wall đã đóng cửa 2/2026. Benchmark ở mục 3.3. |
| Có cần fallback mở trình duyệt ngoài không? | **Giữ làm lối thoát, không phải chiến lược.** Phát hiện quan trọng: `openExternalBrowser=1` bị LINE **bỏ qua trên LIFF app** → nút cũ vô hiệu, đã sửa sang `liff.openWindow({external:true})`. Trình duyệt ngoài không cứu được lỗi camera (cùng sensor, cùng engine WebView). Fallback đảm bảo: **nhập mã tay + GPS** (đều đã có trong app). |
| Khuyến nghị | **Ở lại trong LIFF.** Chi tiết mục 6. |

---

## 1. Camera trong LIFF WebView

**Nền tảng kỹ thuật.** LINE xác nhận chính thức: LIFF browser dùng **WKWebView**
trên iOS và **Android System WebView** (Chromium) trên Android — "specifications
and behavior of the LIFF browser will also be in accordance with these schemes".

- **iOS**: `getUserMedia` được Apple mở cho WKWebView từ **iOS 14.3**
  (12/2020). Trước 14.3 camera im lặng không mở — đây là nguồn gốc các báo lỗi
  LIFF camera giai đoạn 2018–2020. Điều kiện: HTTPS bắt buộc, prompt quyền
  giống Safari, camera bị tắt khi LINE chạy nền.
- **Android**: WebView hỗ trợ `getUserMedia` từ Chromium 53 (2016); LINE cấp
  quyền camera cho WebView (bằng chứng: bảng hỗ trợ chính thức của
  `liff.scanCodeV2` ghi "Android: all versions" cho LIFF browser).
- **Sàn phiên bản 2026**: LINE hiện yêu cầu iOS 18+/Android 11+ cho bản mới
  nhất (iOS 17/Android 10 bị khóa ở bản LINE cũ hơn); LINE đã ngừng hỗ trợ app
  ≤ 13.20.0 từ 11/2025. Nghĩa là **mọi người dùng LINE thực tế năm 2026 đều
  vượt xa mốc iOS 14.3** — điều kiện camera coi như luôn thỏa.

**Bằng chứng chạy thật trong dự án** (không chỉ lý thuyết):

- Luồng AR 2 bước (quét QR bằng `getUserMedia`+jsqr → MindAR image tracking)
  **đã nghiệm thu trên LINE iOS thật tại production** (sessions 2026-07-07/08),
  gồm cả bản white-label BnK chạy qua LIFF channel riêng.
- Dự án chủ động **không dùng `liff.scanCodeV2`** (không ổn định đa nền tảng,
  từng bị LINE revert bản cập nhật 1/2024 vì giảm độ chính xác đọc mã) — QR
  chính thống là URL-token quét bằng camera thường, QR in-app tự xử lý bằng
  jsqr.

**Trạng thái: ✅ ĐÃ XÁC NHẬN — camera mở ổn định trong LIFF từ iOS 14.3+/mọi Android.**

---

## 2. WebXR / WebGL / SDK bên thứ ba — khả dụng ở đâu

Đây không phải chuyện "nhanh hay chậm": **WebXR đơn giản là không có mặt trong
LIFF**, nên so sánh hiệu năng thực chất là so giữa các engine getUserMedia+WebGL.

### 2.1 Ma trận khả dụng công nghệ (7/2026)

| Công nghệ | iOS LIFF (WKWebView) | Android LIFF (WebView) | Safari iOS (ngoài) | Chrome Android (ngoài) |
|---|---|---|---|---|
| WebGL / WebGL2 | ✅ | ✅ | ✅ | ✅ |
| getUserMedia (camera) | ✅ iOS 14.3+ | ✅ mọi bản | ✅ | ✅ |
| **WebXR immersive-ar** | ❌ không có API | ❌ WebView chưa từng ship WebXR (crbug 40652382 mở từ 2019) | ❌ Apple chưa ship WebXR trên iPhone (chỉ visionOS) | ✅ Chrome 81+ (ARCore) |
| WebAssembly | ✅ | ✅ | ✅ | ✅ |

Hệ quả then chốt: **ngay cả khi mở trình duyệt ngoài, iPhone vẫn không bao giờ
có WebXR** — nghĩa là "mở ngoài để AR xịn hơn" chỉ đúng cho Android+Chrome,
tức không thể là chiến lược chung cho thị trường Đài Loan (iPhone chiếm tỷ
trọng lớn).

### 2.2 Tình hình SDK bên thứ ba (biến động lớn 2025–2026)

| SDK | Tracking | Chạy trong LIFF? | Chi phí | Tình trạng 7/2026 |
|---|---|---|---|---|
| **MindAR** (đang dùng) | Image target | ✅ (getUserMedia+WebGL, đã chạy thật) | Miễn phí, MIT, tự host | ⚠️ Không còn maintainer active từ 1/2024 (bản cuối v1.2.5); vẫn là OSS image-tracking tốt nhất — chính README AR.js khuyên dùng MindAR cho image tracking |
| AR.js (NFT) | Image target | ✅ về lý thuyết | Miễn phí, MIT | Repo còn sống (3.4.8, 3/2026) nhưng engine NFT dựa trên upstream chết (jsartoolkit5 ngừng 2021); jitter được thừa nhận trong docs, cộng đồng đo ~14fps trên iPhone 12 Pro |
| **8th Wall** | SLAM world + image | ✅ (WKWebView 14.3+) | — | ❌ **Đã đóng cửa**: hết subscription 28/2/2026, hosting chết 28/2/2027; chỉ còn bản community tự host (MIT + SLAM binary), không SLA |
| Zappar Universal AR | Image/face/instant world | ✅ WKWebView 14.3+ (docs chính thức; không nhắc LINE đích danh) | Pro **$315/tháng** nhưng chỉ 12.000 views/**năm**; SDK bắt buộc phone-home license | Lựa chọn thương mại chính còn lại |
| Blippar WebAR SDK | SLAM + marker | Chưa xác nhận với LINE | £250/tháng unlimited views, cho tự host | Hoạt động |
| Onirix | Nhiều loại | — | — | ❌ Đóng cửa: ngừng nhận account 8/2025, tắt hẳn 9/2026 |

**Đánh giá**: lựa chọn MindAR của dự án đứng vững, thậm chí vững hơn sau biến
động: đối thủ thương mại lớn nhất (8th Wall) biến mất, Zappar đắt và giới hạn
views không hợp mô hình sự kiện đông người chơi. Rủi ro MindAR dormant đã được
phòng bị sẵn bằng **engine seam** trong `ARStage.jsx` (thay engine không đổi
contract trang) + version pin trong `package.json`. Khi engine chính thức của
Zoustec sẵn sàng thì cắm vào seam này.

---

## 3. Benchmark hiệu năng

### 3.1 Phương pháp

Trang **`/diag`** (mới thêm, deploy cùng app) chạy **đúng stack production**
(MindAR + three.js + GLB có animation + camera thật) và đo:

- thời gian mở camera (`getUserMedia` → frame đầu tiên), độ phân giải thật
- thời gian nạp + khởi động engine
- **FPS trung bình trong 8 giây** vòng lặp render+tracking thật
- số khung giật (>50ms) và khung tệ nhất
- các cột khả dụng: WebGL/WebGL2, GPU, WebXR, WASM, có đang trong LINE không

Benchmark dưới đây chạy bằng Chrome headless + camera giả lập trên máy dev
(Apple M4), kèm **CPU throttle 4x/6x qua Chrome DevTools Protocol** để mô
phỏng thiết bị tầm trung/yếu — tracking của MindAR nặng CPU nên throttle CPU
là trục mô phỏng có ý nghĩa nhất. **Lưu ý trung thực: mô phỏng không thay thế
thiết bị thật** (GPU không bị throttle, camera là nguồn giả) — số trên phone
thật có thể thấp hơn; đó là lý do cần điền ma trận mục 5 bằng `/diag` trên
máy thật.

### 3.2 Kết quả đo được (2026-07-09)

| Cấu hình | Camera mở | Engine khởi động | FPS trung bình (8s) | Khung giật >50ms | Kết luận |
|---|---|---|---|---|---|
| Apple M4, Chrome 149 headless (chuẩn) | 440ms | nạp 1.1s + start 0.6s (warm) | **72 fps** | 0 | 達成 |
| — CPU throttle **4x** (~tầm trung khá) | 188ms | 1.2s + 0.6s | **40 fps** | 2 | 達成 |
| — CPU throttle **6x** (~máy yếu) | 217ms | 1.4s + 0.7s | **28 fps** | 30 (max 112ms) | 達成 (sát ngưỡng) |

Ngưỡng đánh giá dùng cho toàn dự án: **≥24fps = 達成**, 15–24fps = 勉強可用
(chơi được nhưng không mượt), <15fps = 未達成.

Ghi chú thêm:

- Lần chạy **nguội đầu tiên** engine mất ~6.6s khởi động (compile/nạp lần
  đầu); các lần sau 0.6–0.7s. Trên mạng di động lần đầu sẽ cộng thời gian tải
  ~1.2MB (engine MindAR ~440KB + three.js + target ~380KB) — màn AR đã có
  trạng thái "正在啟動 AR 引擎…" che khoảng chờ này.
- WebXR `immersive-ar` trả về **không hỗ trợ ngay cả trên Chrome desktop** —
  minh họa đúng kết luận mục 2: không thể lấy WebXR làm baseline so sánh vì
  nó không chạy được ở môi trường mục tiêu.

### 3.3 Đối chiếu với số liệu bên ngoài

- MindAR: không công bố FPS chính thức; kiến trúc (feature detection trên
  web worker + GPU qua TensorFlow.js custom ops + one-euro filter chống rung).
- AR.js NFT: cộng đồng đo **~14fps trên iPhone 12 Pro** (issue #324, không
  được trả lời) — thua xa MindAR cùng máy.
- 8th Wall từng công bố SLAM 30fps là mục tiêu runtime của họ.
- Pin/nhiệt (nghiên cứu ngành): WebGL tải nặng kéo 4–7W trên flagship —
  throttle nhiệt bắt đầu sau 60–90 giây trên máy yếu, 2–5 phút trên flagship.
  Thiết kế hiện tại của app đã hợp lý: **phiên AR ngắn theo từng nhiệm vụ**
  (vài chục giây–vài phút), không phải AR liên tục.

**Kỳ vọng thực tế theo tầng thiết bị** (tổng hợp benchmark + dữ liệu ngành):
iPhone A14+ (iPhone 12 trở lên) ≈ mượt 45–60fps; Android tầm trung
(Snapdragon 6-series) ≈ 25–40fps; Android yếu/cũ ≈ 15–25fps, có thể tụt sau
1–2 phút do nhiệt. Xác nhận cuối cùng bằng ma trận mục 5.

---

## 4. Fallback — phân tích đầy đủ

### 4.1 Phát hiện mới quan trọng: nút "mở trình duyệt ngoài" cũ vô hiệu trong LIFF

Tài liệu chính thức LINE ghi rõ: các query parameter dạng
`openExternalBrowser=1` "work for all URLs accessed from the LINE app,
**except for on LIFF apps**". Tức nút fallback cũ trong `ARStage.jsx` (thêm
param vào chính URL LIFF) **không có tác dụng** khi người chơi đang ở trong
LIFF — đúng nơi cần nó nhất.

**Đã sửa trong commit này**: nút gọi `liff.openWindow({url, external: true})`
khi đang trong LIFF browser (cách chính thức duy nhất), giữ query param làm
fallback cho in-app browser thường/trình duyệt ngoài.

### 4.2 Trình duyệt ngoài KHÔNG phải fallback đảm bảo cho lỗi camera

Giữ nguyên kết luận của FALLBACK_RESEARCH_NOTES.md, nay có thêm nguồn xác nhận:

| Nguyên nhân camera fail trong LIFF | Mở ngoài có cứu được? |
|---|---|
| Người dùng từ chối quyền | ❌ (sẽ từ chối tiếp / bị chặn hệ thống) |
| Camera hỏng / app khác chiếm | ❌ cùng sensor |
| Bug WebView của bản LINE cụ thể | ✅ **trường hợp duy nhất có ích** — Safari/Chrome ngoài là engine instance khác |
| Máy quá yếu (FPS thấp) | ❌ cùng phần cứng |

Giá trị thật của nút mở ngoài: thoát bug đặc thù phiên bản LINE. Chấp nhận
chi phí: rời LIFF làm mất session đăng nhập tự động → người chơi phải login
lại bằng LINE web login.

### 4.3 LINE MINI App — câu hỏi mở đã có đáp án

FALLBACK_RESEARCH_NOTES.md đặt câu hỏi: "MINI App có camera module khác
không?" **Đáp án chính thức: KHÔNG.** LINE docs: "The LINE MINI App runs as a
LIFF app" — cùng LIFF browser, cùng WKWebView/Android WebView, cùng đường
getUserMedia. MINI App **không phải fallback camera**.

Ngược lại, tin tốt cho kiến trúc: LINE đang hợp nhất LIFF vào thương hiệu
MINI App (roadmap 12/2024; từ 2/2025 LINE khuyến nghị tạo LIFF app mới dưới
dạng MINI App). Nghĩa là yêu cầu spec "dự phòng khả năng tích hợp LINE MINI
App" **được thỏa mãn tự nhiên**: app hiện tại đã là LIFF app chuẩn, chuyển
sang MINI App chủ yếu là thủ tục đăng ký/review + đổi permalink, không phải
viết lại.

### 4.4 Chuỗi fallback chuẩn của hệ thống (đã hiện thực đủ trong code)

```
Camera AR fail
  ├─ 1. Nút 重試 (thử lại — lỗi thoáng qua)                    [ARStage]
  ├─ 2. Nút 在外部瀏覽器開啟 (liff.openWindow external)          [ARStage — sửa hôm nay]
  └─ 3. Không cần camera vẫn hoàn thành nhiệm vụ:
       ├─ QR: ô 手動輸入代碼 (nhập mã in trên standee)           [experience/ar]
       ├─ GPS: xác minh vị trí (sensor độc lập với camera)      [experience/ar]
       └─ AR chỉ là lớp trải nghiệm — verify QR/GPS mới là điều
          kiện nhận stamp, nên camera hỏng không chặn tiến độ chơi
```

---

## 5. Deliverable 1 — Ma trận tương thích thiết bị

**Cách điền 1 hàng (≈1 phút/máy)**: mở LINE → vào
`https://liff.line.me/2010613964-3UzmddVV/diag` (hoặc qua LIFF BnK:
`https://liff.line.me/2010638570-ZXXAqde5/diag`) → 開始檢測 → cho phép camera
→ chờ ~10s → 複製結果 → dán gửi về. Trang tự chấm 達成/勉強可用/未達成.

| # | Thiết bị | OS | LINE ver | Môi trường | Camera mở | FPS | Kết luận | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| 1 | iPhone (máy nghiệm thu của Đức) | iOS (bản hiện hành) | bản hiện hành | LIFF thật (prod) | ✅ | *chưa đo số* | **達成** | Nghiệm thu chạy thật luồng QR+AR 07–08/07; chạy lại `/diag` để có số FPS |
| 1b | Android (máy test của Đức) | Android | bản hiện hành | LIFF thật trong LINE | ✅ | *chưa đo số* | **達成** | Test 2026-07-09: camera + AR chạy được trong LINE; chạy `/diag` để lấy số FPS |
| 2 | Apple M4 (Mac, tham chiếu) | macOS 15 | — | Chrome 149 headless + camera giả | ✅ 440ms | 72 | 達成 | Baseline benchmark |
| 3 | — mô phỏng tầm trung (CPU 4x) | — | — | như trên | ✅ | 40 | 達成 | Mô phỏng, không thay máy thật |
| 4 | — mô phỏng máy yếu (CPU 6x) | — | — | như trên | ✅ | 28 | 達成 (sát ngưỡng) | 30 khung giật/8s |
| 5 | iPhone đời cao (15/16/17) | iOS 18+ | | LIFF | | | *(chờ test)* | |
| 6 | iPhone đời thấp còn phổ biến (SE2/11/12) | iOS 17–18 | | LIFF | | | *(chờ test)* | |
| 7 | Android cao cấp (Samsung S-series/Pixel) | Android 14+ | | LIFF | | | *(chờ test)* | **Ưu tiên test — chưa có datapoint Android thật nào** |
| 8 | Android tầm trung (Samsung A-series...) | Android 12–14 | | LIFF | | | *(chờ test)* | Ưu tiên test |
| 9 | Tablet/iPad (nếu khách quan tâm) | | | LIFF | | | *(chờ test)* | |

**Cập nhật 2026-07-09**: đã có 1 datapoint Android thật (hàng #1b — chạy được
trong LINE). Khuyến nghị tối thiểu trước bàn giao: thêm 1 iPhone đời thấp +
1 Android tầm trung khác model (2 hàng #6, #8), và chạy `/diag` trên các máy
đã test để có số FPS cụ thể.

Cột "đạt" định nghĩa: camera mở được trong LIFF + engine AR chạy + FPS ≥ 24.

---

## 6. Deliverable 2 — Chiến lược khuyến nghị: TRONG LIFF

### 6.1 Khuyến nghị chính

**Chạy toàn bộ trải nghiệm trong LIFF, không mở trình duyệt ngoài làm đường
chính.** Căn cứ:

1. **Yêu cầu gốc của khách hàng**: bấm link trong LINE → tự đăng nhập → chơi
   hết trong LINE. Mở ngoài phá vỡ đúng giá trị cốt lõi này (mất session LIFF,
   thêm bước login, người chơi lạc khỏi LINE OA).
2. **Kỹ thuật cho phép**: camera + WebGL chạy ổn trong LIFF từ iOS 14.3+/mọi
   Android; sàn phiên bản LINE 2026 bảo đảm điều kiện này với người dùng thật.
   Đã có bằng chứng chạy thật trên production.
3. **Mở ngoài không mua thêm được gì đáng kể**: iPhone ngoài LIFF vẫn không có
   WebXR; engine image-tracking chạy trong hay ngoài LIFF là cùng công nghệ,
   cùng tốc độ.
4. **Trong LIFF vẫn giữ được lối thoát**: nút mở ngoài (đã sửa đúng cách) cho
   ca bug WebView hiếm gặp, và nhập mã tay/GPS bảo đảm nhiệm vụ luôn hoàn
   thành được kể cả khi camera chết hẳn.

### 6.2 Kịch bản vận hành đề xuất (bảng quyết định)

| Tình huống | Hành vi hệ thống |
|---|---|
| Bình thường (đa số) | AR + QR + GPS trong LIFF |
| Camera AR lỗi thoáng qua | Người chơi bấm 重試 |
| LINE WebView có bug camera (hiếm) | Nút 在外部瀏覽器開啟 → Safari/Chrome, login lại, chơi tiếp |
| Camera hỏng/bị cấm hoàn toàn | Nhập mã tay (QR) hoặc GPS — vẫn nhận stamp, chỉ mất lớp hiệu ứng AR |
| Máy quá yếu (<15fps) | AR vẫn hiển thị (chậm); verify không phụ thuộc FPS. Tùy chọn tương lai: tự phát hiện qua số liệu `/diag` và tắt bớt hiệu ứng |

### 6.3 Dự phòng LINE MINI App (yêu cầu "kiến trúc linh hoạt" của spec)

- App hiện tại là LIFF app chuẩn → **đã tương thích MINI App về bản chất**
  (MINI App = LIFF app cùng runtime, LINE đang hợp nhất 2 thương hiệu).
- Camera/AR trong MINI App **giống hệt** LIFF — không cần thiết kế lại gì.
- Việc cần làm KHI khách muốn lên MINI App: đăng ký MINI App channel (có
  review của LINE), map lại permalink `https://miniapp.line.me/...`, tận dụng
  sẵn cơ chế `resolveLiffId`/multi-channel per-tenant đã có. Ước lượng:
  thủ tục > code.

### 6.4 Rủi ro còn lại & giảm nhẹ

| Rủi ro | Mức | Giảm nhẹ |
|---|---|---|
| MindAR không còn maintainer (bản cuối 1/2024) | Trung bình, dài hạn | Engine seam trong ARStage (thay được không đổi contract); version pin; kế hoạch cắm engine Zoustec chính thức |
| Memory leak MindAR khi chạy rất lâu (issue #386: ~250MB sau 15 phút) | Thấp | Phiên AR của app ngắn theo nhiệm vụ + `ARStage` dispose renderer khi rời màn (đã có) |
| Nhiệt/pin trên máy yếu khi AR liên tục | Thấp | Thiết kế nhiệm vụ rời rạc sẵn có; cân nhắc cap 30fps nếu nhận phàn nàn |
| Thiếu datapoint Android thật | **Cần xử lý trước bàn giao** | Điền ma trận mục 5 bằng `/diag` (1 phút/máy) |

---

## 7. Nguồn chính

**LINE chính thức**
- LIFF browser = WKWebView/Android WebView: https://developers.line.biz/en/docs/liff/overview/
- `openExternalBrowser=1` không áp dụng cho LIFF app: https://developers.line.biz/en/docs/line-login/using-line-url-scheme/
- Bảng hỗ trợ `scanCodeV2` (iOS 14.3+ LIFF browser; Android mọi bản): https://developers.line.biz/en/reference/liff/#scan-code-v2
- MINI App chạy như LIFF app: https://developers.line.biz/en/docs/line-mini-app/develop/web-to-mini-app/ ; hợp nhất LIFF→MINI App: https://developers.line.biz/en/news/2024/12/17/line-login-liff-roadmap/ , https://developers.line.biz/en/news/2025/02/12/line-mini-app/
- Sàn phiên bản LINE: https://help.line.me/line/?contentId=10002433 ; ngừng hỗ trợ ≤13.20.0: https://help.line.me/line/smartphone?contentId=200001460

**WebKit / Chromium / chuẩn web**
- getUserMedia trong WKWebView từ iOS 14.3: https://webkit.org/blog/11353/mediarecorder-api/ ; https://bugs.webkit.org/show_bug.cgi?id=208667
- WebXR không có trên Safari iOS (đến 26.5): https://caniuse.com/webxr ; chỉ visionOS: https://webkit.org/blog/15865/webkit-features-in-safari-18-0/
- WebXR chưa từng ship trong Android WebView: https://chromestatus.com/feature/5450241148977152 ; https://crbug.com/40652382

**SDK**
- MindAR (v1.2.5 cuối 1/2024, MIT): https://github.com/hiukim/mind-ar-js
- AR.js NFT ~14fps iPhone 12 Pro: https://github.com/AR-js-org/AR.js/discussions/324 ; README AR.js khuyên MindAR cho image tracking: https://github.com/AR-js-org/AR.js
- 8th Wall đóng cửa (hết subscription 28/2/2026, hosting đến 28/2/2027): https://forum.8thwall.com/t/important-changes-to-8th-wall-business/8578 ; https://8thwall.org/
- Zappar pricing + hỗ trợ WKWebView 14.3+: https://zap.works/pricing/ ; https://docs.zap.works/universal-ar/javascript/getting-started/compatibility/
- Onirix đóng cửa 9/2026: https://www.onirix.com/onirix-closure/

**Pin/nhiệt/hiệu năng WebGL di động**
- 4–7W, throttle 60–90s máy yếu: https://www.abratabia.com/mobile-browser-performance/battery-and-thermal.php
- Nghiên cứu WebAR năng lượng (IEEE 2019): Qiao et al., "Web AR: A Promising Future for Mobile Augmented Reality"
