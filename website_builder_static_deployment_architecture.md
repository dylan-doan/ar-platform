# Website Builder & Static Website Deployment Platform

## 1. Tổng quan

Hệ thống hiện tại sử dụng **Next.js** làm nền tảng quản trị. Chức năng
mới sẽ cho phép user:

1.  Tạo website từ các theme có sẵn.
2.  Custom website trực tiếp trên platform.
3.  Publish/deploy website lên server của hệ thống.
4.  Download website dưới dạng **HTML/CSS/JS static source**.
5.  Chỉnh sửa HTML/CSS/JS bằng công cụ bên ngoài như VS Code.
6.  Upload lại source đã chỉnh sửa.
7.  Hệ thống tạo một version mới và deploy version đó.
8.  Website customer tiếp tục gọi API của hệ thống để lấy dữ liệu động.
9.  Mỗi website/project có một **Site API Key** riêng để xác định và cấp
    quyền truy cập API public.

Mô hình cốt lõi:

``` text
Theme
  ↓
Website Builder
  ↓
Static HTML/CSS/JS
  ↓
Version
  ↓
Deploy
  ↓
Customer Website
  ↓
Public API
  ↓
Platform Database
```

------------------------------------------------------------------------

## 2. Mục tiêu hệ thống

### 2.1. Mục tiêu chính

-   Cho phép user tự tạo website mà không cần lập trình.
-   Hỗ trợ nhiều theme/template.
-   Cho phép custom giao diện.
-   Cho phép user lấy source HTML/CSS/JS về chỉnh sửa.
-   Cho phép upload source đã chỉnh sửa trở lại platform.
-   Có versioning và rollback.
-   Website customer được deploy trực tiếp trên hạ tầng của platform.
-   Dữ liệu động được quản lý tập trung thông qua API.
-   Mỗi website/project có API identity riêng.
-   Không cần chạy một application server riêng cho từng website
    customer.

### 2.2. Nguyên tắc kiến trúc

> Website customer nên được xem là một **static artifact**, còn dữ liệu
> và business logic nằm ở **Platform API**.

Điều này giúp hệ thống dễ scale và giảm đáng kể chi phí vận hành.

------------------------------------------------------------------------

# 3. Kiến trúc tổng thể

``` text
                         ┌─────────────────────┐
                         │       USER          │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │     Next.js UI      │
                         │  Website Management │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   Platform API      │
                         │ Projects / Themes   │
                         │ Versions / Deploy   │
                         └───────┬─────┬───────┘
                                 │     │
                    ┌────────────┘     └─────────────┐
                    ▼                                ▼
             ┌─────────────┐                  ┌─────────────┐
             │  Database   │                  │   Storage   │
             │   MySQL     │                  │ Object/S3   │
             └─────────────┘                  └──────┬──────┘
                                                     │
                                                     ▼
                                            ┌─────────────────┐
                                            │ Deploy Service  │
                                            └────────┬────────┘
                                                     │
                                                     ▼
                                               ┌───────────┐
                                               │   Nginx   │
                                               └─────┬─────┘
                                                     │
                           ┌─────────────────────────┼─────────────────────┐
                           ▼                         ▼                     ▼
                     customer-a.com           customer-b.com        customer-c.com
                           │                         │                     │
                           └─────────────────────────┼─────────────────────┘
                                                     │
                                                     ▼
                                              Platform Public API
                                                     │
                                                     ▼
                                                  Database
```

------------------------------------------------------------------------

# 4. Các thành phần chính

## 4.1. Next.js Platform

Next.js hiện tại tiếp tục đóng vai trò là:

-   Dashboard.
-   Website Builder UI.
-   Theme management.
-   Project management.
-   Website configuration.
-   Version management.
-   Upload/download.
-   Deployment management.
-   Domain management.
-   Preview.

Không cần thay đổi toàn bộ hệ thống hiện tại chỉ vì bổ sung Website
Builder.

------------------------------------------------------------------------

## 4.2. Project

Mỗi website customer tương ứng với một `Project`.

Ví dụ:

``` text
User
 ├── Project: ABC Restaurant
 ├── Project: ABC Fashion
 └── Project: ABC Portfolio
```

Project nên chứa:

``` text
id
user_id
name
slug
status
current_version_id
created_at
updated_at
```

Project là đơn vị trung tâm để quản lý:

-   Website.
-   Domain.
-   API Key.
-   Version.
-   Deployment.
-   Configuration.

------------------------------------------------------------------------

# 5. Theme System

Theme là bộ source mẫu để tạo website.

