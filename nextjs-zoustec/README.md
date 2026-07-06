# Zoustec AR 體驗平台 — Next.js

AR 集章互動體驗平台的 6 個核心畫面，以 Next.js (App Router) 建置，每個畫面為獨立路由。

## 執行

```bash
npm install
npm run dev
```

開啟 http://localhost:3000

## 路由 / 畫面

| 路由 | 畫面 |
| --- | --- |
| `/` | 首頁 (畫面總覽) |
| `/dashboard` | 客戶管理後台 |
| `/builder` | 活動網站產生器 (含 AI 快速生成 + 選擇類型) |
| `/ar-studio` | AI 3D 生成工具 |
| `/experience` | WebAR 體驗 (LINE LIFF) |
| `/console` | 平台管理後台 (Zoustec) |
| `/portal` | 活動入口網站 |

## 技術

- **Next.js 14** App Router，React 18
- **lucide-react** 圖示
- 設計 token（色彩／字體／間距）置於 `app/globals.css`
- 字體：Plus Jakarta Sans + Noto Sans TC（繁體中文）+ JetBrains Mono

> 介面文字為繁體中文；畫布上的標題／說明為越南文（設計標註），可於各 `page.jsx` 內移除。
