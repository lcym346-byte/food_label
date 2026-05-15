# Food Label Pro 食品營養標示系統

Food Label Pro 是依照交接文件規格製作的商用級 Web + Android 專案，提供台灣食品產業常用的原料資料庫、配方管理、**TFDA 九大項完整食品標示**產生、營養標示格式 A/B、法規資料庫、全文檢索、匯入匯出、備份還原與列印輸出。

## 核心特色

- **TFDA 九大項完整標示**：一鍵產出含品名、內容物（依含量排序）、食品添加物（含 17 類功能標註）、淨重、廠商資訊、原產地、有效日期/保存條件、營養標示（格式 A/B）、過敏原 11 類警語、基改標示、特殊警語的完整標示貼紙；列印 CSS 強制 ≥ 2mm 字級，符合 TFDA 字體規範。
- **列印頁批次資訊（v3.1 新增）**：「標示產生」分頁左側提供「本批次列印資訊」卡片，可填寫製造日期、有效日期（或保存月數）、批號、保存條件覆寫。資料以 sessionStorage 暫存，**不寫回配方**；同一配方不同批次不必每次回去改配方。
- **TFDA 資料庫瀏覽分頁（v3.1 新增）**：主導覽列「TFDA 資料庫」可分類、搜尋、排序、分頁瀏覽 2,213 筆台灣食品營養資料，一鍵「採用為新原料」或從原料對話框「填回原料表單」。
- **公司／品牌／廠商資料離線管理**：設定頁可建立多筆公司與品牌，配方可從下拉選單選用，也可在配方內覆寫單筆。
- **GitHub 可直接使用**：`web/` 為純靜態 PWA，可部署到 GitHub Pages、Cloudflare Pages 或任何靜態主機。
- **Android 7.1.1 相容 APK**：原生 Android WebView 殼層，`minSdk 21`，Android 7.1.1(API 25) 可安裝。
- **離線資料庫（IndexedDB）**：使用瀏覽器 IndexedDB 保存原料、配方、公司／品牌、法規、同步紀錄；保留 localStorage 作為 fallback 與舊版資料來源；不再受 ~5MB 容量限制，可承載大量法規全文。
- **TFND/TFDA 離線營養查詢**：內建台灣政府食品營養成分資料庫（TFND 2025 UPDATE1）精簡檔，可在新增原料時搜尋並一鍵帶入每 100g 數值，不依賴線上 API 成功率。
- **營養計算**：依配方重量換算總量、每份、每 100 公克／毫升營養素。
- **標示格式 A/B**：格式 A 顯示每份與每 100 公克；格式 B 顯示每份與每日參考值百分比。
- **過敏原 / 添加物 / 基改自動建議**：系統從原料名稱掃出建議勾選項，使用者最終人工確認，避免誤判導致法規風險。
- **法規同步與全文搜尋**：內建 TFDA、Foodlabel、MOHW、SGS 摘要資料；可手動嘗試線上同步並保留版本 checksum。
- **商用品質資料管理**：原料 CSV 匯入/匯出、整包 JSON 備份/還原、瀏覽器列印標籤。
- **線上輔助資料查詢**：若裝置可連線，新增原料時仍會輔助查詢 Open Food Facts 與 USDA FoodData Central；失敗時仍可使用 TFND/TFDA 離線資料庫。

> 注意：本工具可大幅降低標示製作時間，但正式上市前仍應由品保或法規人員依最新 TFDA 公告複核。

## 完整目錄

```text
food_label_pro/
├─ .github/workflows/
│  ├─ android-apk.yml          # GitHub Actions：建置 Android release APK artifact
│  └─ pages.yml                # GitHub Actions：部署 web/ 到 GitHub Pages
├─ app/
│  ├─ build.gradle             # Android App 模組設定，minSdk 21
│  └─ src/main/
│     ├─ AndroidManifest.xml   # 權限、Activity 與 App 標籤
│     ├─ assets/web/           # Android APK 內嵌 Web App 檔案（鏡像同步自 web/）
│     ├─ java/tw/foodlabel/pro/MainActivity.java  # WebView 原生殼層（已啟用 DomStorage + Database）
│     └─ res/values/styles.xml # Android 主題
├─ docs/
│  ├─ ARCHITECTURE.md          # 架構、資料流、九大項實作對照與部署說明
│  └─ USER_GUIDE.md            # 使用者操作手冊
├─ gradle/wrapper/             # Gradle Wrapper
├─ web/
│  ├─ data/tfda_nutrition_compact.json # TFND/TFDA 離線營養資料庫精簡檔
│  ├─ index.html               # PWA 主畫面與功能容器（含原料、配方、公司、品牌四個 dialog）
│  ├─ styles.css               # RWD / 列印樣式（≥ 2mm 字級、no-print 規則）
│  ├─ app.js                   # 核心商業邏輯，含繁體中文註釋
│  ├─ manifest.webmanifest     # PWA 設定
│  └─ sw.js                    # 離線快取 Service Worker（CACHE_NAME v7）
├─ scripts/
│  └─ update_tfda_nutrition.py # 下載/轉換 TFDA 食品營養成分資料集
├─ build.gradle                # Android 根專案設定
├─ gradle.properties           # Gradle/Android 建置參數
├─ settings.gradle             # Gradle 專案設定
└─ README.md                   # 本說明文件
```

## 快速開始

