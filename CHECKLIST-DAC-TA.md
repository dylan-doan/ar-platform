# Checklist đối chiếu Đặc tả Zoustec AR ↔ Hiện trạng hệ thống

> Đối chiếu theo đúng thứ tự các mục trong tài liệu đặc tả
> `Zoustec_AR_Ban_Dich_Tieng_Viet.docx`. Cập nhật: 2026-08-21.
>
> Trạng thái: Đã làm / Làm một phần / Chưa làm

---

## PHẦN 1 — ĐẶC TẢ HỆ THỐNG TỔNG THỂ

### III. Kiến trúc 3 tầng

| # | Yêu cầu | Trạng thái | Cách đã làm |
|---|---|---|---|
| III.1 | Multi-tenant: mỗi khách độc lập về dữ liệu sự kiện, người dùng, thương hiệu, tên miền | Đã làm | Tất cả khách dùng chung một hệ thống nhưng dữ liệu được gắn nhãn theo từng khách và cơ sở dữ liệu tự chặn ở tầng thấp nhất: một khách không thể nhìn thấy dữ liệu của khách khác dù phần mềm có lỗi. Mỗi phiên đăng nhập chỉ có quyền trong phạm vi khách của mình |
| III.2 | Tự tạo kiến trúc website theo loại sự kiện (thành phố / leo núi / khu mua sắm) | Đã làm | Khi tạo sự kiện, admin chọn loại; hệ thống tự sinh bộ khối nội dung phù hợp (ví dụ leo núi có nhắc nhở an toàn và thông tin tuyến; mua sắm có vị trí cửa hàng). Website được xuất bản thành trang tĩnh theo từng phiên bản, có thể xem lại hoặc quay về bản cũ |
| III.3 | Tham gia qua trình duyệt web và LINE LIFF, không cần cài app | Đã làm | Cùng một website chạy được cả trên trình duyệt thường lẫn bên trong LINE. Đã chạy thật trên tên miền riêng của khách |

### IV. AI tạo nội dung 3D

| # | Yêu cầu | Trạng thái | Cách đã làm |
|---|---|---|---|
| IV.1 | Tải lên hình ảnh 2D | Đã làm | Màn hình AR Studio cho phép nhân viên marketing kéo thả ảnh linh vật lên, không cần kỹ thuật |
| IV.2 | Tự động tạo mô hình 3D | Đã làm | Sau khi tải ảnh, hệ thống gửi sang dịch vụ AI tạo 3D (hiện dùng Meshy, đã chạy thật), vài phút sau có mô hình. Đã chừa sẵn chỗ cắm engine của Zoustec khi có |
| IV.3 | Điều chỉnh cơ bản (màu sắc, tỷ lệ) | Đã làm | Có nút đổi màu/chất liệu, chỉnh kích thước, và thêm chuyển động đi/chạy cho nhân vật |
| IV.4 | Xuất để dùng trong WebAR | Đã làm | Bấm một nút để gắn mô hình vào nhiệm vụ; hệ thống tự chuẩn bị tệp nhận diện hình ảnh ngay trên trình duyệt, không cần cài phần mềm |

### V. WebAR

| # | Yêu cầu | Trạng thái | Cách đã làm |
|---|---|---|---|
| V.1 | Kích hoạt bằng quét QR hoặc GPS | Đã làm | Người chơi quét QR hoặc xác nhận vị trí xong thì màn hình AR tự mở |
| V.2 | Hiển thị mô hình 3D | Đã làm | Camera điện thoại nhận diện hình ảnh đích và hiện mô hình 3D đè lên; chạy được ngay trong LINE trên cả iPhone và Android |
| V.3 | Chụp ảnh hoặc tương tác đơn giản (tùy chọn) | Làm một phần | Có tương tác cơ bản với mô hình; chưa có nút chụp ảnh lưu về máy |
| V.4 | Giao diện tích hợp cho engine AR của Zoustec | Đã làm | Phần tạo 3D và phần hiển thị AR được tách rời rõ ràng, Zoustec có thể thay engine của mình vào mà không phải sửa phần còn lại |