Ví dụ:

``` text
themes/
├── restaurant/
├── fashion/
├── corporate/
├── portfolio/
├── hotel/
└── landing-page/
```

Mỗi theme có thể chứa:

``` text
theme/
├── metadata.json
├── pages/
├── components/
├── css/
├── js/
└── assets/
```

### Theme metadata

Ví dụ:

``` json
{
  "id": "restaurant",
  "name": "Restaurant",
  "version": "1.0.0",
  "type": "static-html",
  "pages": [
    "home",
    "menu",
    "about",
    "contact"
  ]
}
```

------------------------------------------------------------------------

# 6. Website Builder

User có thể customize trực tiếp trên platform.

Ví dụ:

-   Logo.
-   Site name.
-   Primary color.
-   Secondary color.
-   Font.
-   Banner.
-   Text.
-   Images.
-   Navigation.
-   Footer.
-   Sections.
-   Product/category data mapping.
-   Page visibility.

Flow:

``` text
Select Theme
     ↓
Create Project
     ↓
Customize
     ↓
Preview
     ↓
Generate HTML
     ↓
Create Version
     ↓
Deploy
```

------------------------------------------------------------------------

# 7. Static Website

Website customer sau khi generate nên là static:

``` text
index.html
about.html
products.html

css/
    style.css

js/
    app.js

assets/
    logo.png
    banner.webp
```

Không cần chạy:

``` text
Node.js
Next.js server
PHP
Laravel
```

cho từng customer website.

Nginx có thể phục vụ trực tiếp static files.

------------------------------------------------------------------------

# 8. Download Source

User có thể download source:

``` text
customer-website.zip
```

Cấu trúc:

``` text
customer-website/
├── index.html
├── about.html
├── products.html
├── css/
│   └── style.css
├── js/
│   └── app.js
├── assets/
│   └── ...
└── .website/
    └── manifest.json
```

------------------------------------------------------------------------

# 9. Manifest

Trong source nên có một file:

``` text
.website/manifest.json
```

Mục đích:

-   Xác định platform.
-   Xác định project.
-   Xác định version.
-   Xác định loại source.
-   Xác định format export.
-   Hỗ trợ import về sau.

Ví dụ:

``` json
{
  "platform": "your-platform",
  "format": "static-website",
  "export_version": 1,
  "project_id": "018fxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "version_id": "019axxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "framework": "static-html"
}
```

Tên file ZIP không được dùng để xác định project.

------------------------------------------------------------------------

# 10. User Custom Source

User có thể download source và chỉnh sửa hoàn toàn bằng VS Code.

Ví dụ:

``` html
<h1>Welcome to ABC Restaurant</h1>
```

User có thể sửa thành:

``` html
<h1>Welcome to ABC Restaurant Vietnam</h1>
```

Hoặc:

``` css
.hero {
    min-height: 700px;
}
```

Sau khi chỉnh sửa:

``` text
ZIP
 ↓
Upload
 ↓
Validate
 ↓
Create New Version
 ↓
Deploy
```

Platform không cần biết chính xác user đã sửa dòng code nào.

------------------------------------------------------------------------

# 11. Upload Source

Flow đề xuất:

``` text
Upload ZIP
    ↓
File validation
    ↓
Manifest validation
    ↓
Security scan
    ↓
Path traversal check
    ↓
File type validation
    ↓
Extract to temporary storage
    ↓
HTML validation
    ↓
Preview
    ↓
Create Version
    ↓
Deploy
```

Không extract trực tiếp vào production directory.

------------------------------------------------------------------------

# 12. Security khi upload

Phải xử lý các vấn đề:

### Path Traversal

Không cho phép:

``` text
../../etc/passwd
```

### ZIP Bomb

Giới hạn:

-   File size.
-   Tổng extracted size.
-   Số lượng file.
-   Compression ratio.

### File Extension

MVP nên chỉ cho phép static files:

``` text
.html
.css
.js
.json
.svg
.png
.jpg
.jpeg
.webp
.gif
.ico
.woff
.woff2
```

Không nên cho chạy:

``` text
.php
.jsp
.asp
.exe
.sh
```

hoặc bất kỳ server-side executable nào.

------------------------------------------------------------------------

# 13. Version Management

Không overwrite version cũ.

Ví dụ:

``` text
Project #123

v1
 └── Theme generated

v2
 └── Builder customization

v3
 └── User uploaded custom HTML

v4
 └── User uploaded new customization
```

Database:

``` text
project_versions

id
project_id
version_number
source_path
source_hash
status
source_type
created_by
created_at
```

