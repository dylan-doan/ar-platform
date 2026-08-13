# Zoustec 設計預覽器（site-preview）

在本機**所見即所得**地編輯活動網站的設計 JSON。這是一個**全客戶共用**的工具
——客戶只需帶著自己的 `design.json` 檔案來，不需要為每個網站匯出一份專案。

畫面元件與 Zoustec 平台**完全相同**（`npm run sync` 從平台原始碼逐檔複製），
資料走同一支公開 API，因此：**在這裡看到的樣子＝上傳發佈後的樣子**。

## 工作流程

```bash
npm install
cp .env.example .env.local     # 填 ZOUSTEC_TENANT_SLUG（例如 bnk）
npm run dev                    # http://localhost:3000
```

1. 在平台設計器按 **開發者 → 匯出設計 JSON**，把檔案存成本專案的
   `data/design.json`（整個蓋掉原本的 `{}`）。
2. 用編輯器修改 `data/design.json` → 存檔 → 瀏覽器重新整理即可看到結果。
   任務清單、統計數字、品牌設定都是**平台上的即時資料**。
3. 改好之後，把**同一個檔案**傳回平台，二選一：
   - 設計器按 **匯入設計 JSON** → 畫布確認 → 儲存並發佈；或
   - 走 API（適合自動化）：

     ```bash
     # 上傳成草稿（不動線上網站），回傳預覽網址
     curl -X PUT "$PLATFORM/api/admin/events/$EVENT_ID/design" \
       -H "Authorization: Bearer $ADMIN_TOKEN" \
       -H "Content-Type: application/json" \
       --data @data/design.json
     # → {"status":"draft","preview_path":"/e/bnk/walk?draft=…"}

     # 用預覽網址確認無誤後，正式發佈
     curl -X POST "$PLATFORM/api/admin/events/$EVENT_ID/design/publish" \
       -H "Authorization: Bearer $ADMIN_TOKEN"
     ```

## design.json 是什麼

純**資料**，不含任何程式碼：

- `puck` — 首頁版面（區塊清單 + 全站設定：佈景主題、自訂 CSS、選單）
- `pages` — 子頁面（每頁一份區塊清單）
- `header` / `footer` — 全站共用頁首頁尾

區塊型別（`StatsBand`、`Banner`、`Columns`…）只是名字；真正的畫法在共用的
`lib/site-blocks.jsx` 裡。平台在上傳時會驗證每個區塊型別，活動本身的欄位
（標題、代稱、獎勵）一律以平台上的活動資料為準——設計檔改不動它們。

## 沒網路也能用

`.env.local` 不填 `ZOUSTEC_TENANT_SLUG` 時，viewer 用預設品牌與空任務清單
渲染 `data/design.json` — 適合純版面調整；接上網路即接回真實資料。

## 維護（Zoustec 內部）

平台改了 `lib/site-blocks.jsx` 或任何共用元件後，在本目錄執行
`npm run sync` 重新複製，再 commit。共用檔案清單與
`app/api/export-nextjs/route.js` 的 SHARED 清單一致。