### VI. Nhiệm vụ & thu thập con dấu

| # | Yêu cầu | Trạng thái | Cách đã làm |
|---|---|---|---|
| VI.1 | Cấu hình nhiệm vụ: tên, mô tả, loại, vị trí trên bản đồ, điều kiện hoàn thành | Đã làm | Admin thêm/sửa/xóa nhiệm vụ trong trình tạo sự kiện: đặt tên, mô tả, chọn kiểu xác minh (QR / GPS / kết hợp), ghim vị trí trên bản đồ và đặt bán kính cho phép |
| VI.2 | Xác minh bằng GPS | Đã làm | Điện thoại gửi vị trí lên, máy chủ tự tính khoảng cách tới điểm nhiệm vụ và chỉ chấp nhận khi nằm trong bán kính; khoảng cách thực tế được lưu lại làm bằng chứng |
| VI.3 | Xác minh bằng QR | Đã làm | Mỗi nhiệm vụ có mã QR riêng do hệ thống sinh; quét bằng camera điện thoại là mở đúng nhiệm vụ trong LINE, máy chủ kiểm tra mã hợp lệ rồi mới ghi nhận |
| VI.4 | Chế độ kết hợp | Đã làm | Nhiệm vụ có thể yêu cầu vừa đúng vị trí vừa quét đúng mã |
| VI.5 | Con dấu và phần thưởng | Làm một phần | Hoàn thành nhiệm vụ là nhận con dấu; đủ số dấu theo ngưỡng admin đặt thì tự mở phần thưởng. Còn thiếu: nếu admin hạ ngưỡng sau khi người chơi đã đạt, hệ thống chưa tự cấp bù |

### VII. Tạo website sự kiện & template frontend (trọng tâm)

| # | Yêu cầu | Trạng thái | Cách đã làm |
|---|---|---|---|
| VII.1 | Chọn template theo loại sự kiện | Đã làm | Chọn loại sự kiện là có sẵn bố cục phù hợp |
| VII.2 | Tùy chỉnh nội dung trang | Đã làm | Trình kéo-thả trực quan với 16 loại khối (tiêu đề, ảnh, bản đồ, danh sách nhiệm vụ, nút tham gia...). Máy chủ kiểm tra lại mọi nội dung gửi lên để không lọt khối lạ hoặc mã độc |
| VII.3 | Tải lên hình ảnh và văn bản | Đã làm | Tải ảnh trực tiếp trong trình tạo; ảnh được lưu an toàn trong cơ sở dữ liệu nên không mất khi máy chủ khởi động lại |
| VII.4 | Tự động tạo website sự kiện | Đã làm | Bấm "Xuất bản" là website tĩnh được sinh ra và có địa chỉ truy cập ngay |
| VII.5 (trọng tâm) | Xuất template frontend | Đã làm | Có 3 cách tải về tùy đối tượng: (a) gói mã nguồn Next.js cho đội kỹ sư phát triển tiếp; (b) gói HTML/CSS/JS tĩnh giống hệt bản đang chạy, dùng làm deliverable gói thầu hoặc tự host; (c) tệp thiết kế JSON để người dùng cuối sửa rồi tải ngược lên, xem trước, rồi xuất bản |
| VII.6 | Logic cốt lõi vẫn do API nền tảng cung cấp | Đã làm | Website tải về vẫn lấy dữ liệu sự kiện, nhiệm vụ, con dấu từ nền tảng Zoustec qua một khóa API cấp riêng cho từng khách; khóa có thể xem lại và thu hồi từ console |

### VIII. White-label & thương hiệu