`source_type` có thể:

``` text
generated
builder
user_upload
```

------------------------------------------------------------------------

# 14. Current Version

Project nên có:

``` text
current_version_id
```

Ví dụ:

``` text
Project #123
current_version_id = v4
```

Production luôn phục vụ version hiện tại.

------------------------------------------------------------------------

# 15. Rollback

Nếu version mới lỗi:

``` text
v4
 ↓
Deploy failed
 ↓
Rollback
 ↓
v3
```

Không cần build lại v3.

Chỉ cần chuyển pointer:

``` text
current → v3
```

------------------------------------------------------------------------

# 16. Atomic Deployment

Không nên deploy bằng cách overwrite trực tiếp:

``` text
/var/www/site/
```

Nên dùng release directory:

``` text
/var/www/sites/{project_id}/

releases/
├── v1/
├── v2/
├── v3/
└── v4/

current -> releases/v4
```

Deploy:

``` text
Build/Upload v5
     ↓
releases/v5
     ↓
Validate
     ↓
current -> releases/v5
```

Nếu v5 lỗi:

``` text
current -> releases/v4
```

Website không bị downtime do quá trình copy file.

------------------------------------------------------------------------

# 17. Domain

Mỗi project có thể có một hoặc nhiều domain.

Database:

``` text
project_domains

id
project_id
domain
is_primary
ssl_status
verification_status
created_at
```

Ví dụ:

``` text
Project #123

abc.com
www.abc.com
```

Nginx route:

``` text
abc.com
    ↓
Project #123
    ↓
current version
```

------------------------------------------------------------------------

# 18. API Architecture

Website customer không chứa database.

Dữ liệu động được lấy từ Platform API.

Ví dụ:

``` text
https://customer-a.com
        │
        ▼
https://api.your-platform.com/v1/public/products
        │
        ▼
Platform Database
```

Website có thể gọi:

``` text
GET /v1/public/products
GET /v1/public/categories
GET /v1/public/posts
GET /v1/public/settings
GET /v1/public/menu
```

------------------------------------------------------------------------

# 19. Site API Key

Nên cấp API key theo **Project/Website**, không phải theo User.

Ví dụ:

``` text
User
 ├── Project A
 │     └── SITE_KEY_A
 │
 ├── Project B
 │     └── SITE_KEY_B
 │
 └── Project C
       └── SITE_KEY_C
```

Database:

``` text
project_api_keys

id
project_id
key_hash
name
status
created_at
last_used_at
expires_at
```

------------------------------------------------------------------------

# 20. API Key không phải Secret

Nếu key được nhúng vào HTML/JS:

``` javascript
fetch("https://api.your-platform.com/v1/public/products", {
    headers: {
        "X-SITE-KEY": "PUBLIC_SITE_KEY"
    }
});
```

thì user có thể nhìn thấy key bằng DevTools.

Do đó:

> Site API Key phải được xem là **public identifier**, không phải secret
> credential.

Không được cấp các quyền nguy hiểm cho key này.

Không dùng nó để:

``` text
DELETE
UPDATE
CREATE
Admin API
Private user data
Payment operations
```

Site key chỉ nên dùng cho public website API.

------------------------------------------------------------------------

# 21. Domain Validation

API request có thể kiểm tra:

``` text
X-SITE-KEY
+
Origin
+
Project Domain
```

Ví dụ:

``` text
SITE_KEY_A
Origin: https://abc.com
```

Platform xác định:

``` text
SITE_KEY_A
    ↓
Project #123
    ↓
Allowed Domain = abc.com
```

Nếu request đến từ domain không được đăng ký, có thể reject.

Lưu ý: `Origin`/`Referer` chỉ là một lớp kiểm soát bổ sung, không phải
cơ chế bảo mật tuyệt đối.

------------------------------------------------------------------------

# 22. Public API vs Private API

Nên tách rõ:

``` text
/api/public/*
```

và:

``` text
/api/private/*
```

### Public API

Dùng cho customer website:

``` text
GET /api/public/products
GET /api/public/categories
GET /api/public/posts
GET /api/public/settings
```

### Private API

Dùng cho dashboard:

``` text
POST /api/private/products
PUT /api/private/products/{id}
DELETE /api/private/products/{id}
```

Private API phải sử dụng authentication thực sự:

``` text
Session
OAuth
Sanctum
JWT
```

không dùng Site API Key.

------------------------------------------------------------------------

# 23. CORS

Public API cần cấu hình CORS theo domain của project.

Ví dụ:

``` text
https://abc.com
https://shop.example.com
```