### Web 本機開發

```bash
# 在專案根目錄
python3 -m http.server 8080 --directory web
# 開瀏覽器：http://localhost:8080
```

### GitHub Pages 部署

推送至 `genspark_ai_developer` 或 `main` 分支後，`.github/workflows/pages.yml` 會自動將 `web/` 目錄部署為靜態網站。

部署完成後可由以下網址存取：

```
https://lcym346-byte.github.io/food_label/
```

如改動 `web/app.js` 或 `web/sw.js`，請務必同步：

1. 把同樣的檔案複製到 `app/src/main/assets/web/`。
2. 升 `web/sw.js` 的 `CACHE_NAME`（目前 v7），避免使用者拿到舊快取。

### Android APK

本機建置（需 JDK 17 + Android SDK）：

```bash
./gradlew assembleRelease
# APK 路徑：app/build/outputs/apk/release/app-release.apk
```

或從 GitHub Actions 下載：

1. 進入 https://github.com/lcym346-byte/food_label/actions
2. 找到「Build Android APK」工作流程的最新成功 run。
3. 下載 `food-label-pro-apk` artifact，解壓得 `app-release.apk`。
4. 傳到 Android 7.1.1 以上裝置，允許「安裝未知來源」後安裝。

### 更新 TFND/TFDA 離線營養資料庫

需 Python 3 環境：

```bash
python3 scripts/update_tfda_nutrition.py
```

此腳本會重新抓取 TFDA 官方 EXCEL，產生 `web/data/tfda_nutrition_compact.json`，並同步至 `app/src/main/assets/web/data/`。

## 文件

- 操作手冊：[`docs/USER_GUIDE.md`](docs/USER_GUIDE.md)
- 架構文件：[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)（含資料模型、九大項對照表、持久層設計、變更紀錄）

## 已知問題與修正

| 編號 | 問題 | 修正 | 狀態 |
|------|------|------|------|
| BUG-01 | 原料 / 配方 dialog 內的「取消」按鈕在有 `required` 欄位時無法關閉（HTML5 `<dialog>` 表單驗證攔截） | 取消按鈕加 `type="button"` + `formnovalidate` + `data-action="closeDialog"`，由 JS 主動 `dialog.close('cancel')` | ✅ v3 已修正 |
| BUG-02 | 列印時會印出底部稽核行「配方：xxx｜更新：xxx｜本工具依輸入資料自動計算…」 | 該段加 `.no-print .label-footer-meta` class，並在 `@media print` 強制隱藏 | ✅ v3.1 已修正 |
| BUG-03 | 每次列印不同批次都要回去修改配方裡的製造日期 / 有效日期 | 新增「本批次列印資訊」卡片，以 sessionStorage 暫存，不寫回配方 | ✅ v3.1 已修正 |

## 變更紀錄

- **2026-05-15 (v3.1)**
  - **列印頁批次資訊**：在「標示產生」分頁新增「本批次列印資訊」卡片，可填寫製造日期、有效日期（或保存月數）、批號、保存條件覆寫；資料以 sessionStorage 暫存（key `foodLabelPro.printSession.v1`），不寫回配方。解決每次列印都要修改配方日期的問題。
  - **TFDA 資料庫瀏覽分頁**：主導覽新增「TFDA 資料庫」分頁，可分類、搜尋、排序、分頁（每頁 50 筆）瀏覽 2,213 筆台灣食品營養資料，提供「採用為新原料」與「填回原料表單」兩種採用模式。
  - **原料對話框**：「離線查詢」按鈕旁加上「瀏覽全部資料庫」按鈕，可直接跳到瀏覽分頁、選定後填回原料表單。
  - **列印底部稽核行隱藏**：列印時不再印出「配方：xxx｜更新：xxx｜本工具依輸入資料自動計算…」這行（畫面上仍可看到）。
  - **Service Worker**：`CACHE_NAME` v6 → v7。
  - **不動**：營養計算、IndexedDB 持久層、TFDA 離線搜尋、CSV/JSON 匯入匯出、Android Java 殼層、法規同步、既有 TFDA 九大項標示模板與資料模型完全保留。

- **2026-05-15 (v3)**
  - 新增 TFDA 九大項完整標示產生：品名、內容物、食品添加物（17 類功能）、淨重、製造廠商、原產地、有效日期/保存條件、營養標示（A/B 格式）、過敏原 11 類 / 基改 / 警語。
  - 新增公司／品牌資料離線管理（設定頁 + 配方可選可覆寫）。
  - 配方 dialog 改為三分頁（基本資料 / 配方原料 / 標示資訊）。
  - 修正 BUG-01：取消按鈕無法執行。
  - 列印 CSS 強制字體 ≥ 2mm。
  - `CACHE_NAME` v5 → v6；鏡像同步 `web/` 與 `app/src/main/assets/web/`。

- **2026-05-15 (v2)**
  - 持久層由 localStorage 升級為 IndexedDB（DB `foodLabelProDB`，store `appState`，key `foodLabelPro.state.v1`）。
  - 保留 localStorage 作 fallback 與舊版資料來源，首次升級自動遷移並記錄 activity。
  - 解除大量法規全文容量限制。
  - `CACHE_NAME` v4 → v5。

## 授權

本專案目前未附授權聲明，預設為「保留所有權利」。如需引用、改作或商業使用，請先聯絡專案維護者。