| # | Yêu cầu | Trạng thái | Cách đã làm |
|---|---|---|---|
| VIII.1 | Logo khách hàng | Đã làm | Khách tự tải logo trong trang Thương hiệu của admin |
| VIII.2 | Màu sắc chủ đề | Đã làm | Khách chọn một màu chính, hệ thống tự suy ra cả bảng màu đồng bộ cho toàn bộ giao diện |
| VIII.3 | Tên miền tùy chỉnh | Làm một phần | Khách nhập tên miền của mình trong trang Thương hiệu, trỏ DNS theo hướng dẫn là website hiện dưới tên miền đó với HTTPS tự động. Đã chạy thật. Còn thiếu: tự động khai báo tên miền với hạ tầng và xác minh quyền sở hữu tên miền (hiện Zoustec thao tác tay) |
| VIII.4 | Liên kết tài khoản LINE | Đã làm | Khách tự kết nối LINE ngay trong trang Thương hiệu: dán Channel ID + Channel Secret của LINE Login channel, bấm một nút là hệ thống tạo LIFF riêng trỏ về tên miền của khách. Không cấu hình thì dùng LIFF chung của nền tảng; Zoustec vẫn có thể làm hộ từ console |
| VIII.5 | Giữ "Powered by Zoustec", có thể kiểm soát | Đã làm | Dòng Powered by hiện mặc định; chỉ admin Zoustec mới được tắt cho từng khách |

### IX. Phân tích dữ liệu & quản trị 2 cấp

| # | Yêu cầu | Trạng thái | Cách đã làm |
|---|---|---|---|
| IX.1a | Admin khách: quản lý sự kiện | Đã làm | Bảng điều khiển và trình tạo sự kiện riêng cho từng khách |
| IX.1b | Cấu hình nhiệm vụ | Đã làm | Ngay trong trình tạo sự kiện |
| IX.1c | Dữ liệu người dùng | Đã làm | Trang Thành viên: ai đã tham gia, tiến độ từng người |
| IX.1d | Thống kê thời gian thực | Đã làm | Số người tham gia, số dấu, tỷ lệ hoàn thành từng nhiệm vụ, cập nhật ngay khi tải lại trang |
| IX.1e | Xuất báo cáo | Đã làm | Tải báo cáo dạng bảng tính (CSV) cho từng sự kiện |
| IX.2a | Admin Zoustec: quản lý khách hàng | Đã làm | Console Zoustec: tạo khách, tạo tài khoản admin cho khách, cấp khóa API, tạo LIFF, đặt gói dịch vụ |
| IX.2b | Tổng quan sự kiện | Đã làm | Nhìn toàn bộ sự kiện của mọi khách trên một màn hình |
| IX.2c | Tổng hợp lưu lượng truy cập | Làm một phần | Hiện thống kê theo hoạt động (số con dấu theo tháng); chưa đếm lượt xem trang |
| IX.2d | Cổng thông tin sự kiện | Đã làm | Trang chủ nền tảng liệt kê mọi sự kiện đang mở |

### X. Cổng thông tin & quảng bá

| # | Yêu cầu | Trạng thái | Ghi chú |
|---|---|---|---|
| X.1 | Hiển thị tất cả sự kiện | Đã làm | Trang chủ nền tảng |
| X.2 | Gợi ý điểm tham quan | Làm một phần | Mới là danh sách sự kiện, chưa có gợi ý theo sở thích hay vị trí |
| X.3 | Chia sẻ Facebook / mạng xã hội | Chưa làm | Chưa có ảnh và mô tả xem trước khi dán link lên mạng xã hội, chưa có nút chia sẻ |

### XI. Mô hình kinh doanh

| # | Yêu cầu | Trạng thái | Ghi chú |
|---|---|---|---|
| XI.1–3 | SaaS / gói sự kiện một lần / cấp phép white-label | Làm một phần | Mỗi khách đã được gắn loại gói và console có thống kê doanh thu theo gói. Chưa giới hạn tính năng theo gói; đã có bản thiết kế chi tiết chờ duyệt (PHAN-TICH-SUBSCRIPTION-CAPABILITY.md) |