Có thể lưu allowed origins theo project.

Tuy nhiên CORS không phải authentication. CORS chủ yếu kiểm soát browser
cross-origin access.

------------------------------------------------------------------------

# 24. Storage

Có thể sử dụng object storage:

``` text
projects/
    {project_id}/
        versions/
            {version_id}/
                source/
                metadata.json
```

Có thể sử dụng:

-   S3.
-   MinIO.
-   S3-compatible storage.

Database chỉ lưu metadata/path.

Không nên lưu toàn bộ HTML/CSS/JS lớn trực tiếp vào database.

------------------------------------------------------------------------

# 25. Deployment Server

Deployment server phục vụ static files.

Ví dụ:

``` text
/var/www/sites/

project-001/
    releases/
        v1/
        v2/
    current -> releases/v2

project-002/
    releases/
        v1/
    current -> releases/v1
```

Nginx:

``` text
customer-a.com
    ↓
/var/www/sites/project-001/current

customer-b.com
    ↓
/var/www/sites/project-002/current
```

------------------------------------------------------------------------

# 26. Không cần một Node.js process cho mỗi website

Đây là lợi ích lớn của static architecture.

Không cần:

``` text
Customer A → Node process
Customer B → Node process
Customer C → Node process
```

Thay vào đó:

``` text
Nginx
 ├── Site A static files
 ├── Site B static files
 ├── Site C static files
 └── Site D static files
```

Một server có thể phục vụ rất nhiều website.

------------------------------------------------------------------------

# 27. Builder Mode và Custom Code Mode

Nên có hai chế độ.

## Builder Mode

User chỉnh sửa trên platform:

``` text
Theme
 ↓
Builder
 ↓
Configuration
 ↓
Generate HTML
 ↓
Deploy
```

## Custom Code Mode

User:

``` text
Download
 ↓
Edit HTML/CSS/JS
 ↓
Upload
 ↓
Deploy
```

------------------------------------------------------------------------

# 28. Không nên reverse-engineer HTML custom

Không nên cố làm:

``` text
User Custom HTML
      ↓
HTML Parser
      ↓
Builder Components
```

ngay từ MVP.

Vì user có thể thay đổi hoàn toàn cấu trúc HTML.

Sau khi user upload custom source, version nên được đánh dấu:

``` text
source_type = user_upload
```

Platform chỉ có trách nhiệm:

``` text
Store
Validate
Version
Deploy
Rollback
```

------------------------------------------------------------------------

# 29. Data Independence

HTML source không nên chứa dữ liệu business cố định.

Ví dụ không nên generate:

``` html
<div>
    Product A
    100,000 VND
</div>
```

mà nên:

``` html
<div id="products"></div>
```

JS:

``` javascript
fetch("/api...")
    .then(...)
    .then(products => renderProducts(products));
```

Như vậy user chỉnh sửa HTML/CSS nhưng dữ liệu vẫn được lấy từ Platform
API.

------------------------------------------------------------------------

# 30. Ví dụ Website Runtime

``` text
Customer Browser
       │
       ▼
customer-a.com
       │
       ├── HTML
       ├── CSS
       └── JS
              │
              ▼
       Platform Public API
              │
              ▼
           Database
```

Website chỉ chịu trách nhiệm:

``` text
Presentation
UI
Interaction
API consumption
```

Platform chịu trách nhiệm:

``` text
Data
Business logic
Authentication
Authorization
Management
```

------------------------------------------------------------------------

# 31. Database tổng thể

Các bảng chính:

``` text
users

projects
project_domains
project_api_keys
project_versions
project_deployments

themes
theme_versions

build_jobs
deploy_jobs

assets
```

Quan hệ:

``` text
User
 │
 └── Projects
       │
       ├── Domains
       ├── API Keys
       ├── Versions
       │
       └── Deployments

Theme
 │
 └── Theme Versions
```

------------------------------------------------------------------------

# 32. Deployment Flow

``` text
User clicks Publish
        ↓
Check Project
        ↓
Check Version
        ↓
Validate Source
        ↓
Create Deployment Job
        ↓
Prepare Release
        ↓
Copy/Upload Static Files
        ↓
Validate Files
        ↓
Health Check
        ↓
Switch Current Version
        ↓
Deployment Success
```

------------------------------------------------------------------------

# 33. Upload Flow

``` text
User uploads ZIP
        ↓
Check file size
        ↓
Check ZIP
        ↓
Read manifest
        ↓
Resolve project_id
        ↓
Security scan
        ↓
Extract temporary
        ↓
Validate file types
        ↓
Validate index.html
        ↓
Create new version
        ↓
Preview
        ↓
Publish
```

