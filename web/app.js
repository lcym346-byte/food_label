/*
 * Food Label Pro 商用版核心程式
 * 說明：本檔以純瀏覽器技術實作離線資料庫、配方營養計算、TFDA 標示格式、法規檢索、匯入匯出與 PWA 安裝。
 *
 * 持久層 v2（2026-05-15）：
 *   - 主要儲存：IndexedDB（DB 名 foodLabelProDB，store 名 appState，key 為 STORAGE_KEY）。
 *     原因：localStorage 容量上限約 5MB，無法承載大量法規全文；IndexedDB 容量足以支援數百筆條文與長文字。
 *   - 啟動：一次性把 IndexedDB 內容讀進 in-memory `state`，之後所有讀寫沿用記憶體 state，
 *     寫入磁碟為非同步 fire-and-forget，不阻塞 UI，避免破壞既有同步呼叫流程。
 *   - 遷移：第一次啟動若 IndexedDB 為空但 localStorage 有舊資料，自動搬進 IndexedDB；
 *     舊的 localStorage 保留作為 fallback，可手動或還原備份時清除。
 *   - 容錯：IndexedDB 失敗（極端瀏覽器/隱私模式）自動退回 localStorage，功能不中斷。
 * Android：APK 以 WebView 內嵌同一套程式，WebSettings 已啟用 DomStorage 與 Database，IndexedDB 預設可用。
 */