### XII. Bảo mật & hệ thống

| # | Yêu cầu | Trạng thái | Cách đã làm |
|---|---|---|---|
| XII.1 | HTTPS toàn trang | Đã làm | Mọi địa chỉ, kể cả tên miền riêng của khách, đều có chứng chỉ HTTPS tự động |
| XII.2 | Cách ly dữ liệu đa khách thuê | Đã làm | Cơ sở dữ liệu tự chặn truy cập chéo giữa các khách (xem III.1) |
| XII.3 | Kiểm soát phân quyền | Đã làm | Ba vai trò: người chơi, admin khách, admin Zoustec; phiên đăng nhập admin khách và admin Zoustec tách biệt |
| XII.4 | Ghi nhật ký hoạt động | Đã làm | Mọi thao tác admin và mọi lần hoàn thành nhiệm vụ đều ghi lại ai làm, lúc nào, kèm bằng chứng |
| XII.5 | Sao lưu dữ liệu | Làm một phần | Dựa vào sao lưu tự động của nhà cung cấp cơ sở dữ liệu; chưa có lịch sao lưu riêng do mình chủ động |

---

## PHẦN 2 — MODULE LINE

### II. Phạm vi tính năng

| # | Yêu cầu | Trạng thái | Cách đã làm |
|---|---|---|---|
| 1 | Điểm vào sự kiện LIFF (tạo app, endpoint, vào từ Rich Menu / nút / link) | Đã làm | Đã có LIFF chung của nền tảng và LIFF riêng cho khách BnK, đều chạy thật trong LINE. Khách tự bấm một nút trong trang Thương hiệu (hoặc Zoustec làm hộ từ console) là tạo được LIFF riêng |
| 2 | Đăng nhập LINE, xác minh danh tính ở backend | Đã làm | Mở từ LINE là tự đăng nhập, không cần nhập gì. Máy chủ xác minh token với LINE rồi tạo tài khoản lần đầu; lần sau vào nhận ra cùng một người |
| 3A | Nhiệm vụ QR | Đã làm | Xem VI.3 |
| 3B | Nhiệm vụ GPS | Đã làm | Xem VI.2 |
| 3C | Mở rộng AR | Đã làm | AR chạy ngay trong LINE, xem V.2 |
| 4 | API cho admin: danh sách nhiệm vụ, lượt hoàn thành, dữ liệu người dùng | Đã làm | Hoàn thành nhiệm vụ trong LINE là admin thấy ngay (người dùng + nhiệm vụ + thời gian) |
| 5 | White-label cơ bản tầng LINE | Đã làm | Mỗi khách có LIFF và giao diện thương hiệu riêng; sự kiện khác nhau hiện màu sắc, logo khác nhau |

### III. Nghiên cứu & xác nhận (deliverables)

#### 1. Tương thích LIFF và WebAR — Trạng thái: Đã làm

**Câu hỏi đặc tả:** Camera có mở ổn định trong LIFF WebView không? Hiệu năng WebAR (WebGL / WebXR / SDK bên thứ ba) trên iOS LINE và Android LINE khác nhau thế nào? Có cần fallback mở trình duyệt ngoài không?

**So sánh các môi trường:**

| Môi trường | Camera | WebGL | WebXR | AR chạy | Kết quả test thật |
|---|---|---|---|---|---|
| iOS — LINE in-app (LIFF) | Có (cần HTTPS) | Có | Không có | Có (MindAR) | Đã test iPhone thật: đạt |
| Android — LINE in-app (LIFF) | Có | Có | Không có | Có (MindAR) | Đã test Android thật: đạt |
| iOS / Android — trình duyệt ngoài | Có | Có | Không ổn định | Có | Chỉ là lối thoát |
| Origin HTTP (không TLS) | Không | — | — | Không | getUserMedia yêu cầu HTTPS |

**So sánh công nghệ AR:**

