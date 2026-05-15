# Food Label Pro 食品營養標示系統

Food Label Pro 是依照交接文件規格製作的商用級 Web + Android 專案，提供台灣食品產業常用的原料資料庫、配方管理、營養標示格式 A/B 產生、法規資料庫、全文檢索、匯入匯出、備份還原與列印輸出。

## 核心特色

- **GitHub 可直接使用**：`web/` 為純靜態 PWA，可部署到 GitHub Pages、Cloudflare Pages 或任何靜態主機。
- **Android 7.1.1 相容 APK**：原生 Android WebView 殼層，`minSdk 21`，Android 7.1.1(API 25) 可安裝。
- **離線資料庫**：使用瀏覽器 `localStorage` 保存原料、配方、法規、同步紀錄；Android 版同樣保存在 WebView DOM Storage。
- **TFND/TFDA 離線營養查詢**：內建台灣政府食品營養成分資料庫（TFND 2025 UPDATE1）精簡檔，可在新增原料時搜尋 2,213 筆食品並一鍵帶入每 100g 數值，不依賴線上 API 成功率。
- **營養計算**：依配方重量換算總量、每份、每 100 公克/毫升營養素。
- **標示格式 A/B**：格式 A 顯示每份與每 100 公克；格式 B 顯示每份與每日參考值百分比。
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
│     ├─ assets/web/           # Android APK 內嵌 Web App 檔案
│     ├─ java/tw/foodlabel/pro/MainActivity.java  # WebView 原生殼層
│     └─ res/values/styles.xml # Android 主題
├─ docs/
│  ├─ ARCHITECTURE.md          # 架構、資料流與部署說明
│  └─ USER_GUIDE.md            # 使用者操作手冊
├─ gradle/wrapper/             # Gradle Wrapper
├─ web/
│  ├─ data/tfda_nutrition_compact.json # TFND/TFDA 離線營養資料庫精簡檔
│  ├─ index.html               # PWA 主畫面與功能容器
│  ├─ styles.css               # RWD / 列印樣式
│  ├─ app.js                   # 核心商業邏輯，含繁體中文註釋
│  ├─ manifest.webmanifest     # PWA 設定
│  └─ sw.js                    # 離線快取 Service Worker
├─ scripts/
│  └─ update_tfda_nutrition.py # 下載/轉換 TFDA 食品營養成分資料集
├─ build.gradle                # Android 根專案設定
├─ gradle.properties           # Gradle/Android 建置參數
├─ settings.gradle             # Gradle 專案設定
└─ README.md                   # 本說明文件
```

## 本機使用 Web 版

```bash
cd /home/user/webapp
python3 -m http.server 8080 --directory web
```

瀏覽器開啟 `http://localhost:8080` 後即可使用。若部署到 GitHub Pages，請啟用 Actions workflow `pages.yml`。

## 本機建置 Android APK

需求：JDK 17、Android SDK、Gradle Wrapper 可連網下載依賴。

```bash
cd /home/user/webapp
./gradlew assembleRelease
```

APK 位置：

```text
app/build/outputs/apk/release/app-release.apk
```

## GitHub Actions 建置 APK

1. 將本專案推送到 GitHub。
2. 開啟 Actions → `Build Android APK`。
3. 執行完成後下載 artifact：`food-label-pro-apk`。
4. 解壓後安裝 `app-release.apk`。

## 主要功能對照交接文件

| 編號 | 功能 | 實作狀態 |
|---|---|---|
| F-01 | 原料資料庫 | 已實作：內建種子資料、CRUD、CSV 匯入匯出、TFND/TFDA 離線營養查詢、線上輔助查詢 |
| F-02 | 配方管理 | 已實作：新增、編輯、刪除、重量明細 |
| F-03 | 營養計算 | 已實作：總量、每份、每 100g/ml |
| F-04 | 標示預覽 | 已實作：格式 A / 格式 B、列印樣式 |
| F-05 | 法規資料庫 | 已實作：離線資料、來源、checksum、版本時間 |
| F-06 | 自動/手動同步 | 已實作：手動同步；PWA 離線保留資料 |
| F-07 | 全文檢索 | 已實作：原料與法規即時全文搜尋 |
| F-08 | 熱感列印 | 已實作：瀏覽器/Android 系統列印；專用 ESC/POS 可後續接藍牙 SDK |
| F-09 | 設定 / 系統資訊 | 已實作：備份還原、重置、列印、相容性資訊 |

## 編碼與維護規範

- 所有自製程式與設定均使用 UTF-8。
- 關鍵程式碼已加入繁體中文註釋，方便後續交接。
- `web/` 與 `app/src/main/assets/web/` 必須保持同步；修改 Web 或 TFND/TFDA 離線資料庫後請複製到 Android assets。
- 更新 TFND/TFDA 離線資料庫：執行 `python3 scripts/update_tfda_nutrition.py`，腳本會從 `https://consumer.fda.gov.tw/Food/TFND.aspx?nodeID=178` 擷取最新版 EXCEL 下載連結、下載官方資料、轉換為精簡 JSON，並同步輸出到 Web 與 Android assets。
- 正式上架前請替換 `app/build.gradle` 的 debug 簽章為正式 keystore。
