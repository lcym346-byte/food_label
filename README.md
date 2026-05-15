# Food Label Pro 食品營養標示系統

Food Label Pro 是依照交接文件規格製作的商用級 Web + Android 專案，提供台灣食品產業常用的原料資料庫、配方管理、**TFDA 九大項完整食品標示**產生、營養標示格式 A/B、法規資料庫、全文檢索、匯入匯出、備份還原與列印輸出。

## 核心特色

- **TFDA 九大項完整標示**：一鍵產出含品名、內容物（依含量排序）、食品添加物（含 17 類功能標註）、淨重、廠商資訊、原產地、有效日期/保存條件、營養標示（格式 A/B）、過敏原 11 類警語、基改標示、特殊警語的完整標示貼紙；列印 CSS 強制 ≥ 2mm 字級，符合 TFDA 字體規範。
- **公司／品牌／廠商資料離線管理**：設定頁可建立多筆公司與品牌，配方可從下拉選單選用，也可在配方內覆寫單筆。
- **GitHub 可直接使用**：`web/` 為純靜態 PWA，可部署到 GitHub Pages、Cloudflare Pages 或任何靜態主機。
- **Android 7.1.1 相容 APK**：原生 Android WebView 殼層，`minSdk 21`，Android 7.1.1(API 25) 可安裝。
- **離線資料庫（IndexedDB）**：使用瀏覽器 IndexedDB 保存原料、配方、公司／品牌、法規、同步紀錄；保留 localStorage 作為 fallback 與舊版資料來源；不再受 ~5MB 容量限制，可承載大量法規全文。
- **TFND/TFDA 離線營養查詢**：內建台灣政府食品營養成分資料庫（TFND 2025 UPDATE1）精簡檔，可在新增原料時搜尋 2,213 筆食品並一鍵帶入每 100g 數值，不依賴線上 API 成功率。
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
│  ├─ index.html               # PWA 主畫面與功能容器（含三個 dialog）
│  ├─ styles.css               # RWD / 列印樣式（≥ 2mm 字級）
│  ├─ app.js                   # 核心商業邏輯，含繁體中文註釋
│  ├─ manifest.webmanifest     # PWA 設定
│  └─ sw.js                    # 離線快取 Service Worker（CACHE_NAME v6）
├─ scripts/
│  └─ update_tfda_nutrition.py # 下載/轉換 TFDA 食品營養成分資料集
├─ build.gradle                # Android 根專案設定
├─ gradle.properties           # Gradle/Android 建置參數
├─ settings.gradle             # Gradle 專案設定
└─ README.md                   # 本說明文件