| Phương án | Chạy trong LIFF iOS | Chạy trong LIFF Android | Ghi chú |
|---|---|---|---|
| WebXR | Không | Không | LIFF WebView không cung cấp WebXR ở cả 2 nền |
| SDK thương mại (8th Wall...) | Có | Có | Tốn phí; 8th Wall đã đóng cửa 2/2026 |
| WebGL + getUserMedia (MindAR + three.js) | Có | Có | Mã nguồn mở, chạy được mọi nơi có camera + WebGL |

**Lựa chọn và lý do:** Chạy **trong LIFF** với MindAR + three.js, chỉ dùng getUserMedia + WebGL. Lý do: WebXR không tồn tại trong LIFF nên bất kỳ phương án dựa WebXR đều loại; MindAR là phương án duy nhất vừa miễn phí vừa chạy được trên cả 2 nền trong LINE. Trình duyệt ngoài không được chọn làm chiến lược vì không cứu được lỗi camera (cùng sensor, cùng engine WebView) và `openExternalBrowser=1` bị LINE bỏ qua trên LIFF app; chỉ giữ làm lối thoát qua `liff.openWindow({external:true})`. Khi camera hỏng hoàn toàn, người chơi vẫn hoàn thành nhiệm vụ bằng nhập mã tay hoặc GPS. Benchmark đo được: M4 72 fps, mô phỏng CPU chậm 4x 40 fps, 6x 28 fps (ngưỡng đạt 24 fps). Công cụ đo: trang `/diag` tự chấm, báo cáo đầy đủ trong BAO-CAO-TUONG-THICH-LIFF-WEBAR.md.

#### 2. Giải pháp quét QR — Trạng thái: Đã làm

**Câu hỏi đặc tả:** So sánh LIFF built-in scanner, camera web + thư viện JS, và chuyển hướng quét ngoài theo độ ổn định / UX / chi phí phát triển. Khuyến nghị phương án nào?

| Tiêu chí | (1) LIFF `scanCodeV2` | (2) Camera web + thư viện JS (jsQR/ZXing) | (3) QR = URL chứa token, quét bằng camera máy/LINE |
|---|---|---|---|
| Độ ổn định | Thấp: không có trong trình duyệt ngoài, khác nhau iOS/Android, phụ thuộc phiên bản LINE | Ổn nếu HTTPS, nhưng xin quyền camera thêm 1 lần | Cao nhất: không cần code quét, dùng camera hệ điều hành |
| UX | Tốt khi hoạt động | Trung bình (mở camera trong trang) | Tốt nhất: quét là mở thẳng LIFF đúng nhiệm vụ |
| Chi phí phát triển | Thấp nhưng phải làm fallback riêng | Trung bình | Thấp nhất: chỉ verify token server-side |
| Bảo mật | Token vẫn phải verify server | Như (3) | Token verify + ghi audit ở backend |

**Lựa chọn và lý do:** **Phương án (3)**. Admin sinh QR chứa LIFF permalink kèm token, người chơi quét bằng camera bất kỳ, backend verify `qr_token` và ghi audit. Lý do: ổn định nhất vì không phụ thuộc camera trong WebView hay phiên bản LINE, UX ngắn nhất (quét là vào đúng nhiệm vụ), chi phí thấp nhất và bảo mật không kém 2 phương án kia. Phương án (2) có thể bổ sung sau nếu khách muốn quét ngay trong app, không chặn nghiệm thu.

#### 3. Hành vi GPS — Trạng thái: Đã làm

**Câu hỏi đặc tả:** Độ chính xác vị trí giữa LIFF WebView và trình duyệt ngoài khác nhau không? Sai số trên các thiết bị? Luồng xin quyền có cần thao tác người dùng không? Bán kính khuyến nghị bao nhiêu? Fallback trong nhà thế nào?

