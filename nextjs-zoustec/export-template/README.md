# {{EVENT_NAME}} — Zoustec 活動網站（Next.js 專案匯出）

這是您活動網站的**完整 Next.js 原始碼**。開發者可自由修改程式碼與版面，
並部署到任何支援 Node.js 的主機（Vercel / Render / 自有伺服器）。

## 快速開始

```bash
npm install
npm run dev        # http://localhost:3000
```

正式部署：

```bash
npm run build
npm start          # 或部署到 Vercel / Render
```

## 運作方式

- 本專案的畫面元件與 Zoustec 平台**完全相同**（同一份原始碼匯出），
  資料也走**同一支已驗證的 API**（`/api/headless/site/…`，以 `.env.local`
  內的專屬金鑰驗證）。因此不論網站由 Zoustec 代管或由貴公司自架，
  呈現結果一致。
- 內容（版面區塊、佈景主題、頁面、任務清單）**每 60 秒自動同步**。
  在平台的拖曳設計器修改後，此網站無需重新部署即會更新
  （可用 `ZOUSTEC_REVALIDATE` 調整秒數）。
- 平台離線或金鑰被撤銷時，自動改用 `data/site.json` 的快照。
- 玩家的 AR 集章流程仍在 LINE（LIFF）內進行 — 「開始旅程」按鈕
  會開啟 LINE。報名、任務、印章、獎勵等邏輯全部由平台提供。

## 如何確認網站真的在讀取平台資料

本網站是**伺服器端渲染（SSR）**：向平台取資料的請求發生在 Node 端，
瀏覽器只收到已完成的 HTML — 因此 DevTools 的 Network 分頁**看不到**
這個請求，這是 SSR 的正常現象，不代表沒有呼叫 API。

要確認實際呼叫了哪支 API，有三個方式：

1. **終端機日誌** — 執行 `npm run dev` / `npm start` 的視窗會印出每次呼叫：

   ```
   [zoustec] api — GET /api/headless/site/bnk 200 143ms · event=walk tasks=3
   [zoustec] snapshot — GET /api/headless/site/bnk 401 88ms — falling back to data/site.json
   ```

   （設 `ZOUSTEC_LOG=0` 可關閉。）

2. **狀態端點** — 開 `/api/zoustec-status`，這是瀏覽器**看得到**的真實請求：

   ```bash
   curl http://localhost:3000/api/zoustec-status
   ```

   回傳 `source`（`api` = 平台即時資料，`snapshot` = 離線備援）、實際
   endpoint、金鑰前綴、以及取得的活動／任務數量。

3. **頁面 meta 標籤** — DevTools → Elements → `<head>`，看
   `zoustec:source` 與 `zoustec:detail`。

若 `source` 顯示 `snapshot`，表示正在用離線快照（金鑰未填、已撤銷、
或平台連不上）— `detail` 會說明原因。

## 專案結構

| 路徑 | 說明 |
|---|---|
| `app/page.jsx` | 首頁（單一活動或多活動總覽） |
| `app/[page]/page.jsx` | 活動頁與子頁面（於平台設計器建立） |
| `components/event/EventSite.jsx` | 活動首頁版型（Hero／導覽列／頁尾） |
| `components/event/EventSubPage.jsx` | 子頁面版型 |
| `components/event/TenantLanding.jsx` | 多活動總覽頁 |
| `lib/site-blocks.jsx` | 區塊庫 + 佈景主題（與平台相同）— 可自訂區塊樣式 |
| `lib/site-data.js` | 平台 API 同步邏輯 |
| `app/api/zoustec-status/route.js` | 同步狀態診斷端點（見上一節） |
| `data/site.json` | 匯出時的內容快照（離線備援） |
| `.env.local` | API 位址與專屬金鑰（**請勿公開此檔**） |

> `components/` 與 `lib/` 內的檔案是平台正在使用的同一份程式碼。
> 修改它們即可自訂版型，但之後重新匯出會覆蓋您的修改 — 建議另存新元件。

## 修改內容 vs 修改程式碼

- **內容／版面區塊／主題**：建議回到 Zoustec 平台的拖曳設計器修改 —
  此網站會自動同步，也可把 `data/site.json` 的 `event.config`（`puck`、
  `pages`）修改後，用設計器的「匯入設計 JSON」上傳回平台。
- **程式碼**（元件、樣式、新功能）：直接修改本專案並部署到您自己的
  主機。程式碼修改**無法**上傳回平台（多租戶安全限制）。

## 金鑰管理

貴公司持有**一組** Zoustec API 金鑰，於開通服務（建立客戶帳號）時
自動產生。如遺失可請 Zoustec 於後台再次提供；亦可要求重新產生
（舊金鑰立即失效，需同步更新 `.env.local`）。

金鑰已預先填入 `.env.local` 的 `ZOUSTEC_EXPORT_KEY`，下載後即可直接
讀取平台即時內容。清空或註解該值時，網站改以 `data/site.json` 快照
運作，功能不受影響（終端機會印出 `[zoustec] snapshot — …` 提醒）。

> **只改 `.env.local` 這一個檔案。** Next.js 讀取環境變數的優先順序是
> `.env.local` **高於** `.env` — 若兩個檔案都存在，改了 `.env` 不會生效，
> 很容易誤判為「沒改到」。本專案只需要 `.env.local`；若目錄下另有 `.env`，
> 建議直接刪除以免混淆。

金鑰為唯讀，僅能讀取貴公司活動的公開內容（無會員資料、無寫入
權限），請勿提交到公開的版本庫（`.gitignore` 已排除 `.env.local`）。
