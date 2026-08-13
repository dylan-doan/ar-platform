# HTML Website Builder & Deployment Platform

## 1. Tổng quan

Hệ thống hiện tại sử dụng **Next.js** làm platform chính. Chức năng mới cho phép user tạo và quản lý website của riêng họ ngay trên platform.

### Mục tiêu cốt lõi

- User chọn theme có sẵn.
- User customize website trực tiếp trên platform.
- Platform generate website dưới dạng **HTML/CSS/JS static website**.
- Platform deploy website lên server.
- User có thể **Download HTML Website** về máy.
- User có thể mở bằng VS Code hoặc editor khác để chỉnh sửa HTML/CSS/JS.
- User upload lại website đã chỉnh sửa.
- Platform tạo một version mới và deploy version đó.
- Website tiếp tục sử dụng API của platform để lấy dữ liệu động.
- Mỗi website/project có một **Site API Key** riêng.
- Dữ liệu business vẫn được quản lý tập trung trên platform.

## 2. Kiến trúc tổng thể

```text
USER
  ↓
Next.js Platform
  ↓
Platform API
  ├── Projects
  ├── Themes
  ├── Builder
  ├── Versions
  ├── Deployments
  └── API Keys
       ├── MySQL
       └── S3 / MinIO
              ↓
        Deploy Service
              ↓
            Nginx
              ↓
      Customer Websites
              ↓
         Public API
              ↓
           MySQL
```

## 3. Project

Mỗi website customer là một `Project`.

```text
User
 ├── Project: ABC Restaurant
 ├── Project: ABC Fashion
 └── Project: ABC Portfolio
```

Các field chính:

```text
id
user_id
name
slug
status
current_version_id
created_at
updated_at
```

Project quản lý:

- Website
- Domain
- API Key
- Version
- Deployment
- Theme
- Configuration

## 4. Theme System

Ví dụ:

```text
themes/
├── restaurant/
├── fashion/
├── corporate/
├── portfolio/
├── hotel/
└── landing-page/
```

Theme:

```text
theme/
├── metadata.json
├── pages/
├── components/
├── css/
├── js/
└── assets/
```

## 5. Website Builder

User có thể customize:

- Logo
- Site name
- Colors
- Font
- Banner
- Images
- Text
- Navigation
- Footer
- Sections
- Pages
- Layout

Flow:

```text
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
Publish
```

## 6. Generate HTML Website

Website sau khi generate là static:

```text
website/
├── index.html
├── about.html
├── products.html
├── contact.html
├── css/
│   └── style.css
├── js/
│   └── main.js
└── assets/
```

User không cần biết:

```text
Next.js
Vue
React
Vite
Node.js
npm
Docker
```

## 7. Download HTML Website

Nút trên platform:

```text
Download HTML
```

Tạo:

```text
customer-website.zip
```

Cấu trúc:

```text
customer-website/
├── index.html
├── about.html
├── products.html
├── contact.html
├── css/
│   └── style.css
├── js/
│   └── main.js
├── assets/
└── .website/
    └── manifest.json
```

User:

```text
Download
  ↓
Extract
  ↓
Open bằng VS Code
  ↓
Edit HTML/CSS/JS
```

Không cần build bằng npm.

## 8. Manifest

File:

```text
.website/manifest.json
```

Ví dụ:

```json
{
  "platform": "your-platform",
  "format": "static-html",
  "export_version": 1,
  "project_id": "018fxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "version_id": "019axxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

Manifest dùng để xác định project khi upload lại.

Tên file ZIP không được dùng để xác định project.

## 9. User Custom HTML

Ví dụ platform generate:

```html
<h1>Welcome to ABC Restaurant</h1>
```

User sửa:

```html
<h1>Welcome to ABC Restaurant Vietnam</h1>
```

Có thể sửa CSS/JS hoàn toàn tự do.

Platform không cần biết user đã sửa dòng nào.

## 10. Upload HTML Website

Flow:

```text
Upload ZIP
  ↓