| Tiêu chí | LIFF WebView | Trình duyệt ngoài |
|---|---|---|
| API định vị | Cùng API geolocation của hệ điều hành | Như nhau |
| Độ chính xác | Không khác biệt đáng kể | Như nhau |
| Luồng xin quyền | Quyền đi theo app LINE; nếu LINE bị tắt quyền vị trí thì web bên trong cũng không lấy được | Quyền theo trình duyệt |
| Cần thao tác người dùng | Có, phải bấm nút mới gọi geolocation | Có |

Sai số tham khảo: ngoài trời thoáng 5–15 m; đô thị dày 15–50 m; trong nhà 20–100 m trở lên (không tin cậy).

| Bối cảnh | Bán kính khuyến nghị |
|---|---|
| Ngoài trời thoáng (quảng trường, công viên) | 50 m |
| Đô thị dày đặc (phố cổ, gần nhà cao tầng) | 75–100 m |
| Trong nhà (mall, bảo tàng) | Không dùng GPS đơn thuần, chuyển sang QR hoặc hybrid |

**Lựa chọn và lý do:** Xác minh GPS **server-side** bằng PostGIS `ST_DWithin`, bán kính cấu hình riêng từng task (`radius_m`), người chơi phải bấm nút "Xác minh vị trí" mới gọi geolocation. Lý do: kiểm tra ở server để client không giả mạo được và có bằng chứng `distance_m` trong audit; bán kính để theo task vì sai số phụ thuộc bối cảnh chứ không phải thiết bị; trong nhà dùng QR hoặc hybrid vì GPS không tin cậy. Đã test thật GPS trong LIFF trên iPhone và Android.

#### 4. Đa khách thuê và liên kết LINE (Option A / Option B) — Trạng thái: Đã làm

**Câu hỏi đặc tả:** Nên dùng kênh đơn dùng chung (Option A) hay mỗi khách một channel / LIFF riêng (Option B)? Khuyến nghị cho v1 và tương lai? Hướng dẫn cấu hình cho người không phải kỹ sư?

| | Option A — kênh chung (nền tảng đứng tên) | Option B — mỗi khách 1 channel / LIFF riêng |
|---|---|---|
| Cấu hình | 1 lần cho cả nền tảng | Mỗi khách tạo LINE Login Channel + LIFF app |
| White-label | Branding UI đầy đủ, nhưng OA vẫn là của nền tảng | Hoàn toàn: OA + LIFF đứng tên khách |
| Chi phí vận hành | Thấp | Cao hơn (n channel, n token) |
| Hiện trạng | Đã chạy: LIFF platform `2010613964-3UzmddVV` | Đã chạy thật: LIFF BnK `2010638570-ZXXAqde5` trên domain `vinh-bnk.mooo.com` |

**Lựa chọn và lý do:** **Cả hai chạy song song.** Mặc định Option A để khách triển khai nhanh, không phải đụng LINE Console; khách nào cần thương hiệu tuyệt đối thì bật Option B cho riêng tenant đó chỉ bằng cách nhập LIFF ID vào branding, không đổi kiến trúc. Hệ thống tự chọn LIFF theo chuỗi fallback: branding tenant, rồi host, rồi LIFF chung; backend verify ID token thử channel tenant trước rồi channel platform. Hướng dẫn cấu hình Option B (khoảng 5 phút/khách, Zoustec thao tác) đã ghi trong CUSTOM-DOMAIN.md.

#### 5. Quản lý tự động LIFF app qua API — Trạng thái: Đã làm

**Câu hỏi đặc tả:** LIFF app có quản lý được qua API không? Cấu hình LIFF có tạo được từ admin nền tảng không? Nếu không khả thi thì quy trình thủ công ra sao?

| Việc | Có API không | Hiện trạng |
|---|---|---|
| Tạo LINE Login Channel mới | Không, LINE không mở API | Thủ công trên LINE Developers Console, quy trình đã viết trong CUSTOM-DOMAIN.md |
| Tạo / sửa / xóa LIFF app trong channel | Có, LIFF Server API `https://api.line.me/liff/v1/apps` | Đã làm: nút 自動建立 LIFF ở trang Thương hiệu của khách (`POST /api/admin/branding/liff`, tự phục vụ) và ở console Zoustec (`POST /api/platform/tenants/{id}/liff`, làm hộ) |