------------------------------------------------------------------------

# 34. Recommended MVP

### Phase 1

Implement:

``` text
[ ] Project
[ ] Theme
[ ] Website Builder basic
[ ] Generate static HTML
[ ] Preview
[ ] Deploy
[ ] Domain
```

### Phase 2

Implement:

``` text
[ ] Versioning
[ ] Rollback
[ ] Download HTML
[ ] Manifest
[ ] Upload HTML
[ ] Static source validation
```

### Phase 3

Implement:

``` text
[ ] Site API Key
[ ] Public API
[ ] Dynamic data
[ ] Domain validation
[ ] CORS
```

### Phase 4

Implement:

``` text
[ ] Custom code mode
[ ] Deployment history
[ ] Deployment logs
[ ] Automated SSL
[ ] CDN/cache
[ ] Backup
```

------------------------------------------------------------------------

# 35. Recommended Technology Stack

Với hệ thống hiện tại:

``` text
Frontend / Dashboard
    Next.js

Backend API
    Laravel

Database
    MySQL / MariaDB

Queue
    Redis + Laravel Queue

Static Web Server
    Nginx

Storage
    S3 / MinIO

Deployment
    Linux + Nginx

SSL
    Let's Encrypt / Cloudflare

Optional
    Docker cho build/validation sandbox
```

Nếu website chỉ là static HTML/CSS/JS thì không bắt buộc phải có Docker
cho runtime. Docker chủ yếu hữu ích nếu sau này có quá trình
build/processing hoặc cần sandbox hóa các bước xử lý source upload.

------------------------------------------------------------------------

# 36. Security Requirements

Các yêu cầu tối thiểu:

-   Không chạy server-side code do user upload.
-   Không extract ZIP trực tiếp vào production.
-   Chống path traversal.
-   Giới hạn ZIP size.
-   Giới hạn extracted size.
-   Giới hạn số lượng file.
-   Validate file extensions.
-   Scan malware nếu cần.
-   API key theo project.
-   Có khả năng revoke API key.
-   Không dùng public Site API Key cho private operations.
-   CORS theo domain.
-   HTTPS bắt buộc.
-   Version immutable.
-   Atomic deployment.
-   Rollback.
-   Audit log cho upload/deployment.

------------------------------------------------------------------------

# 37. Kiến trúc cuối cùng

``` text
                         ┌─────────────────────┐
                         │       USER          │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │      Next.js        │
                         │  Website Platform   │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │      Laravel        │
                         │    Platform API     │
                         └──────┬──────┬───────┘
                                │      │
                    ┌───────────┘      └─────────────┐
                    ▼                                ▼
             ┌─────────────┐                  ┌─────────────┐
             │   MySQL     │                  │ S3 / MinIO  │
             └─────────────┘                  └──────┬──────┘
                                                     │
                                                     ▼
                                            ┌─────────────────┐
                                            │ Deploy Service  │
                                            └────────┬────────┘
                                                     │
                                                     ▼
                                                  Nginx
                                                     │
                     ┌───────────────────────────────┼────────────────────┐
                     ▼                               ▼                    ▼
                 Site A                          Site B                Site C
                     │                               │                    │
                     └───────────────────────────────┼────────────────────┘
                                                     │
                                                     ▼
                                             Public API
                                                     │
                                                     ▼
                                                  MySQL
```

------------------------------------------------------------------------

# 38. Kết luận

Mô hình này hoàn toàn khả thi và phù hợp để phát triển thành một
**multi-tenant static website platform**.

Điểm quan trọng nhất là xác định rõ trách nhiệm:

``` text
Platform
    ↓
Theme
    ↓
Generate HTML
    ↓
Version
    ↓
Deploy
```

và:

``` text
Customer Website
    ↓
Static HTML/CSS/JS
    ↓
Public API
    ↓
Platform Data
```

Còn việc user download rồi chỉnh sửa source nên được coi là:

``` text
Export
    ↓
External Customization
    ↓
Import
    ↓
New Version
```

không cần cố phân tích sự khác biệt giữa source cũ và source mới.

Kiến trúc này cho phép sau này mở rộng thành:

-   Custom domain.
-   SSL tự động.
-   CDN.
-   Preview URL.
-   Version history.
-   Rollback.
-   Multiple themes.
-   AI website generation.
-   Custom HTML/CSS/JS.
-   Website analytics.
-   CMS/API.
-   Multi-site cho một user.
-   Marketplace theme.