Validate ZIP
  ↓
Read manifest
  ↓
Resolve Project
  ↓
Security validation
  ↓
Extract temporary
  ↓
Validate static files
  ↓
Create New Version
  ↓
Preview
  ↓
Publish
```

Không extract trực tiếp vào production.

## 11. Upload Security

Phải xử lý:

- Path traversal
- ZIP bomb
- File size limit
- Extracted size limit
- File count limit
- File extension validation
- Malware scanning nếu cần

MVP nên cho phép:

```text
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

Không cho chạy server-side code:

```text
.php
.jsp
.asp
.exe
.sh
```

Website upload chỉ nên là static website.

## 12. Versioning

Không overwrite version cũ.

```text
Project #123

v1
 └── Theme generated

v2
 └── Builder customization

v3
 └── User custom HTML

v4
 └── User custom HTML update
```

Database:

```text
project_versions

id
project_id
version_number
source_path
source_hash
source_type
status
created_by
created_at
```

`source_type`:

```text
generated
builder
user_upload
```

## 13. Rollback

Production luôn trỏ tới:

```text
current_version_id
```

Nếu v4 lỗi:

```text
v4
 ↓
Deployment failed
 ↓
Rollback
 ↓
v3
```

Không cần build lại v3.

## 14. Atomic Deployment

Không overwrite trực tiếp production.

```text
/var/www/sites/{project_id}/

releases/
├── v1/
├── v2/
├── v3/
└── v4/

current -> releases/v4
```

Deploy v5:

```text
Upload v5
  ↓
Validate
  ↓
releases/v5
  ↓
Health Check
  ↓
current -> releases/v5
```

Nếu v5 lỗi:

```text
current -> releases/v4
```

## 15. Domain

Database:

```text
project_domains

id
project_id
domain
is_primary
ssl_status
verification_status
created_at
updated_at
```

Ví dụ:

```text
abc.com
www.abc.com
```

Nginx:

```text
abc.com
  ↓
Project #123
  ↓
current version
```

## 16. Static Website Runtime

Customer website chỉ gồm:

```text
HTML
CSS
JavaScript
Images
Fonts
```

Không cần một Node.js/Next.js process riêng cho từng customer.

Nginx phục vụ trực tiếp static files.

## 17. Dynamic Data

Website không lưu business data.

Ví dụ:

```html
<div id="products"></div>
```

JavaScript gọi:

```javascript
fetch("https://api.your-platform.com/v1/public/products", {
    headers: {
        "X-SITE-KEY": "site_xxxxxxxxx"
    }
})
.then(response => response.json())
.then(data => {
    renderProducts(data);
});
```

Flow:

```text
Customer Browser
  ↓
customer-a.com
  ↓
JavaScript
  ↓
Platform Public API
  ↓
Database
  ↓
JSON
  ↓
Render
```

## 18. Site API Key

Nên cấp API Key theo **Project/Website**, không phải theo User.

```text
User
 ├── Project A
 │     └── SITE_KEY_A
 ├── Project B
 │     └── SITE_KEY_B
 └── Project C
       └── SITE_KEY_C
```

Database:

```text
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

## 19. Site API Key không phải Secret

Nếu key nằm trong JavaScript, user có thể nhìn thấy bằng DevTools.

Do đó:

> Site API Key phải được xem là **public identifier**, không phải secret credential.

Không dùng Site API Key cho:

```text
CREATE
UPDATE
DELETE
Admin API
Private data
Payment operations
```

Chỉ dùng cho Public API.

## 20. Public API

Tách namespace:

```text
/api/public/*
```

Ví dụ:

```text
GET /api/public/products
GET /api/public/categories
GET /api/public/posts
GET /api/public/settings
GET /api/public/menu
GET /api/public/pages
```

Flow:

```text
Site Key
  ↓
Resolve Project
  ↓
Validate Project
  ↓
Validate Domain
  ↓
Return Public Data
```

## 21. Private API

Tách:

```text
/api/private/*
```

Ví dụ:

```text
POST /api/private/products
PUT /api/private/products/{id}
DELETE /api/private/products/{id}
```

Private API phải dùng authentication thực sự như:

```text
Session
OAuth
Sanctum
JWT
```

Không dùng Site API Key.

## 22. Domain Validation & CORS

Request:

```text
X-SITE-KEY: SITE_KEY_A
Origin: https://abc.com
```

Platform kiểm tra:

```text
SITE_KEY_A
  ↓
Project #123
  ↓
Allowed Domain
  ↓
abc.com
```

CORS nên cấu hình allowed origins theo Project.

Lưu ý: Origin/Referer chỉ là lớp kiểm soát bổ sung, không phải secret authentication.

## 23. Data Independence

Không hard-code business data vào HTML.

Không nên:

```html
<div>
    Product A
    100,000 VND
</div>
```

Nên:

```html
<div id="products"></div>
```

JavaScript gọi:

```text
GET /api/public/products
```

Nhờ vậy user có thể chỉnh HTML/CSS mà không ảnh hưởng đến data layer.

## 24. Builder Mode

```text
Theme
  ↓
Builder
  ↓
Customize
  ↓
Preview
  ↓
Generate HTML
  ↓
Publish
```

## 25. Custom HTML Mode

```text
Website
  ↓
Download HTML
  ↓
Edit HTML/CSS/JS
  ↓
ZIP
  ↓
Upload HTML
  ↓
New Version
  ↓
Publish
```

## 26. Không Reverse Engineer Custom HTML

Không nên cố biến:

```text
User Custom HTML
  ↓
HTML Parser
  ↓
Builder Components
```

trong MVP.

Sau khi upload:

```text
source_type = user_upload
```

Platform chỉ cần:

```text
Store
Validate
Version
Deploy
Rollback
```

## 27. Storage

Có thể dùng:

- S3
- MinIO
- S3-compatible storage

Cấu trúc:

```text
projects/
    {project_id}/
        versions/
            {version_id}/
                source/
                manifest.json
                metadata.json
```

Database lưu metadata/path thay vì toàn bộ source.

## 28. Database

Các bảng chính:

```text
users

projects
project_domains
project_api_keys
project_versions
project_deployments

themes
theme_versions

assets
```

Quan hệ:

```text
User
  ↓
Projects
  ├── Domains
  ├── API Keys
  ├── Versions
  └── Deployments

Theme
  ↓
Theme Versions
```

## 29. Deployment Flow

```text
User clicks Publish
  ↓
Check Project
  ↓
Check Version
  ↓
Validate Source
  ↓
Create Deployment
  ↓
Prepare Release
  ↓
Copy Static Files
  ↓
Health Check
  ↓
Switch Current Version
  ↓
Deployment Success
```

## 30. Preview

Nên preview trước khi publish:

```text
Upload
  ↓
Temporary Release
  ↓
Preview URL
  ↓
User kiểm tra
  ↓
Publish
```

Ví dụ:

```text
https://preview.your-platform.com/{project_id}/{version_id}
```

## 31. Deployment Status

```text
pending
processing
success
failed
rolled_back
```

## 32. Deployment Logs

Nên lưu:

```text
deployment_id
project_id
version_id
status
started_at
completed_at
error_message
```

## 33. Security Requirements

Tối thiểu:

- HTTPS
- Path traversal protection
- ZIP bomb protection
- File size limit
- Extracted size limit
- File count limit
- File extension validation
- Malware scanning nếu cần
- Không chạy server-side code từ user upload
- Không extract trực tiếp vào production
- API key theo project
- API key revoke/rotate
- Public API và Private API tách biệt
- Version immutable
- Atomic deployment
- Rollback
- Audit log

## 34. Recommended Technology Stack

Với hệ thống hiện tại:

```text
Platform UI
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
```

Docker chỉ cần thiết nếu sau này cần build/processing/sandbox phức tạp. Runtime của customer website vẫn có thể chỉ là static files.

## 35. MVP Roadmap

### Phase 1 — Website Builder

```text
[ ] Project
[ ] Theme
[ ] Theme configuration
[ ] Website Builder
[ ] HTML Generator
[ ] Preview
[ ] Static deployment
[ ] Domain
```

### Phase 2 — HTML Export/Import

```text
[ ] Download HTML
[ ] ZIP export
[ ] manifest.json
[ ] Upload HTML
[ ] Static file validation
[ ] Preview uploaded website
[ ] Versioning
[ ] Rollback
```

### Phase 3 — Dynamic API

```text
[ ] Site API Key
[ ] Public API
[ ] Product API
[ ] Category API
[ ] Content API
[ ] Settings API
[ ] Domain validation
[ ] CORS
```

### Phase 4 — Production Features

```text
[ ] Automatic SSL
[ ] CDN
[ ] Cache
[ ] Deployment logs
[ ] Audit logs
[ ] Backup
[ ] Analytics
[ ] Theme marketplace
```

## 36. End-to-End Example

### Bước 1 — Tạo website

```text
User
  ↓
Create Project
  ↓
Select Restaurant Theme
  ↓
Customize
```

### Bước 2 — Generate

```text
Theme
  ↓
HTML Generator
  ↓
index.html
about.html
menu.html
css/
js/
assets/
```

### Bước 3 — Deploy

```text
Version 1
  ↓
Deploy
  ↓
restaurant.com
```

### Bước 4 — Download

```text
restaurant.com
  ↓
Download HTML
  ↓
restaurant.zip
```

### Bước 5 — User chỉnh sửa

```text
VS Code

index.html
style.css
main.js
```

### Bước 6 — Upload

```text
restaurant-custom.zip
  ↓
Validate
  ↓
Project #123
  ↓
Version 2
```

### Bước 7 — Deploy

```text
Version 2
  ↓
Preview
  ↓
Publish
  ↓
restaurant.com
```

Website production hiện tại là bản user đã chỉnh sửa.

### Bước 8 — Dynamic Data

Website vẫn gọi:

```text
api.your-platform.com
```

để lấy:

```text
Products
Categories
Posts
Settings
Menu
```

Dữ liệu không bị ảnh hưởng bởi việc user sửa HTML/CSS.

## 37. Kiến trúc cuối cùng

```text
                         USER
                           │
                           ▼
                    ┌─────────────┐
                    │   Next.js   │
                    │  Platform   │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Platform API │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
           Projects      Themes       API Keys
              │
              ▼
           Versions
              │
              ▼
          Deployments
              │
              ▼
          S3 / MinIO
              │
              ▼
            Nginx
              │
       ┌──────┼──────┐
       ▼      ▼      ▼
     Site A Site B Site C
       │      │      │
       └──────┼──────┘
              ▼
          Public API
              │
              ▼
           Database
```

## 38. Kết luận

Mô hình phù hợp nhất là:

> **Static HTML Website Builder + HTML Export/Import + Versioned Deployment + Public API Platform**

Customer website không cần chạy application server riêng.

Website chỉ gồm:

```text
HTML
CSS
JavaScript
Assets
```

Platform quản lý:

```text
Theme
Project
Customization
Version
Deployment
Domain
API Key
Dynamic Data
```

Flow chính:

```text
             PLATFORM
                 │
                 ▼
              Theme
                 │
                 ▼
         Website Builder
                 │
                 ▼
          Generate HTML
                 │
          ┌──────┴──────┐
          ▼             ▼
       Publish       Download
          │             │
          ▼             ▼
       Website      User edits
                        │
                        ▼
                     Upload
                        │
                        ▼
                   New Version
                        │
                        ▼
                     Publish
                        │
                        ▼
                  Customer Site
                        │
                        ▼
                  Public API
                        │
                        ▼
                      Data
```
