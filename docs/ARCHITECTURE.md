# Food Label Pro 架構文件

## 1. 系統定位

本專案採用「靜態 Web App + 原生 Android WebView」架構，目標是在不依賴雲端後端的情況下，同時滿足 GitHub Pages 部署與 Android 7.1.1 APK 安裝需求，並能產出符合 TFDA 規範的食品九大項標示。

## 2. 技術架構

```text
使用者操作
  ↓
web/index.html + web/styles.css
  ↓
web/app.js 商業邏輯
  ├─ 原料 CRUD / CSV 匯入匯出
  ├─ TFND/TFDA 離線食品營養資料庫搜尋 / 公開 API 輔助查詢
  ├─ 配方 CRUD（含「標示資訊」分頁：添加物、過敏原、基改、有效日期、警語）
  ├─ 公司／品牌／廠商資訊 CRUD（設定頁，可被配方共用或覆寫）
  ├─ 營養計算（總量 / 每份 / 每100g）
  ├─ TFDA 九大項標示產生（格式 A / 格式 B）
  ├─ 法規資料庫 / 全文搜尋 / 同步紀錄
  └─ 備份還原 / 列印（CSS 強制 ≥ 2mm 字級）
  ↓
記憶體 state（單一物件，所有讀寫的真實來源）
  ↓
持久層 v2（沿用 2026-05-15 升級）
  ├─ 主：IndexedDB（DB: foodLabelProDB，store: appState，key: foodLabelPro.state.v1）
  └─ 備：localStorage（fallback；舊版資料來源）
  ＋ web/data/tfda_nutrition_compact.json（TFND 2025 UPDATE1 精簡檔，由 fetch 載入）
MainActivity.java（WebSettings 啟用 DomStorage、Database，IndexedDB 預設可用）
  ↓ 載入
file:///android_asset/web/index.html
  ↓
同一套 web/app.js
  ↓
Android WebView 內建 IndexedDB（與 DOM Storage 共用 storage 子系統）

3. 為何採用此架構
可快速上 GitHub 使用：不需要伺服器、資料庫或 API Key；TFND/TFDA 精簡 JSON 隨靜態檔部署。
Android 7.1.1 相容性高：WebView + Java 原生殼層能降低 Flutter/新 SDK 對舊裝置的風險。IndexedDB 自 API 19 起即由 Android WebView 原生支援，minSdk 21 無相容性問題。
功能一致：Web 與 APK 共用同一套核心程式，web/app.js 與 app/src/main/assets/web/app.js 為鏡像，任何修改需同步雙寫。
易維護：商業邏輯集中在 web/app.js，繁中註釋完整；持久層採「記憶體為真，磁碟非同步寫入」策略，業務邏輯無需感知底層儲存。
4. 資料模型
持久層儲存策略
唯一 key：foodLabelPro.state.v1（IndexedDB 與 localStorage 兩邊同 key）。
儲存內容：以 JSON.stringify 序列化的單一 state 物件，欄位為 ingredients[]、recipes[]、regulations[]、activity[]、companies[]、brands[]、lastSyncAt、selectedRecipeId。
讀取順序：啟動時先試 IndexedDB → 若空再讀 localStorage（首次升級自動遷移到 IndexedDB，並在 activity 紀錄一筆「系統升級」訊息）→ 仍空則建立種子資料。
寫入策略：所有 CRUD 仍以同步方式更新 in-memory state 並立即 renderAll()；磁碟寫入為 fire-and-forget 非同步序列佇列（persistQueue），不阻塞 UI。
容錯：IndexedDB 開啟失敗（極端瀏覽器、隱私模式）自動退回 localStorage；寫入失敗靜默不丟例外。
舊資料保留：升級後 localStorage 那筆不刪，作為 fallback 與回滾備援。「重置示範資料」會同時清除 IndexedDB 與 localStorage。
舊版相容：載入時呼叫 migrateState()，自動為舊配方補上 v3 標示欄位（companyId、additives、allergens 等），避免讀取舊資料炸掉。
原料 ingredient
欄位	說明
id	本機唯一 ID
name	原料名稱
source	資料來源
calories	熱量 kcal / 100g
protein	蛋白質 g / 100g
fat	脂肪 g / 100g
saturatedFat	飽和脂肪 g / 100g
transFat	反式脂肪 g / 100g
carbohydrate	碳水化合物 g / 100g
sugar	糖 g / 100g
sodium	鈉 mg / 100g
fiber	膳食纖維 g / 100g
tags	搜尋標籤
配方 recipe（v3 擴充）
欄位	說明
id	本機唯一 ID
name	配方名稱（內部識別）
productName	印在標示上的產品名稱（留空則使用 name）
packageWeight	成品 / 包裝總重（g）
servingSize	每份重量（g 或 ml）
labelType	A（每份 / 每100g）或 B（每份 / 每日參考值%）
items	原料與投入重量明細
notes	備註（不印於標示）
companyId	關聯公司／廠商 ID（可空，可在配方內覆寫）
brandId	關聯品牌 ID（可空）
companyNameOverride / companyPhoneOverride / companyAddressOverride / companyTaxIdOverride	本配方專用覆寫欄位，留空則用 companyId 對應資料
originCountry	原產地（國）
expiryMode	manufactureDate（製造日+月數）或 date（固定日期）
manufactureDate	製造日（ISO yyyy-mm-dd）
shelfLifeMonths	保存月數（整數）
expiryDate	固定有效日期（ISO）
storageCondition	保存條件文字
additives	[{ name, function }]，function 來自 TFDA 17 類
allergens	[{ id, mode }]，mode 為 contains 或 mayContain，id 對應 11 類目錄
gmoIngredients	基改原料名稱字串陣列
warnings	自由文字警語，以換行分隔
公司 company（v3 新增）
欄位	說明
id	本機唯一 ID
name	公司／廠商名稱
phone	電話
taxId	統一編號
address	地址
country	預設原產國
isDefault	是否為預設公司（同時只有一筆）
品牌 brand（v3 新增）
欄位	說明
id	本機唯一 ID
name	品牌名稱
companyId	關聯公司 ID（可空）
isDefault	是否為預設品牌
法規 regulation
欄位	說明
source	TFDA / Foodlabel / MOHW / SGS 等來源
type	法規分類
title	標題
url	來源連結
text	條文摘要或同步全文（IndexedDB 升級後不再受 localStorage ~5MB 限制）
tags	全文檢索標籤
checksum	版本變更校驗碼
fetchedAt	抓取時間
5. 營養計算規則
每項原料資料以每 100g 為基準。
原料投入營養素 = 原料每 100g 數值 × 投入重量 / 100。
配方總營養素 = 所有原料投入營養素加總。
每 100g 數值 = 總營養素 × 100 / 成品重量。
每份數值 = 總營養素 × 每份重量 / 成品重量。
格式 B 的每日參考值百分比依程式內建參考值換算，正式產品可依最新 TFDA 公告調整。
6. TFDA 九大項標示產生
依《食品安全衛生管理法》第 22 條與施行細則，包裝食品須以中文及通用符號明顯標示下列九項，本系統皆已對應實作：

#	TFDA 規定項目	系統實作位置
1	品名	recipe.productName 或 recipe.name
2	內容物名稱（依含量由高到低）	buildIngredientList() 自動依投入重量排序
3	淨重 / 容量 / 數量	recipe.packageWeight
4	食品添加物名稱 + 功能性類別	recipe.additives[].name + .function（TFDA 17 類）
5	製造廠商 / 國內負責廠商名稱、電話、地址	company 物件 + recipe 覆寫欄位
6	原產地（國）	recipe.originCountry 或 company.country
7	有效日期 / 保存條件	expiryMode、manufactureDate + shelfLifeMonths 或 expiryDate、storageCondition
8	營養標示	calculateRecipe() + 格式 A/B
9	其他應標示事項（過敏原、基改、特殊警語）	recipe.allergens[]（11 類）、recipe.gmoIngredients[]、recipe.warnings
自動偵測與使用者覆核
系統會從原料名稱與標籤掃出「建議勾選」項目，僅作為提示，使用者必須勾選才會列入最終標示：

過敏原 11 類（ALLERGEN_CATALOG）：依關鍵字比對原料 → 在 dialog 內標記黃色「系統建議」。
添加物（ADDITIVE_KEYWORDS）：掃出泡打粉、香料、阿斯巴甜等候選 → 「＋」按鈕加入。
基改候選（GMO_CANDIDATES）：含黃豆、玉米等 → 標記建議。
正式商品上市前仍須由品保 / 法規人員依最新 TFDA 公告複核。

字體規範
標示版面 CSS 套用 font-size: max(2mm, 8pt)，符合 TFDA 公告之最小字體 2mm 要求。

7. TFND/TFDA 離線營養資料庫
主要資料來源為使用者指定的台灣政府「食品營養成分資料庫」頁面：

Copyhttps://consumer.fda.gov.tw/Food/TFND.aspx?nodeID=178
維護流程：

執行 python3 scripts/update_tfda_nutrition.py。
腳本下載 TFND 頁面與最新版 EXCEL，並以標準函式庫解析 XLSX。
腳本同時下載 TFDA OpenData ZIP，補齊英文名等輔助欄位。
依食品整合編號輸出每一食品一筆的精簡結構。
輸出 web/data/tfda_nutrition_compact.json 與 app/src/main/assets/web/data/tfda_nutrition_compact.json。
目前精簡檔包含 2,213 筆食品。此 JSON 由 fetch() 載入，與持久層 IndexedDB 無關，不佔用 IndexedDB 配額。

8. 部署流程
Web：web/ 目錄可由 GitHub Pages 或任何靜態主機部署，Service Worker 會快取核心檔與 TFDA 精簡 JSON。修改 web/app.js 必須同步升 web/sw.js 的 CACHE_NAME（目前 v6），並雙寫到 app/src/main/assets/web/。
Android：.github/workflows/android-apk.yml 使用 JDK 17 與 Android Gradle Plugin 建置 APK artifact。
9. 已知問題與修正
編號	問題	修正方式	狀態
BUG-01	原料 / 配方 dialog 內的「取消」按鈕無法執行，因為 HTML5 <dialog> + <form method="dialog"> 在有 required 欄位時，取消按鈕也會觸發瀏覽器表單驗證	取消按鈕加上 type="button"、formnovalidate、data-action="closeDialog"，由 JS 主動 dialog.close('cancel')	✅ v3 已修正
10. 後續擴充建議
串接藍牙 ESC/POS SDK，補上熱感印表機直連列印。
加入正式 release keystore 與 Play Console 上架設定。
建立自動化 E2E 測試，確認配方換算、九大項輸出與標示格式不回歸。
法規資料如未來規模再上升，可在現行 appState 單 key 之外加開獨立 object store（如 regulations），改用 cursor 查詢進一步降低載入時間。
過敏原與添加物自動偵測可改為更智能的 NLP / 字典樹比對，並引入信心分數。
11. 變更紀錄
2026-05-15 (v3) 新增 TFDA 九大項完整標示產生（品名、內容物、添加物、淨重、廠商、原產地、有效日期、營養標示、過敏原 / 基改 / 警語）；新增公司 / 品牌資料管理；配方 dialog 改為三分頁（基本資料 / 配方原料 / 標示資訊）；修正取消按鈕 bug；CACHE_NAME v5 → v6；鏡像同步 web/ 與 app/src/main/assets/web/。
2026-05-15 (v2) 持久層由 localStorage 升級為 IndexedDB；保留 localStorage 作 fallback；解除大量法規全文容量限制；CACHE_NAME v4 → v5。
