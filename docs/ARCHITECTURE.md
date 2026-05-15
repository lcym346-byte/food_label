# Food Label Pro 架構文件

## 1. 系統定位

本專案採用「靜態 Web App + 原生 Android WebView」架構，目標是在不依賴雲端後端的情況下，同時滿足 GitHub Pages 部署與 Android 7.1.1 APK 安裝需求。

## 2. 技術架構

```text
使用者操作
  ↓
web/index.html + web/styles.css
  ↓
web/app.js 商業邏輯
  ├─ 原料 CRUD / CSV 匯入匯出
  ├─ TFND/TFDA 離線食品營養資料庫搜尋 / 公開 API 輔助查詢
  ├─ 配方 CRUD / 營養換算
  ├─ 格式 A / 格式 B 標示產生
  ├─ 法規資料庫 / 全文搜尋 / 同步紀錄
  └─ 備份還原 / 列印
  ↓
localStorage 離線資料庫 + web/data/tfda_nutrition_compact.json（TFND 2025 UPDATE1 精簡檔）
```

Android 版：

```text
MainActivity.java
  ↓ 載入
file:///android_asset/web/index.html
  ↓
同一套 web/app.js
  ↓
Android WebView DOM Storage
```

## 3. 為何採用此架構

- **可快速上 GitHub 使用**：不需要伺服器、資料庫或 API Key；TFND/TFDA 精簡 JSON 隨靜態檔部署。
- **Android 7.1.1 相容性高**：WebView + Java 原生殼層能降低 Flutter/新 SDK 對舊裝置的風險。
- **功能一致**：Web 與 APK 共用同一套核心程式，避免兩份程式邏輯不同步。
- **易維護**：商業邏輯集中在 `web/app.js`，繁中註釋完整。

## 4. 資料模型

### 原料 ingredient

| 欄位 | 說明 |
|---|---|
| id | 本機唯一 ID |
| name | 原料名稱 |
| source | 資料來源 |
| calories | 熱量 kcal / 100g |
| protein | 蛋白質 g / 100g |
| fat | 脂肪 g / 100g |
| saturatedFat | 飽和脂肪 g / 100g |
| transFat | 反式脂肪 g / 100g |
| carbohydrate | 碳水化合物 g / 100g |
| sugar | 糖 g / 100g |
| sodium | 鈉 mg / 100g |
| fiber | 膳食纖維 g / 100g |
| tags | 搜尋標籤 |

### 配方 recipe

| 欄位 | 說明 |
|---|---|
| id | 本機唯一 ID |
| name | 配方名稱 |
| packageWeight | 成品/包裝總重 |
| servingSize | 每份重量 |
| labelType | A 或 B |
| items | 原料與重量明細 |
| notes | 備註 |

### 法規 regulation

| 欄位 | 說明 |
|---|---|
| source | TFDA / Foodlabel / MOHW / SGS 等來源 |
| type | 法規分類 |
| title | 標題 |
| url | 來源連結 |
| text | 條文摘要或同步文字 |
| tags | 全文檢索標籤 |
| checksum | 版本變更校驗碼 |
| fetchedAt | 抓取時間 |

## 5. 營養計算規則

1. 每項原料資料以每 100g 為基準。
2. 原料投入營養素 = 原料每 100g 數值 × 投入重量 / 100。
3. 配方總營養素 = 所有原料投入營養素加總。
4. 每 100g 數值 = 總營養素 × 100 / 成品重量。
5. 每份數值 = 總營養素 × 每份重量 / 成品重量。
6. 格式 B 的每日參考值百分比依程式內建參考值換算，正式產品可依最新 TFDA 公告調整。

## 6. TFND/TFDA 離線營養資料庫

主要資料來源為使用者指定的台灣政府「食品營養成分資料庫」頁面：

```text
https://consumer.fda.gov.tw/Food/TFND.aspx?nodeID=178
```

產生器會從該頁面自動擷取最新版 EXCEL 下載連結，目前對應 `食品營養成分資料庫2025版UPDATE1EXCEL`。另會下載 TFDA OpenData 長表資料作為英文名與舊欄位補充來源：

```text
https://data.fda.gov.tw/opendata/exportDataList.do?method=ExportData&InfoId=20&logType=5
```

維護流程：

1. 執行 `python3 scripts/update_tfda_nutrition.py`。
2. 腳本下載 TFND 頁面與最新版 EXCEL，並以標準函式庫解析 XLSX。
3. 腳本同時下載 TFDA OpenData ZIP，補齊英文名等輔助欄位。
4. 依食品整合編號輸出每一食品一筆的精簡結構。
5. 輸出 `web/data/tfda_nutrition_compact.json` 與 `app/src/main/assets/web/data/tfda_nutrition_compact.json`。

目前精簡檔包含 2,213 筆食品，已包含頁面上的 2025 年取樣新增項目；搜尋會比對食品名稱、俗名、英文名、分類與描述，依完全符合、名稱包含、俗名/英文名包含與關鍵字命中加權排序。TFND/TFDA 原始資料中「反式脂肪」單位為 mg，App 表單與標示採 g，因此產生器會自動將反式脂肪 mg 轉為 g；鈉保留 mg。

## 7. 部署流程

- Web：`web/` 目錄可由 GitHub Pages 或任何靜態主機部署，Service Worker 會快取核心檔與 TFDA 精簡 JSON。
- Android：`.github/workflows/android-apk.yml` 使用 JDK 17 與 Android Gradle Plugin 建置 APK artifact；若 GitHub App 無 workflow 權限，請依 `docs/GITHUB_WORKFLOWS_MANUAL_SETUP.md` 手動建立 workflow。

## 8. 營養資料查詢限制

新增原料時會優先查詢內建 TFND/TFDA 離線食品營養資料庫，再比對本機種子資料，並嘗試查詢 Open Food Facts 與 USDA FoodData Central。由於公開網站可能有 CORS、流量限制、資料缺漏或品名翻譯差異，系統會顯示候選結果給使用者人工選擇，不會在未複核前自動覆蓋資料。正式標示仍建議以 TFDA/檢驗報告/供應商規格書複核。

## 9. 後續擴充建議

- 串接藍牙 ESC/POS SDK，補上熱感印表機直連列印。
- 將 localStorage 升級為 IndexedDB，支援更大法規全文資料。
- 加入正式 release keystore 與 Play Console 上架設定。
- 建立自動化 E2E 測試，確認配方換算與標示格式不回歸。