(() => {
  'use strict';

  // ======== 共用工具：集中處理格式化、ID、儲存與提示 ========
  const STORAGE_KEY = 'foodLabelPro.state.v1';
  const IDB_NAME = 'foodLabelProDB';
  const IDB_VERSION = 1;
  const IDB_STORE = 'appState';
  const TFDA_NUTRITION_DB_URL = './data/tfda_nutrition_compact.json';
  const nowIso = () => new Date().toISOString();
  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const fmt = (value, digits = 1) => Number(value || 0).toLocaleString('zh-TW', { maximumFractionDigits: digits, minimumFractionDigits: Number(value) % 1 ? digits : 0 });
  const escapeHtml = (text = '') => String(text).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const parseNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

  // ======== IndexedDB 持久層：只動底層儲存，不影響任何業務邏輯 ========
  // 啟動失敗自動退回 localStorage，確保極端環境（隱私模式、舊瀏覽器）仍可運作。
  let idbHandle = null;          // 已開啟的 IDBDatabase
  let idbAvailable = false;      // 環境是否可用 IndexedDB
  let persistQueue = Promise.resolve(); // 寫入序列化，避免多筆並發互踩

  function openIdb() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB 不可用')); return; }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB 開啟失敗'));
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }

  function idbGet(key) {
    return new Promise((resolve, reject) => {
      const tx = idbHandle.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbPut(key, value) {
    return new Promise((resolve, reject) => {
      const tx = idbHandle.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function idbDelete(key) {
    return new Promise((resolve, reject) => {
      const tx = idbHandle.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function persistStateAsync(snapshot) {
    // fire-and-forget：UI 不等磁碟。錯誤靜默並嘗試 localStorage fallback，
    // 確保即使 IndexedDB 暫時無法寫入也不會破壞使用者操作流程。
    const payload = JSON.stringify(snapshot);
    persistQueue = persistQueue.then(async () => {
      if (idbAvailable && idbHandle) {
        try { await idbPut(STORAGE_KEY, payload); return; } catch (_) { /* 落到下方 fallback */ }
      }
      try { localStorage.setItem(STORAGE_KEY, payload); } catch (_) { /* 容量爆了也不丟例外，紀錄留待下一輪重試 */ }
    });
    return persistQueue;
  }

  // ======== 初始種子資料：可離線使用，符合交接文件要求的原料、法規、份量參考 ========
  const seedIngredients = [
    ['中筋麵粉', 'TFDA 精選種子', 364, 10.3, 1.0, 0.2, 0, 76.3, 0.3, 2, 2.7, '烘焙,穀物'],
    ['高筋麵粉', 'TFDA 精選種子', 361, 12.5, 1.2, 0.2, 0, 73.6, 0.4, 2, 2.5, '烘焙,麵包'],
    ['砂糖', 'TFDA 精選種子', 387, 0, 0, 0, 0, 100, 100, 1, 0, '甜味'],
    ['無鹽奶油', 'USDA/TFDA 參考', 717, 0.9, 81.1, 51.4, 3.3, 0.1, 0.1, 11, 0, '乳製品,油脂'],
    ['全蛋', 'TFDA 精選種子', 143, 12.6, 9.5, 3.1, 0, 0.7, 0.4, 142, 0, '蛋品'],
    ['鮮奶', 'TFDA 精選種子', 61, 3.2, 3.3, 2.1, 0, 4.8, 4.8, 43, 0, '乳製品'],
    ['植物油', 'TFDA 精選種子', 884, 0, 100, 14.2, 0.5, 0, 0, 0, 0, '油脂'],
    ['可可粉', 'USDA/TFDA 參考', 228, 19.6, 13.7, 8.1, 0, 57.9, 1.8, 21, 37, '烘焙,風味'],
    ['鹽', 'TFDA 精選種子', 0, 0, 0, 0, 0, 0, 0, 39300, 0, '調味'],
    ['泡打粉', '食品添加物參考', 53, 0, 0, 0, 0, 27.7, 0, 10600, 0, '膨脹劑,添加物'],
    ['雞胸肉', 'TFDA 精選種子', 165, 31, 3.6, 1.0, 0, 0, 0, 74, 0, '肉類'],
    ['白米飯', 'TFDA 精選種子', 130, 2.7, 0.3, 0.1, 0, 28.2, 0.1, 1, 0.4, '穀物,主食'],
    ['黃豆', 'TFDA 精選種子', 446, 36.5, 19.9, 2.9, 0, 30.2, 7.3, 2, 9.3, '豆類,植物蛋白'],
    ['橄欖油', 'USDA 參考', 884, 0, 100, 13.8, 0, 0, 0, 2, 0, '油脂'],
    ['蜂蜜', 'TFDA 精選種子', 304, 0.3, 0, 0, 0, 82.4, 82.1, 4, 0.2, '甜味']
  ].map(([name, source, calories, protein, fat, saturatedFat, transFat, carbohydrate, sugar, sodium, fiber, tags]) => ({
    id: uid('ing'), name, source, calories, protein, fat, saturatedFat, transFat, carbohydrate, sugar, sodium, fiber, tags, updatedAt: nowIso()
  }));

  const seedRegulations = [
    { source: 'TFDA', type: '營養標示', title: '包裝食品營養標示應遵行事項', url: 'https://www.fda.gov.tw/tc/law.aspx?cid=62', text: '包裝食品營養標示應揭露熱量、蛋白質、脂肪、飽和脂肪、反式脂肪、碳水化合物、糖及鈉等資訊，並依每一份量及每100公克或毫升標示。', tags: 'TFDA,營養標示,格式A,格式B' },
    { source: 'TFDA', type: '食品標示', title: '食品安全衛生管理法標示重點', url: 'https://www.fda.gov.tw/', text: '食品應以中文及通用符號明顯標示品名、內容物、食品添加物、有效日期、營養標示、製造廠商及原產地等資訊。', tags: '食安法,標示,中文' },
    { source: 'Foodlabel', type: '標示問答', title: '營養標示格式 A 與格式 B 使用情境', url: 'https://www.foodlabel.org.tw/', text: '格式A通常呈現每份及每100公克數值；格式B可搭配每日參考值百分比，供消費者比較攝取量。', tags: 'Foodlabel,格式A,格式B' },
    { source: 'MOHW', type: '食品添加物', title: '食品添加物使用範圍及限量暨規格標準', url: 'https://law.moj.gov.tw/', text: '食品添加物應符合使用範圍、限量及規格標準，並於產品標示中依規定揭露用途名稱或品名。', tags: '添加物,限量,規格' },
    { source: 'SGS', type: '產業公告', title: '食品標示稽核常見缺失', url: 'https://www.sgs.com.tw/', text: '常見缺失包含份量基準不一致、鈉單位錯誤、反式脂肪未依規定四捨五入、過敏原資訊不足。', tags: '稽核,缺失,SGS' }
  ].map((r) => ({ ...r, id: uid('reg'), fetchedAt: nowIso(), checksum: checksum(`${r.title}${r.text}`), active: true }));

  const seedRecipes = () => {
    const flour = state.ingredients.find((i) => i.name === '中筋麵粉')?.id;
    const sugar = state.ingredients.find((i) => i.name === '砂糖')?.id;
    const butter = state.ingredients.find((i) => i.name === '無鹽奶油')?.id;
    const egg = state.ingredients.find((i) => i.name === '全蛋')?.id;
    return [{
      id: uid('rec'), name: '示範奶油餅乾', packageWeight: 320, servingSize: 40, labelType: 'A', notes: '內建示範配方，可直接編輯或刪除。',
      items: [{ ingredientId: flour, weight: 180 }, { ingredientId: sugar, weight: 70 }, { ingredientId: butter, weight: 60 }, { ingredientId: egg, weight: 50 }].filter((x) => x.ingredientId),
      updatedAt: nowIso()
    }];
  };

  let state;
  let onlineLookupCandidates = [];
  let offlineNutritionFoods = [];
  let offlineNutritionMeta = null;
  let offlineNutritionLoadPromise = null;

  function checksum(text) {
    // 簡易雜湊：瀏覽器離線可用，用於偵測法規資料版本變化。
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    return Math.abs(hash).toString(16);
  }

  async function loadState() {
    // 讀取優先順序：IndexedDB > localStorage（fallback / 舊版遷移來源）> 種子資料初始化
    let saved = null;
    let migratedFromLocal = false;

    if (idbAvailable && idbHandle) {
      try {
        const raw = await idbGet(STORAGE_KEY);
        if (raw) saved = JSON.parse(raw);
      } catch (_) { /* 讀取毀損則往下走 localStorage */ }
    }

    // 第一次升級或 IndexedDB 不可用：嘗試從 localStorage 接手既有資料
    if (!saved) {
      try {
        const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (legacy?.ingredients?.length) {
          saved = legacy;
          migratedFromLocal = idbAvailable; // 只有在 IDB 可用時才算「遷移」
        }
      } catch (_) { /* 資料毀損則重建 */ }
    }

    if (saved?.ingredients?.length) {
      if (migratedFromLocal) {
        // 把舊資料寫進 IndexedDB；保留 localStorage 那筆作 fallback，不刪除
        saved.activity = saved.activity || [];
        saved.activity.unshift({ at: nowIso(), message: '系統升級：資料已自動遷移至 IndexedDB，原 localStorage 備份保留。' });
        try { await idbPut(STORAGE_KEY, JSON.stringify(saved)); } catch (_) { /* 寫失敗下次再試 */ }
      }
      return saved;
    }

    const base = { ingredients: seedIngredients, recipes: [], regulations: seedRegulations, activity: [], lastSyncAt: null, selectedRecipeId: null };
    state = base;
    base.recipes = seedRecipes();
    base.selectedRecipeId = base.recipes[0]?.id || null;
    base.activity.unshift({ at: nowIso(), message: '系統初始化：已建立離線種子資料與示範配方。' });
    await persistStateAsync(base);
    return base;
  }

  function saveState(message) {
    if (message) state.activity.unshift({ at: nowIso(), message });
    state.activity = state.activity.slice(0, 30);
    // 非同步寫磁碟，立即重繪畫面；既有同步呼叫流程零變動
    void persistStateAsync(state);
    renderAll();
  }

  async function resetAllStorage() {
    // 集中處理「重置」：同時清掉 IndexedDB 與 localStorage 的舊資料
    if (idbAvailable && idbHandle) {
      try { await idbDelete(STORAGE_KEY); } catch (_) { /* 忽略 */ }
    }
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* 忽略 */ }
  }

  function toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ======== 營養計算：依每 100g 原料資料換算整體、每份、每100g ========
  function calculateRecipe(recipe) {
    const totals = { calories: 0, protein: 0, fat: 0, saturatedFat: 0, transFat: 0, carbohydrate: 0, sugar: 0, sodium: 0, fiber: 0 };
    const totalInputWeight = recipe.items.reduce((sum, item) => sum + parseNumber(item.weight), 0) || 1;
    recipe.items.forEach((item) => {
      const ingredient = state.ingredients.find((i) => i.id === item.ingredientId);
      if (!ingredient) return;
      Object.keys(totals).forEach((key) => { totals[key] += parseNumber(ingredient[key]) * parseNumber(item.weight) / 100; });
    });
    const finalWeight = parseNumber(recipe.packageWeight) || totalInputWeight;
    const servingSize = parseNumber(recipe.servingSize) || finalWeight;
    const servingCount = Math.max(1, finalWeight / servingSize);
    const factor100 = 100 / finalWeight;
    const factorServing = servingSize / finalWeight;
    const per100 = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v * factor100]));
    const perServing = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v * factorServing]));
    return { totals, per100, perServing, totalInputWeight, finalWeight, servingSize, servingCount };
  }

  function dailyPercent(key, value) {
    // 台灣標示常用參考值；實務上仍需依最新 TFDA 公告調整。
    const ref = { calories: 2000, protein: 60, fat: 60, saturatedFat: 18, carbohydrate: 300, sodium: 2000, fiber: 25, sugar: 50 };
    return ref[key] ? `${Math.round((value / ref[key]) * 100)}%` : '—';
  }

  // ======== 畫面渲染：任何資料變更後統一重繪，避免狀態不一致 ========
  function renderAll() {
    renderDashboard();
    renderIngredients();
    renderRecipes();
    renderRecipeSelect();
    renderRegulations();
  }

  function renderDashboard() {
    document.getElementById('ingredientCount').textContent = state.ingredients.length;
    document.getElementById('recipeCount').textContent = state.recipes.length;
    document.getElementById('regulationCount').textContent = state.regulations.length;
    document.getElementById('lastSyncAt').textContent = state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString('zh-TW') : '尚未同步';
    document.getElementById('activityLog').innerHTML = state.activity.map((entry) => `<div class="log-entry"><strong>${new Date(entry.at).toLocaleString('zh-TW')}</strong><br>${escapeHtml(entry.message)}</div>`).join('') || '<p>尚無紀錄</p>';
  }

  function renderIngredients() {
    const q = document.getElementById('ingredientSearch').value.trim().toLowerCase();
    const rows = state.ingredients.filter((i) => `${i.name} ${i.source} ${i.tags}`.toLowerCase().includes(q));
    document.getElementById('ingredientTable').innerHTML = rows.map((i) => `
      <tr><td><strong>${escapeHtml(i.name)}</strong><br><small>${escapeHtml(i.source || '')}</small><br><span class="badge">${escapeHtml(i.tags || '自建')}</span></td>
      <td>${fmt(i.calories)} kcal</td><td>${fmt(i.protein)} g</td><td>${fmt(i.fat)} g</td><td>${fmt(i.carbohydrate)} g</td><td>${fmt(i.sodium)} mg</td>
      <td><button data-action="editIngredient" data-id="${i.id}">編輯</button> <button class="danger" data-action="deleteIngredient" data-id="${i.id}">刪除</button></td></tr>`).join('');
  }

  function renderRecipes() {
    document.getElementById('recipeCards').innerHTML = state.recipes.map((r) => {
      const calc = calculateRecipe(r);
      return `<article class="card"><h3>${escapeHtml(r.name)}</h3><p>${escapeHtml(r.notes || '無備註')}</p>
        <p><span class="badge">格式 ${r.labelType}</span><span class="badge">每份 ${fmt(calc.servingSize)}g</span><span class="badge">約 ${fmt(calc.servingCount)} 份</span></p>
        <p>每份熱量 <strong>${fmt(calc.perServing.calories, 0)} kcal</strong>，蛋白質 ${fmt(calc.perServing.protein)}g，脂肪 ${fmt(calc.perServing.fat)}g。</p>
        <button data-action="selectRecipe" data-id="${r.id}">產生標示</button> <button data-action="editRecipe" data-id="${r.id}">編輯</button> <button class="danger" data-action="deleteRecipe" data-id="${r.id}">刪除</button>
      </article>`;
    }).join('') || '<article class="card"><p>尚無配方，請新增第一筆配方。</p></article>';
  }

  function renderRecipeSelect() {
    const select = document.getElementById('labelRecipeSelect');
    select.innerHTML = state.recipes.map((r) => `<option value="${r.id}" ${r.id === state.selectedRecipeId ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');
    renderLabel();
  }

  function renderLabel() {
    const recipe = state.recipes.find((r) => r.id === state.selectedRecipeId) || state.recipes[0];
    const preview = document.getElementById('labelPreview');
    const editor = document.getElementById('recipeEditor');
    if (!recipe) { preview.innerHTML = '<p>請先建立配方。</p>'; editor.innerHTML = ''; return; }
    const calc = calculateRecipe(recipe);
    const row = (name, key, unit, indent = false) => `<div class="nutrition-row ${indent ? 'indent' : ''}"><span>${name}</span><strong>${fmt(calc.perServing[key], key === 'calories' || key === 'sodium' ? 0 : 1)} ${unit}</strong><span>${recipe.labelType === 'B' ? dailyPercent(key, calc.perServing[key]) : fmt(calc.per100[key], key === 'calories' || key === 'sodium' ? 0 : 1) + ' ' + unit}</span></div>`;
    preview.innerHTML = `<div class="nutrition-label"><h2>營養標示</h2>
      <div class="nutrition-row bold"><span>每一份量</span><strong>${fmt(calc.servingSize)} 公克</strong></div>
      <div class="nutrition-row bold"><span>本包裝含</span><strong>${fmt(calc.servingCount)} 份</strong></div>
      <div class="nutrition-row bold"><span>項目</span><strong>每份</strong><span>${recipe.labelType === 'B' ? '每日參考值%' : '每100公克'}</span></div>
      ${row('熱量', 'calories', '大卡')}${row('蛋白質', 'protein', '公克')}${row('脂肪', 'fat', '公克')}${row('飽和脂肪', 'saturatedFat', '公克', true)}${row('反式脂肪', 'transFat', '公克', true)}${row('碳水化合物', 'carbohydrate', '公克')}${row('糖', 'sugar', '公克', true)}${row('膳食纖維', 'fiber', '公克', true)}${row('鈉', 'sodium', '毫克')}
      <p><small>配方：${escapeHtml(recipe.name)}｜更新：${new Date(recipe.updatedAt).toLocaleDateString('zh-TW')}｜本工具依輸入資料自動計算，正式上市前仍建議由品保/法規人員複核。</small></p></div>`;
    editor.innerHTML = `<h3>${escapeHtml(recipe.name)}</h3><p>原料總投入 ${fmt(calc.totalInputWeight)}g；成品/包裝重量 ${fmt(calc.finalWeight)}g。</p>${recipe.items.map((item) => {
      const ing = state.ingredients.find((i) => i.id === item.ingredientId);
      return `<div class="nutrition-row"><span>${escapeHtml(ing?.name || '未知原料')}</span><strong>${fmt(item.weight)} g</strong></div>`;
    }).join('')}<p><button data-action="editRecipe" data-id="${recipe.id}">編輯此配方</button> <button data-action="printLabel">列印標示</button></p>`;
  }

  function renderRegulations() {
    const q = document.getElementById('regulationSearch').value.trim().toLowerCase();
    const list = state.regulations.filter((r) => `${r.source} ${r.type} ${r.title} ${r.text} ${r.tags}`.toLowerCase().includes(q));
    document.getElementById('regulationList').innerHTML = list.map((r) => `<article class="regulation-item"><p><span class="badge">${escapeHtml(r.source)}</span><span class="badge">${escapeHtml(r.type)}</span><span class="badge">${escapeHtml(r.tags)}</span></p><h3>${escapeHtml(r.title)}</h3><p>${escapeHtml(r.text)}</p><p><small>抓取：${new Date(r.fetchedAt).toLocaleString('zh-TW')}｜Checksum：${r.checksum}</small></p><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">來源連結</a></article>`).join('') || '<p>查無法規資料。</p>';
  }

  // ======== 表單處理：原料與配方 CRUD ========
  function openIngredientDialog(id) {
    const form = document.getElementById('ingredientForm');
    const item = state.ingredients.find((i) => i.id === id) || {};
    document.getElementById('ingredientDialogTitle').textContent = id ? '編輯原料' : '新增原料';
    ['id','name','source','calories','protein','fat','saturatedFat','transFat','carbohydrate','sugar','sodium','fiber','tags'].forEach((k) => { form.elements[k].value = item[k] ?? ''; });
    onlineLookupCandidates = [];
    renderOnlineLookupResults([]);
    document.getElementById('ingredientDialog').showModal();
  }

  async function fetchJsonWithTimeout(url, timeoutMs = 8500) {
    // 公開資料來源有時回應較慢或阻擋 CORS，因此所有線上查詢都加上 timeout 與錯誤隔離。
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function roundNutrient(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Number(number.toFixed(2))) : 0;
  }

  function nutrientFromUsda(food, names) {
    const found = (food.foodNutrients || []).find((item) => names.some((name) => String(item.nutrientName || '').toLowerCase().includes(name)));
    return found ? roundNutrient(found.value) : 0;
  }

  function candidateFromOpenFoodFacts(product) {
    const nutriments = product.nutriments || {};
    const name = product.product_name || product.generic_name;
    if (!name || !Object.keys(nutriments).length) return null;
    const sodiumMg = nutriments.sodium_100g != null ? Number(nutriments.sodium_100g) * 1000 : Number(nutriments.salt_100g || 0) / 2.5 * 1000;
    return {
      name,
      source: `Open Food Facts${product.brands ? `｜${product.brands}` : ''}`,
      calories: roundNutrient(nutriments['energy-kcal_100g'] ?? (Number(nutriments.energy_100g || 0) / 4.184)),
      protein: roundNutrient(nutriments.proteins_100g),
      fat: roundNutrient(nutriments.fat_100g),
      saturatedFat: roundNutrient(nutriments['saturated-fat_100g']),
      transFat: roundNutrient(nutriments['trans-fat_100g']),
      carbohydrate: roundNutrient(nutriments.carbohydrates_100g),
      sugar: roundNutrient(nutriments.sugars_100g),
      sodium: roundNutrient(sodiumMg),
      fiber: roundNutrient(nutriments.fiber_100g),
      tags: '線上查詢,Open Food Facts',
      url: product.url || 'https://world.openfoodfacts.org/'
    };
  }

  function candidateFromUsda(food) {
    if (!food.description) return null;
    return {
      name: food.description,
      source: `USDA FoodData Central｜FDC ${food.fdcId || ''}`,
      calories: nutrientFromUsda(food, ['energy']),
      protein: nutrientFromUsda(food, ['protein']),
      fat: nutrientFromUsda(food, ['total lipid', 'total fat']),
      saturatedFat: nutrientFromUsda(food, ['saturated']),
      transFat: nutrientFromUsda(food, ['trans']),
      carbohydrate: nutrientFromUsda(food, ['carbohydrate']),
      sugar: nutrientFromUsda(food, ['sugars']),
      sodium: nutrientFromUsda(food, ['sodium']),
      fiber: nutrientFromUsda(food, ['fiber']),
      tags: '線上查詢,USDA FoodData Central',
      url: food.fdcId ? `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${food.fdcId}/nutrients` : 'https://fdc.nal.usda.gov/'
    };
  }

  async function loadTfdaNutritionDatabase() {
    // 內建離線資料庫由 scripts/update_tfda_nutrition.py 產生，部署在同網域 JSON，避免瀏覽器 CORS 與 ZIP 解壓限制。
    if (offlineNutritionFoods.length) return offlineNutritionFoods;
    if (!offlineNutritionLoadPromise) {
      offlineNutritionLoadPromise = fetchJsonWithTimeout(TFDA_NUTRITION_DB_URL, 12000).then((data) => {
        offlineNutritionMeta = data.meta || null;
        offlineNutritionFoods = Array.isArray(data.foods) ? data.foods : [];
        return offlineNutritionFoods;
      });
    }
    return offlineNutritionLoadPromise;
  }

  function candidateFromTfda(food) {
    return {
      name: food.name,
      source: `TFND/TFDA 離線資料庫｜${food.category || '未分類'}｜${food.id}`,
      calories: roundNutrient(food.calories),
      protein: roundNutrient(food.protein),
      fat: roundNutrient(food.fat),
      saturatedFat: roundNutrient(food.saturatedFat),
      transFat: roundNutrient(food.transFat),
      carbohydrate: roundNutrient(food.carbohydrate),
      sugar: roundNutrient(food.sugar),
      sodium: roundNutrient(food.sodium),
      fiber: roundNutrient(food.fiber),
      tags: `TFND離線資料庫,TFDA離線資料庫,${food.category || ''},${food.commonName || ''}`,
      url: offlineNutritionMeta?.sourceUrl || 'https://data.gov.tw/datasets/8543',
      description: food.description || food.commonName || food.englishName || ''
    };
  }

  async function searchTfdaOfflineNutrition(query) {
    const foods = await loadTfdaNutritionDatabase();
    const normalizedQuery = query.trim().toLowerCase();
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return foods
      .map((food) => {
        const haystack = `${food.name} ${food.commonName || ''} ${food.englishName || ''} ${food.category || ''} ${food.description || ''}`.toLowerCase();
        let score = 0;
        if (String(food.name || '').toLowerCase() === normalizedQuery) score += 100;
        if (String(food.name || '').toLowerCase().includes(normalizedQuery)) score += 50;
        if (String(food.commonName || '').toLowerCase().includes(normalizedQuery)) score += 35;
        if (String(food.englishName || '').toLowerCase().includes(normalizedQuery)) score += 25;
        terms.forEach((term) => { if (haystack.includes(term)) score += 10; });
        return { food, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name, 'zh-Hant'))
      .slice(0, 12)
      .map((item) => candidateFromTfda(item.food));
  }

  async function lookupIngredientOnline() {
    const form = document.getElementById('ingredientForm');
    const query = form.elements.name.value.trim();
    if (!query) { toast('請先輸入原料名稱，例如：雞胸肉、牛奶、麵粉。'); return; }
    const resultsBox = document.getElementById('onlineLookupResults');
    resultsBox.innerHTML = '<div class="lookup-empty">查詢中：正在比對內建 TFND/TFDA 離線資料庫、本機資料與公開線上來源...</div>';

    const localMatches = state.ingredients
      .filter((item) => item.name.toLowerCase().includes(query.toLowerCase()) || query.toLowerCase().includes(item.name.toLowerCase()))
      .slice(0, 3)
      .map((item) => ({ ...item, source: `${item.source}｜本機種子資料`, tags: `${item.tags || ''},本機比對` }));

    const requests = [
      searchTfdaOfflineNutrition(query),
      fetchJsonWithTimeout(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5&fields=product_name,generic_name,brands,nutriments,url`)
        .then((data) => (data.products || []).map(candidateFromOpenFoodFacts).filter(Boolean)),
      fetchJsonWithTimeout(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&query=${encodeURIComponent(query)}&pageSize=5`)
        .then((data) => (data.foods || []).map(candidateFromUsda).filter(Boolean))
    ];

    const settled = await Promise.allSettled(requests);
    const offlineResults = settled[0]?.status === 'fulfilled' ? settled[0].value : [];
    const onlineResults = settled.slice(1).flatMap((item) => item.status === 'fulfilled' ? item.value : []);
    onlineLookupCandidates = [...offlineResults, ...localMatches, ...onlineResults]
      .filter((item, index, arr) => arr.findIndex((x) => `${x.name}-${x.source}` === `${item.name}-${item.source}`) === index)
      .slice(0, 8);

    renderOnlineLookupResults(onlineLookupCandidates, settled.slice(1).filter((item) => item.status === 'rejected').length, offlineResults.length);
    if (onlineLookupCandidates.length) toast(`找到 ${onlineLookupCandidates.length} 筆可帶入的營養資料，其中 TFND/TFDA 離線資料 ${offlineResults.length} 筆。`);
  }

  function renderOnlineLookupResults(candidates, failedSourceCount = 0, offlineCount = 0) {
    const box = document.getElementById('onlineLookupResults');
    if (!box) return;
    if (!candidates.length) {
      box.innerHTML = '<div class="lookup-empty">離線資料庫與公開來源都沒有找到符合項目；請改用其他名稱、CSV 匯入或手動輸入。</div>';
      return;
    }
    const sourceLabel = offlineNutritionMeta?.sourceLabel ? `（${escapeHtml(offlineNutritionMeta.sourceLabel)}）` : '';
    const summary = `<div class="lookup-empty">已載入 TFND/TFDA 離線食品營養資料庫${sourceLabel} ${offlineNutritionMeta?.foodCount || offlineNutritionFoods.length || 0} 筆，本次命中 ${offlineCount} 筆；請選擇最接近的食品後按「帶入」。</div>`;
    box.innerHTML = summary + candidates.map((item, index) => `<div class="lookup-result">
      <div class="lookup-result-header"><div><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.source || '')}</small></div><button type="button" class="primary" data-action="applyNutritionCandidate" data-index="${index}">帶入</button></div>
      <div class="lookup-nutrients"><span>熱量 ${fmt(item.calories)} kcal</span><span>蛋白質 ${fmt(item.protein)}g</span><span>脂肪 ${fmt(item.fat)}g</span><span>碳水 ${fmt(item.carbohydrate)}g</span><span>糖 ${fmt(item.sugar)}g</span><span>鈉 ${fmt(item.sodium, 0)}mg</span></div>
      ${item.description ? `<small>${escapeHtml(item.description).slice(0, 120)}</small><br>` : ''}${item.url ? `<small><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">查看來源</a></small>` : ''}
    </div>`).join('') + (failedSourceCount ? '<div class="lookup-empty">提示：部分線上來源沒有回應；TFND/TFDA 離線資料庫仍可使用。</div>' : '');
  }

  function applyNutritionCandidate(index) {
    const item = onlineLookupCandidates[Number(index)];
    const form = document.getElementById('ingredientForm');
    if (!item || !form) return;
    ['name','source','calories','protein','fat','saturatedFat','transFat','carbohydrate','sugar','sodium','fiber','tags'].forEach((key) => {
      form.elements[key].value = item[key] ?? '';
    });
    toast('已帶入候選營養資料，請複核後按「儲存」。');
  }

  function saveIngredient() {
    const form = document.getElementById('ingredientForm');
    const data = Object.fromEntries(new FormData(form).entries());
    const record = { ...data, calories: parseNumber(data.calories), protein: parseNumber(data.protein), fat: parseNumber(data.fat), saturatedFat: parseNumber(data.saturatedFat), transFat: parseNumber(data.transFat), carbohydrate: parseNumber(data.carbohydrate), sugar: parseNumber(data.sugar), sodium: parseNumber(data.sodium), fiber: parseNumber(data.fiber), updatedAt: nowIso() };
    if (data.id) state.ingredients = state.ingredients.map((i) => i.id === data.id ? record : i); else state.ingredients.push({ ...record, id: uid('ing') });
    saveState(`原料資料已儲存：${record.name}`);
  }

  function openRecipeDialog(id) {
    const form = document.getElementById('recipeForm');
    const recipe = state.recipes.find((r) => r.id === id) || { id: '', name: '', labelType: 'A', packageWeight: 100, servingSize: 50, notes: '', items: [] };
    document.getElementById('recipeDialogTitle').textContent = id ? '編輯配方' : '新增配方';
    ['id','name','labelType','packageWeight','servingSize','notes'].forEach((k) => { form.elements[k].value = recipe[k] ?? ''; });
    renderRecipeItemRows(recipe.items.length ? recipe.items : [{ ingredientId: state.ingredients[0]?.id, weight: 100 }]);
    document.getElementById('recipeDialog').showModal();
  }

  function renderRecipeItemRows(items) {
    const options = state.ingredients.map((i) => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
    document.getElementById('recipeItems').innerHTML = items.map((item) => `<div class="recipe-line"><select class="recipe-ingredient">${options}</select><input class="recipe-weight" type="number" step="0.1" value="${item.weight || 0}" placeholder="重量g" /><button type="button" data-action="removeRecipeItem">移除</button></div>`).join('');
    [...document.querySelectorAll('.recipe-ingredient')].forEach((select, index) => { select.value = items[index].ingredientId || state.ingredients[0]?.id; });
  }

  function saveRecipe() {
    const form = document.getElementById('recipeForm');
    const data = Object.fromEntries(new FormData(form).entries());
    const rows = [...document.querySelectorAll('#recipeItems .recipe-line')];
    const recipe = { id: data.id || uid('rec'), name: data.name, labelType: data.labelType, packageWeight: parseNumber(data.packageWeight), servingSize: parseNumber(data.servingSize), notes: data.notes, items: rows.map((row) => ({ ingredientId: row.querySelector('.recipe-ingredient').value, weight: parseNumber(row.querySelector('.recipe-weight').value) })).filter((x) => x.ingredientId && x.weight > 0), updatedAt: nowIso() };
    state.recipes = data.id ? state.recipes.map((r) => r.id === data.id ? recipe : r) : [...state.recipes, recipe];
    state.selectedRecipeId = recipe.id;
    saveState(`配方已儲存：${recipe.name}`);
  }

  // ======== 法規同步：優先嘗試公開來源，失敗時保留內建資料與更新紀錄 ========
  async function syncRegulations() {
    toast('法規同步中，若來源阻擋 CORS 會保留內建摘要資料。');
    const sources = [
      ['TFDA', '食品藥物管理署法規資料', 'https://www.fda.gov.tw/tc/law.aspx?cid=62'],
      ['Foodlabel', 'Foodlabel 標示法規', 'https://www.foodlabel.org.tw/FdaFrontEndApp/Law/List?clPublishStatus=1'],
      ['MOJ', '全國法規資料庫', 'https://law.moj.gov.tw/']
    ];
    let added = 0;
    for (const [source, title, url] of sources) {
      try {
        const res = await fetch(url, { mode: 'cors' });
        const text = (await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1200);
        if (text.length < 80) throw new Error('內容過短');
        const entry = { id: uid('reg'), source, type: '線上同步', title, url, text, tags: `${source},線上同步`, fetchedAt: nowIso(), checksum: checksum(text), active: true };
        const old = state.regulations.find((r) => r.url === url && r.checksum === entry.checksum);
        if (!old) { state.regulations.unshift(entry); added += 1; }
      } catch (error) {
        state.activity.unshift({ at: nowIso(), message: `${source} 同步未完成：${error.message}；已保留離線資料。` });
      }
    }
    state.lastSyncAt = nowIso();
    saveState(`法規同步完成：新增 ${added} 筆版本資料。`);
    toast('法規同步完成');
  }

  // ======== 匯入匯出：提供 GitHub 專案交付後實務備份能力 ========
  function download(filename, content, mime = 'application/json') {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
  }

  function exportIngredients() {
    const header = ['name','source','calories','protein','fat','saturatedFat','transFat','carbohydrate','sugar','sodium','fiber','tags'];
    const csv = [header.join(','), ...state.ingredients.map((i) => header.map((k) => `"${String(i[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    download(`food_label_ingredients_${new Date().toISOString().slice(0,10)}.csv`, csv, 'text/csv');
  }

  async function importIngredients(file) {
    if (!file) return;
    const lines = (await file.text()).split(/\r?\n/).filter(Boolean);
    const header = lines.shift().split(',').map((x) => x.replace(/"/g, '').trim());
    lines.forEach((line) => {
      const cells = line.match(/("(?:""|[^"])*"|[^,]+)/g)?.map((x) => x.replace(/^"|"$/g, '').replace(/""/g, '"')) || [];
      const obj = Object.fromEntries(header.map((h, idx) => [h, cells[idx] || '']));
      state.ingredients.push({ ...obj, id: uid('ing'), calories: parseNumber(obj.calories), protein: parseNumber(obj.protein), fat: parseNumber(obj.fat), saturatedFat: parseNumber(obj.saturatedFat), transFat: parseNumber(obj.transFat), carbohydrate: parseNumber(obj.carbohydrate), sugar: parseNumber(obj.sugar), sodium: parseNumber(obj.sodium), fiber: parseNumber(obj.fiber), updatedAt: nowIso() });
    });
    saveState(`已匯入 ${lines.length} 筆原料 CSV。`);
  }

  // ======== 事件綁定：以 data-action 集中管理，降低維護成本 ========
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const id = target.dataset.id;
    const action = target.dataset.action;
    if (action === 'openIngredientDialog') openIngredientDialog();
    if (action === 'editIngredient') openIngredientDialog(id);
    if (action === 'deleteIngredient' && confirm('確定刪除此原料？')) { state.ingredients = state.ingredients.filter((i) => i.id !== id); saveState('已刪除原料資料。'); }
    if (action === 'lookupIngredientOnline') lookupIngredientOnline();
    if (action === 'applyNutritionCandidate') applyNutritionCandidate(target.dataset.index);
    if (action === 'createRecipe') openRecipeDialog();
    if (action === 'editRecipe') openRecipeDialog(id);
    if (action === 'deleteRecipe' && confirm('確定刪除此配方？')) { state.recipes = state.recipes.filter((r) => r.id !== id); state.selectedRecipeId = state.recipes[0]?.id || null; saveState('已刪除配方。'); }
    if (action === 'selectRecipe') { state.selectedRecipeId = id; saveState(); document.querySelector('[data-tab="label"]').click(); }
    if (action === 'addRecipeItem') {
      const currentItems = [...document.querySelectorAll('#recipeItems .recipe-line')].map((row) => ({
        ingredientId: row.querySelector('.recipe-ingredient').value,
        weight: row.querySelector('.recipe-weight').value
      }));
      renderRecipeItemRows([...currentItems, { ingredientId: state.ingredients[0]?.id, weight: 0 }]);
    }
    if (action === 'removeRecipeItem') target.closest('.recipe-line').remove();
    if (action === 'syncRegulations') syncRegulations();
    if (action === 'exportIngredients') exportIngredients();
    if (action === 'exportRegulations') download('food_label_regulations.json', JSON.stringify(state.regulations, null, 2));
    if (action === 'backupAll') download(`food_label_backup_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(state, null, 2));
    if (action === 'printLabel') window.print();
    if (action === 'resetDemoData' && confirm('確定重置？此動作會覆蓋目前本機資料。')) {
      resetAllStorage().then(async () => { state = await loadState(); renderAll(); });
    }
  });

  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab,.panel').forEach((el) => el.classList.remove('active'));
    tab.classList.add('active'); document.getElementById(tab.dataset.tab).classList.add('active');
  }));
  document.getElementById('ingredientSearch').addEventListener('input', renderIngredients);
  document.getElementById('regulationSearch').addEventListener('input', renderRegulations);
  document.getElementById('labelRecipeSelect').addEventListener('change', (e) => { state.selectedRecipeId = e.target.value; saveState(); });
  document.getElementById('ingredientForm').addEventListener('submit', saveIngredient);
  document.getElementById('recipeForm').addEventListener('submit', saveRecipe);
  document.getElementById('ingredientImport').addEventListener('change', (e) => importIngredients(e.target.files[0]));
  document.getElementById('restoreInput').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const restored = JSON.parse(await file.text());
    if (!restored.ingredients || !restored.recipes) throw new Error('備份格式不正確');
    state = restored; saveState('已還原備份資料。');
  });

  // PWA 安裝與 Service Worker：GitHub Pages 可直接安裝為桌面/手機 Web App。
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredPrompt = event; document.getElementById('installBtn').hidden = false; });
  document.getElementById('installBtn').addEventListener('click', async () => { if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; } });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

  // 啟動流程：開 IndexedDB → 讀 state → 首次渲染。IndexedDB 失敗自動退回 localStorage。
  (async () => {
    try {
      idbHandle = await openIdb();
      idbAvailable = true;
    } catch (_) {
      idbAvailable = false;
    }
    state = await loadState();
    renderAll();
  })();
})();