**Lựa chọn và lý do:** Đánh giá **khả thi một phần, và phần khả thi đủ dùng**. Tự động hóa phần có API (tạo LIFF app) để giảm thao tác tay; phần không có API (tạo channel) giữ quy trình thủ công có hướng dẫn từng bước, vì đó là giới hạn của LINE chứ không phải của hệ thống.

#### 6. Lộ trình LIFF so với LINE MINI App — Trạng thái: Đã làm

**Câu hỏi đặc tả:** Tốc độ phát triển LIFF? Tiềm năng MINI App? Kiến trúc có cần dự phòng từ đầu không? Nâng cấp sau có cần refactor không?

| | LIFF | LINE MINI App |
|---|---|---|
| Tốc độ phát triển | Nhanh, không cần duyệt | Phải qua LINE review (tuần đến tháng), yêu cầu đối tác theo thị trường |
| Phân phối | Link, Rich Menu, QR | Thêm mục khám phá trong LINE, share message tối ưu |
| API kỹ thuật | LIFF SDK | Cùng LIFF SDK, thêm vài API bổ sung |
| Camera / AR | getUserMedia | Cùng runtime LIFF, không phải fallback camera |
| Ràng buộc UI | Tự do | Phải theo design guideline của LINE |

**Lựa chọn và lý do:** **v1 dùng LIFF.** Lý do: triển khai ngay không chờ duyệt, đủ cho mọi kênh vào (link, Rich Menu, QR); MINI App không mang lại lợi ích kỹ thuật (cùng SDK, cùng camera) mà chỉ thêm kênh phân phối. Kiến trúc đã dự phòng: toàn bộ tiếp xúc LINE gói trong `lib/liff-client.js` (frontend) và `services/line_oidc.py` (backend), nên khi cần MINI App chỉ đăng ký app và chỉnh header, logic nghiệp vụ giữ nguyên, không cần refactor.

### IV. PoC nghiệm thu

| # | Tiêu chí | Trạng thái |
|---|---|---|
| 1–4 | Vào từ LINE OA → auto login lấy userId → hoàn thành 1 task QR/GPS → ghi vào admin | Đã làm — nghiệm thu 4/4 trên LINE thật, URL production |

### V. Công khai ràng buộc kỹ thuật

| Trạng thái | Ghi chú |
|---|---|
| Đã làm | Mục 0 + 4 + 6 báo cáo tương thích: giới hạn camera iOS LINE, không WebXR, `openExternalBrowser=1` không tác dụng → fallback `liff.openWindow({external:true})` |

---

## VIỆC CÒN LẠI (theo ưu tiên)

1. Chưa làm: Chia sẻ mạng xã hội — ảnh/mô tả xem trước khi dán link và nút chia sẻ cho từng sự kiện (X.3)
2. Chưa làm: Giới hạn tính năng theo gói dịch vụ (XI) — đã có bản thiết kế
3. Làm một phần: Đếm lượt xem trang để báo cáo lưu lượng truy cập (IX.2c)
4. Chưa làm: Tự cấp bù phần thưởng khi admin hạ ngưỡng (VI.5); nút chụp ảnh trong AR (V.3)
5. Bàn giao: tắt chế độ đăng nhập thử nghiệm, đổi mật khẩu cơ sở dữ liệu và thu hồi khóa dịch vụ AI đã dùng trong lúc phát triển, đặt mật khẩu admin Zoustec chính thức, lập lịch sao lưu riêng

---

Nguồn đối chiếu: TONG-KET-CONG-VIEC.md, API-UI-MAP.md,
BAO-CAO-TUONG-THICH-LIFF-WEBAR.md, CUSTOM-DOMAIN.md.
