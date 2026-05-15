/*
 * Food Label Pro 商用版核心程式 v3（2026-05-15）
 * 本檔以純瀏覽器技術實作：離線資料庫、配方營養計算、TFDA 九大項標示、法規檢索、匯入匯出與 PWA 安裝。
 *
 * 持久層 v2（沿用）：
 *   - 主：IndexedDB（DB foodLabelProDB，store appState，key STORAGE_KEY）
 *   - 備：localStorage（fallback / 舊資料來源）
 *   - 所有 CRUD 仍以同步方式更新 in-memory `state`，磁碟為 fire-and-forget。
 *
 * v3 新增（2026-05-15-2）：
 *   - state 加 companies[]、brands[]（離線儲存、可手打可選）。
 *   - recipe 擴充：productName / originCountry / companyId / brandId / 覆寫欄位 /
 *                  expiryMode / manufactureDate / shelfLifeMonths / expiryDate / storageCondition /
 *                  additives[] / allergens[] / gmoIngredients[] / warnings[]。
 *   - 列印模板改為 TFDA 九大項完整輸出，字體 ≥ 2mm。
 *   - 修正：dialog 取消按鈕在 required 欄位下無法關閉的 bug（closeDialog action）。
 *   - 嚴禁破壞：營養計算、IndexedDB、TFDA 離線查詢、CSV/JSON 匯入匯出、Android Java、法規同步。
 */
(() => {
  'use strict';

  // ======== 共用工具 ========
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

  // ======== TFDA 法規常數：11 類過敏原、17 類添加物功能、基改候選、添加物關鍵字 ========
  const ALLERGEN_CATALOG = [
    { id: 'crustacean', name: '甲殼類', keywords: ['蝦', '蟹', '龍蝦', '甲殼'] },
    { id: 'mango',      name: '芒果',   keywords: ['芒果'] },
    { id: 'peanut',     name: '花生',   keywords: ['花生'] },
    { id: 'milk',       name: '牛奶',   keywords: ['牛奶', '鮮奶', '奶粉', '奶油', '乳', '起司', '優格', '煉乳', '奶精'] },
    { id: 'egg',        name: '蛋',     keywords: ['蛋', '蛋黃', '蛋白'] },
    { id: 'nuts',       name: '堅果類', keywords: ['杏仁', '核桃', '腰果', '榛果', '夏威夷豆', '巴西堅果', '松子', '開心果', '胡桃'] },
    { id: 'sesame',     name: '芝麻',   keywords: ['芝麻', '胡麻'] },
    { id: 'gluten',     name: '含麩質穀物（小麥、大麥、燕麥、裸麥）', keywords: ['小麥', '大麥', '燕麥', '裸麥', '麵粉', '麩', '麥芽'] },
    { id: 'soy',        name: '大豆',   keywords: ['黃豆', '大豆', '豆漿', '豆腐', '醬油', '味噌', '豆粉'] },
    { id: 'fish',       name: '魚類',   keywords: ['魚', '鮭', '鱈', '鮪', '鯖'] },
    { id: 'mollusc',    name: '軟體動物（蛤、牡蠣、章魚、魷魚等）', keywords: ['蛤', '牡蠣', '章魚', '魷魚', '花枝', '蜆'] },
    { id: 'sulfite',    name: '亞硫酸鹽類（最終濃度 ≥ 10 ppm）', keywords: ['亞硫酸', '二氧化硫'] }
  ];

  const ADDITIVE_FUNCTIONS = [
    '防腐劑', '抗氧化劑', '漂白劑', '保色劑', '膨脹劑',
    '品質改良劑', '營養添加劑', '著色劑', '香料', '調味劑',
    '甜味劑', '黏稠劑', '結著劑', '食品工業用化學藥品', '載體',
    '乳化劑', '其他'
  ];

  // 從原料名稱粗略掃出可能的添加物（讓使用者勾選 + 選功能類別）
  const ADDITIVE_KEYWORDS = [
    { keyword: '泡打粉',   suggestedFunction: '膨脹劑' },
    { keyword: '小蘇打',   suggestedFunction: '膨脹劑' },
    { keyword: '香料',     suggestedFunction: '香料' },
    { keyword: '香精',     suggestedFunction: '香料' },
    { keyword: '色素',     suggestedFunction: '著色劑' },
    { keyword: '紅麴',     suggestedFunction: '著色劑' },
    { keyword: '味精',     suggestedFunction: '調味劑' },
    { keyword: '麩胺酸鈉', suggestedFunction: '調味劑' },
    { keyword: '阿斯巴甜', suggestedFunction: '甜味劑' },
    { keyword: '蔗糖素',   suggestedFunction: '甜味劑' },
    { keyword: '糖精',     suggestedFunction: '甜味劑' },
    { keyword: '乳化劑',   suggestedFunction: '乳化劑' },
    { keyword: '卵磷脂',   suggestedFunction: '乳化劑' },
    { keyword: '果膠',     suggestedFunction: '黏稠劑' },
    { keyword: '玉米糖膠', suggestedFunction: '黏稠劑' },
    { keyword: '己二烯酸', suggestedFunction: '防腐劑' },
    { keyword: '苯甲酸',   suggestedFunction: '防腐劑' },
    { keyword: '山梨酸',   suggestedFunction: '防腐劑' },
    { keyword: '亞硝酸',   suggestedFunction: '保色劑' },
    { keyword: '抗壞血酸', suggestedFunction: '抗氧化劑' },
    { keyword: '維生素 C', suggestedFunction: '抗氧化劑' }
  ];

  const GMO_CANDIDATES = ['黃豆', '大豆', '玉米', '棉籽', '油菜', '甜菜', '苜蓿', '木瓜'];

  // ======== IndexedDB 持久層（不動底層） ========
  let idbHandle = null;
  let idbAvailable = false;
  let persistQueue = Promise.resolve();

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
  function idbGet(key){return new Promise((res,rej)=>{const tx=idbHandle.transaction(IDB_STORE,'readonly');const r=tx.objectStore(IDB_STORE).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  function idbPut(key,value){return new Promise((res,rej)=>{const tx=idbHandle.transaction(IDB_STORE,'readwrite');const r=tx.objectStore(IDB_STORE).put(value,key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
  function idbDelete(key){return new Promise((res,rej)=>{const tx=idbHandle.transaction(IDB_STORE,'readwrite');const r=tx.objectStore(IDB_STORE).delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}

  async function persistStateAsync(snapshot) {
    const payload = JSON.stringify(snapshot);
    persistQueue = persistQueue.then(async () => {
      if (idbAvailable && idbHandle) {
        try { await idbPut(STORAGE_KEY, payload); return; } catch (_) {}
      }
      try { localStorage.setItem(STORAGE_KEY, payload); } catch (_) {}
    });
    return persistQueue;
  }

  // ======== 種子資料 ========
  const seedIngredients = [
    ['中筋麵粉','TFDA 精選種子',364,10.3,1.0,0.2,0,76.3,0.3,2,2.7,'烘焙,穀物'],
    ['高筋麵粉','TFDA 精選種子',361,12.5,1.2,0.2,0,73.6,0.4,2,2.5,'烘焙,麵包'],
    ['砂糖','TFDA 精選種子',387,0,0,0,0,100,100,1,0,'甜味'],
    ['無鹽奶油','USDA/TFDA 參考',717,0.9,81.1,51.4,3.3,0.1,0.1,11,0,'乳製品,油脂'],
    ['全蛋','TFDA 精選種子',143,12.6,9.5,3.1,0,0.7,0.4,142,0,'蛋品'],
    ['鮮奶','TFDA 精選種子',61,3.2,3.3,2.1,0,4.8,4.8,43,0,'乳製品'],
    ['植物油','TFDA 精選種子',884,0,100,14.2,0.5,0,0,0,0,'油脂'],
    ['可可粉','USDA/TFDA 參考',228,19.6,13.7,8.1,0,57.9,1.8,21,37,'烘焙,風味'],
    ['鹽','TFDA 精選種子',0,0,0,0,0,0,0,39300,0,'調味'],
    ['泡打粉','食品添加物參考',53,0,0,0,0,27.7,0,10600,0,'膨脹劑,添加物'],
    ['雞胸肉','TFDA 精選種子',165,31,3.6,1.0,0,0,0,74,0,'肉類'],
    ['白米飯','TFDA 精選種子',130,2.7,0.3,0.1,0,28.2,0.1,1,0.4,'穀物,主食'],
    ['黃豆','TFDA 精選種子',446,36.5,19.9,2.9,0,30.2,7.3,2,9.3,'豆類,植物蛋白'],
    ['橄欖油','USDA 參考',884,0,100,13.8,0,0,0,2,0,'油脂'],
    ['蜂蜜','TFDA 精選種子',304,0.3,0,0,0,82.4,82.1,4,0.2,'甜味']
  ].map(([name,source,calories,protein,fat,saturatedFat,transFat,carbohydrate,sugar,sodium,fiber,tags])=>({id:uid('ing'),name,source,calories,protein,fat,saturatedFat,transFat,carbohydrate,sugar,sodium,fiber,tags,updatedAt:nowIso()}));

  const seedRegulations = [
    {source:'TFDA',type:'營養標示',title:'包裝食品營養標示應遵行事項',url:'https://www.fda.gov.tw/tc/law.aspx?cid=62',text:'包裝食品營養標示應揭露熱量、蛋白質、脂肪、飽和脂肪、反式脂肪、碳水化合物、糖及鈉等資訊，並依每一份量及每100公克或毫升標示。',tags:'TFDA,營養標示,格式A,格式B'},
    {source:'TFDA',type:'食品標示',title:'食品安全衛生管理法標示重點',url:'https://www.fda.gov.tw/',text:'食品應以中文及通用符號明顯標示品名、內容物、食品添加物、有效日期、營養標示、製造廠商及原產地等資訊。',tags:'食安法,標示,中文'},
    {source:'Foodlabel',type:'標示問答',title:'營養標示格式 A 與格式 B 使用情境',url:'https://www.foodlabel.org.tw/',text:'格式A通常呈現每份及每100公克數值；格式B可搭配每日參考值百分比，供消費者比較攝取量。',tags:'Foodlabel,格式A,格式B'},
    {source:'MOHW',type:'食品添加物',title:'食品添加物使用範圍及限量暨規格標準',url:'https://law.moj.gov.tw/',text:'食品添加物應符合使用範圍、限量及規格標準，並於產品標示中依規定揭露用途名稱或品名。',tags:'添加物,限量,規格'},
    {source:'SGS',type:'產業公告',title:'食品標示稽核常見缺失',url:'https://www.sgs.com.tw/',text:'常見缺失包含份量基準不一致、鈉單位錯誤、反式脂肪未依規定四捨五入、過敏原資訊不足。',tags:'稽核,缺失,SGS'}
  ].map((r)=>({...r,id:uid('reg'),fetchedAt:nowIso(),checksum:checksum(`${r.title}${r.text}`),active:true}));

  const seedRecipes = () => {
    const flour = state.ingredients.find((i)=>i.name==='中筋麵粉')?.id;
    const sugar = state.ingredients.find((i)=>i.name==='砂糖')?.id;
    const butter = state.ingredients.find((i)=>i.name==='無鹽奶油')?.id;
    const egg = state.ingredients.find((i)=>i.name==='全蛋')?.id;
    return [{
      id:uid('rec'),name:'示範奶油餅乾',productName:'',companyId:'',brandId:'',
      companyNameOverride:'',companyPhoneOverride:'',companyAddressOverride:'',companyTaxIdOverride:'',
      originCountry:'台灣',
      packageWeight:320,servingSize:40,labelType:'A',
      expiryMode:'manufactureDate',manufactureDate:'',shelfLifeMonths:12,expiryDate:'',
      storageCondition:'請存放於陰涼乾燥處，避免陽光直射。開封後請盡速食用。',
      notes:'內建示範配方，可直接編輯或刪除。',
      items:[{ingredientId:flour,weight:180},{ingredientId:sugar,weight:70},{ingredientId:butter,weight:60},{ingredientId:egg,weight:50}].filter((x)=>x.ingredientId),
      additives:[],allergens:[],gmoIngredients:[],warnings:'',
      updatedAt:nowIso()
    }];
  };

  let state;
  let onlineLookupCandidates = [];
  let offlineNutritionFoods = [];
  let offlineNutritionMeta = null;
  let offlineNutritionLoadPromise = null;

  function checksum(text){let hash=0;for(let i=0;i<text.length;i+=1)hash=((hash<<5)-hash+text.charCodeAt(i))|0;return Math.abs(hash).toString(16);}

  // 把舊版 state 補上 v3 新欄位，避免讀到舊資料炸掉
  function migrateState(s){
    s.companies = Array.isArray(s.companies) ? s.companies : [];
    s.brands = Array.isArray(s.brands) ? s.brands : [];
    s.recipes = (s.recipes || []).map((r) => ({
      productName:'',companyId:'',brandId:'',
      companyNameOverride:'',companyPhoneOverride:'',companyAddressOverride:'',companyTaxIdOverride:'',
      originCountry:'',
      expiryMode:'manufactureDate',manufactureDate:'',shelfLifeMonths:12,expiryDate:'',
      storageCondition:'',
      additives:[],allergens:[],gmoIngredients:[],warnings:'',
      ...r
    }));
    return s;
  }

  async function loadState(){
    let saved=null;
    let migratedFromLocal=false;
    if(idbAvailable && idbHandle){
      try{const raw=await idbGet(STORAGE_KEY); if(raw)saved=JSON.parse(raw);}catch(_){}
    }
    if(!saved){
      try{const legacy=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'); if(legacy?.ingredients?.length){saved=legacy;migratedFromLocal=idbAvailable;}}catch(_){}
    }
    if(saved?.ingredients?.length){
      saved=migrateState(saved);
      if(migratedFromLocal){
        saved.activity=saved.activity||[];
        saved.activity.unshift({at:nowIso(),message:'系統升級：資料已自動遷移至 IndexedDB，原 localStorage 備份保留。'});
        try{await idbPut(STORAGE_KEY,JSON.stringify(saved));}catch(_){}
      }
      return saved;
    }
    const base={ingredients:seedIngredients,recipes:[],regulations:seedRegulations,activity:[],lastSyncAt:null,selectedRecipeId:null,companies:[],brands:[]};
    state=base;
    base.recipes=seedRecipes();
    base.selectedRecipeId=base.recipes[0]?.id||null;
    base.activity.unshift({at:nowIso(),message:'系統初始化：已建立離線種子資料與示範配方。'});
    await persistStateAsync(base);
    return base;
  }

  function saveState(message){
    if(message)state.activity.unshift({at:nowIso(),message});
    state.activity=state.activity.slice(0,30);
    void persistStateAsync(state);
    renderAll();
  }

  async function resetAllStorage(){
    if(idbAvailable && idbHandle){try{await idbDelete(STORAGE_KEY);}catch(_){}}
    try{localStorage.removeItem(STORAGE_KEY);}catch(_){}
  }

  function toast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600);}

  // ======== 營養計算（不動） ========
  function calculateRecipe(recipe){
    const totals={calories:0,protein:0,fat:0,saturatedFat:0,transFat:0,carbohydrate:0,sugar:0,sodium:0,fiber:0};
    const totalInputWeight=recipe.items.reduce((sum,item)=>sum+parseNumber(item.weight),0)||1;
    recipe.items.forEach((item)=>{
      const ingredient=state.ingredients.find((i)=>i.id===item.ingredientId);
      if(!ingredient)return;
      Object.keys(totals).forEach((key)=>{totals[key]+=parseNumber(ingredient[key])*parseNumber(item.weight)/100;});
    });
    const finalWeight=parseNumber(recipe.packageWeight)||totalInputWeight;
    const servingSize=parseNumber(recipe.servingSize)||finalWeight;
    const servingCount=Math.max(1,finalWeight/servingSize);
    const factor100=100/finalWeight;
    const factorServing=servingSize/finalWeight;
    const per100=Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,v*factor100]));
    const perServing=Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,v*factorServing]));
    return {totals,per100,perServing,totalInputWeight,finalWeight,servingSize,servingCount};
  }
  function dailyPercent(key,value){
    const ref={calories:2000,protein:60,fat:60,saturatedFat:18,carbohydrate:300,sodium:2000,fiber:25,sugar:50};
    return ref[key]?`${Math.round((value/ref[key])*100)}%`:'—';
  }

  /* ===== SPLIT MARKER A→B ===== */
  
  // ======== 列印批次資訊 printSession（v3.1 新增） ========
  // 此區資料只作為「本次列印」用，不會寫回配方
  // 使用 sessionStorage 持久化（分頁關閉後清空，重新整理保留）
  const PRINT_SESSION_KEY = 'foodLabelPro.printSession.v1';
  let printSession = { recipeId:'', expiryMode:'', manufactureDate:'', shelfLifeMonths:'', expiryDate:'', batchNo:'', storageOverride:'' };

  function loadPrintSession(){
    try{
      const raw = sessionStorage.getItem(PRINT_SESSION_KEY);
      if(raw){
        const parsed = JSON.parse(raw);
        printSession = { recipeId:'', expiryMode:'', manufactureDate:'', shelfLifeMonths:'', expiryDate:'', batchNo:'', storageOverride:'', ...parsed };
      }
    }catch(_){}
  }
  function savePrintSession(){
    try{ sessionStorage.setItem(PRINT_SESSION_KEY, JSON.stringify(printSession)); }catch(_){}
  }
  function clearPrintSession(){
    printSession = { recipeId:'', expiryMode:'', manufactureDate:'', shelfLifeMonths:'', expiryDate:'', batchNo:'', storageOverride:'' };
    try{ sessionStorage.removeItem(PRINT_SESSION_KEY); }catch(_){}
    renderPrintSessionPanel();
    renderLabel();
    toast('已清除本批次列印資訊');
  }

  // 合併 printSession 與配方原本的有效日期設定
  // 優先順序：printSession 有填 → 用之；否則 fallback 到 recipe 預設
  function computeExpiryDisplayMerged(recipe){
    const mode = printSession.expiryMode || recipe.expiryMode || 'manufactureDate';
    if(mode === 'date'){
      const d = printSession.expiryDate || recipe.expiryDate || '';
      return { manufactureDate:'', expiryDate:d };
    }
    const md = printSession.manufactureDate || recipe.manufactureDate || '';
    const months = parseNumber(printSession.shelfLifeMonths) || parseNumber(recipe.shelfLifeMonths);
    if(md && months>0){
      const mdDate = new Date(md);
      if(!isNaN(mdDate)){
        const exp = new Date(mdDate);
        exp.setMonth(exp.getMonth()+months);
        return { manufactureDate:md, expiryDate:exp.toISOString().slice(0,10) };
      }
    }
    return { manufactureDate:md, expiryDate:'' };
  }

  function renderPrintSessionPanel(){
    const modeSel = document.getElementById('psExpiryMode');
    if(!modeSel) return;
    const recipe = state.recipes.find((r)=>r.id===state.selectedRecipeId)||state.recipes[0];
    // 切換到新配方時，若 session 沒帶 recipeId，把配方預設帶進來
    if(recipe && printSession.recipeId !== recipe.id){
      printSession.recipeId = recipe.id;
      printSession.expiryMode = printSession.expiryMode || recipe.expiryMode || 'manufactureDate';
      // 製造日、保存月數、固定有效日：若 session 沒填則維持空，讓使用者每批次自填
      savePrintSession();
    }
    modeSel.value = printSession.expiryMode || (recipe?.expiryMode) || 'manufactureDate';
    document.getElementById('psManufactureDate').value = printSession.manufactureDate || '';
    document.getElementById('psShelfLifeMonths').value = printSession.shelfLifeMonths || '';
    document.getElementById('psExpiryDate').value = printSession.expiryDate || '';
    document.getElementById('psBatchNo').value = printSession.batchNo || '';
    document.getElementById('psStorageOverride').value = printSession.storageOverride || '';
    document.querySelectorAll('[data-ps-field]').forEach((el)=>{
      el.hidden = (el.dataset.psField !== modeSel.value);
    });
  }

  function bindPrintSessionInputs(){
    const map = {
      psExpiryMode:'expiryMode', psManufactureDate:'manufactureDate', psShelfLifeMonths:'shelfLifeMonths',
      psExpiryDate:'expiryDate', psBatchNo:'batchNo', psStorageOverride:'storageOverride'
    };
    Object.entries(map).forEach(([id,key])=>{
      const el = document.getElementById(id);
      if(!el || el.dataset.psBound) return;
      el.dataset.psBound = '1';
      el.addEventListener('input', ()=>{
        printSession[key] = el.value;
        savePrintSession();
        if(id==='psExpiryMode'){
          document.querySelectorAll('[data-ps-field]').forEach((x)=>{ x.hidden = (x.dataset.psField !== el.value); });
        }
        renderLabel();
      });
    });
  }

  // ======== TFDA 離線資料庫瀏覽分頁（v3.1 新增） ========
  const NUTRITION_PAGE_SIZE = 50;
  let nutritionBrowserState = { page:1, search:'', category:'', sort:'name', filtered:[] };
  let nutritionBrowserTargetForm = null; // 開啟瀏覽時若帶有目標表單，「採用」會填回該表單

  function getNutritionCategoryOf(food){
    // 不同版本 compact JSON 欄位名可能略有差異，依序嘗試
    return food.category || food.cat || food.foodGroup || food.group || food.classification || '';
  }
  function getNutritionNumber(food, keys){
    for(const k of keys){
      const v = food[k];
      if(v !== undefined && v !== null && v !== ''){
        const n = Number(v);
        if(Number.isFinite(n)) return n;
      }
    }
    return 0;
  }
  function pickNutritionFields(food){
    return {
      name: food.name || food.foodName || food.sample || '',
      nameEn: food.nameEn || food.englishName || '',
      category: getNutritionCategoryOf(food),
      calories:    getNutritionNumber(food, ['calories','energy','kcal','熱量']),
      protein:     getNutritionNumber(food, ['protein','蛋白質']),
      fat:         getNutritionNumber(food, ['fat','脂肪']),
      saturatedFat:getNutritionNumber(food, ['saturatedFat','satFat','飽和脂肪']),
      transFat:    getNutritionNumber(food, ['transFat','反式脂肪']),
      carbohydrate:getNutritionNumber(food, ['carbohydrate','carbs','碳水化合物']),
      sugar:       getNutritionNumber(food, ['sugar','糖']),
      sodium:      getNutritionNumber(food, ['sodium','鈉']),
      fiber:       getNutritionNumber(food, ['fiber','dietaryFiber','膳食纖維'])
    };
  }

  async function ensureNutritionDbLoaded(){
    // 沿用既有的 offlineNutritionFoods，如尚未載入則嘗試載入
    if(offlineNutritionFoods && offlineNutritionFoods.length) return offlineNutritionFoods;
    if(typeof loadOfflineNutritionDatabase === 'function'){
      try{ await loadOfflineNutritionDatabase(); return offlineNutritionFoods || []; }catch(_){}
    }
    // fallback：直接 fetch
    try{
      const r = await fetch(TFDA_NUTRITION_DB_URL);
      if(!r.ok) throw new Error('HTTP '+r.status);
      const data = await r.json();
      if(Array.isArray(data)) offlineNutritionFoods = data;
      else if(Array.isArray(data.foods)) { offlineNutritionFoods = data.foods; offlineNutritionMeta = data.meta||null; }
    }catch(e){ console.warn('TFDA 離線資料庫載入失敗', e); }
    return offlineNutritionFoods || [];
  }

  function renderNutritionCategoryOptions(){
    const sel = document.getElementById('nutritionCategoryFilter');
    if(!sel) return;
    const cats = [...new Set(offlineNutritionFoods.map(getNutritionCategoryOf).filter(Boolean))].sort();
    const current = nutritionBrowserState.category;
    sel.innerHTML = '<option value="">全部分類</option>' + cats.map((c)=>`<option value="${escapeHtml(c)}" ${c===current?'selected':''}>${escapeHtml(c)}</option>`).join('');
  }

  function filterAndSortNutrition(){
    const q = (nutritionBrowserState.search||'').trim().toLowerCase();
    const cat = nutritionBrowserState.category;
    let list = offlineNutritionFoods.filter((f)=>{
      const p = pickNutritionFields(f);
      if(cat && p.category !== cat) return false;
      if(!q) return true;
      return (`${p.name} ${p.nameEn} ${p.category}`).toLowerCase().includes(q);
    });
    const sortKey = nutritionBrowserState.sort;
    if(sortKey === 'name'){
      list.sort((a,b)=> (pickNutritionFields(a).name||'').localeCompare(pickNutritionFields(b).name||'','zh-Hant'));
    } else {
      list.sort((a,b)=> pickNutritionFields(b)[sortKey] - pickNutritionFields(a)[sortKey]);
    }
    nutritionBrowserState.filtered = list;
  }

  async function renderNutritionBrowser(){
    const tbody = document.getElementById('nutritionTable');
    const meta = document.getElementById('nutritionMeta');
    const pagerInfo = document.getElementById('nutritionPagerInfo');
    if(!tbody) return;
    if(!offlineNutritionFoods || !offlineNutritionFoods.length){
      meta && (meta.textContent='載入中…');
      await ensureNutritionDbLoaded();
      renderNutritionCategoryOptions();
    }
    if(!offlineNutritionFoods.length){
      tbody.innerHTML = '<tr><td colspan="8">尚未載入 TFDA 離線資料庫，或檔案不存在。</td></tr>';
      meta && (meta.textContent='0 筆');
      pagerInfo && (pagerInfo.textContent='—');
      return;
    }
    meta && (meta.textContent = `共 ${offlineNutritionFoods.length} 筆`);
    filterAndSortNutrition();
    const total = nutritionBrowserState.filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / NUTRITION_PAGE_SIZE));
    if(nutritionBrowserState.page > totalPages) nutritionBrowserState.page = totalPages;
    if(nutritionBrowserState.page < 1) nutritionBrowserState.page = 1;
    const start = (nutritionBrowserState.page-1) * NUTRITION_PAGE_SIZE;
    const slice = nutritionBrowserState.filtered.slice(start, start+NUTRITION_PAGE_SIZE);
    tbody.innerHTML = slice.map((f, idx)=>{
      const p = pickNutritionFields(f);
      const realIdx = start + idx;
      return `<tr>
        <td><strong>${escapeHtml(p.name)}</strong>${p.nameEn?`<br><small>${escapeHtml(p.nameEn)}</small>`:''}</td>
        <td>${escapeHtml(p.category||'—')}</td>
        <td>${fmt(p.calories,0)}</td>
        <td>${fmt(p.protein)}</td>
        <td>${fmt(p.fat)}</td>
        <td>${fmt(p.carbohydrate)}</td>
        <td>${fmt(p.sodium,0)}</td>
        <td class="nutri-actions">
          <button data-action="adoptNutritionAsNewIngredient" data-idx="${realIdx}">採用為新原料</button>
          ${nutritionBrowserTargetForm?`<button class="primary" data-action="adoptNutritionToTargetForm" data-idx="${realIdx}">填回原料表單</button>`:''}
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="8">查無資料。</td></tr>';
    pagerInfo && (pagerInfo.textContent = `第 ${nutritionBrowserState.page} / ${totalPages} 頁，本頁 ${slice.length} 筆 / 共 ${total} 筆`);
  }

  function adoptNutritionAsNewIngredient(realIdx){
    const food = nutritionBrowserState.filtered[realIdx];
    if(!food){ toast('找不到該筆食品'); return; }
    const p = pickNutritionFields(food);
    const dialog = document.getElementById('ingredientDialog');
    const form = document.getElementById('ingredientForm');
    if(!dialog || !form){ toast('原料對話框不存在'); return; }
    form.reset();
    form.elements.id.value = '';
    form.elements.name.value = p.name;
    form.elements.source.value = 'TFND/TFDA 離線資料庫';
    form.elements.calories.value = p.calories || 0;
    form.elements.protein.value = p.protein || 0;
    form.elements.fat.value = p.fat || 0;
    if(form.elements.saturatedFat) form.elements.saturatedFat.value = p.saturatedFat || 0;
    if(form.elements.transFat) form.elements.transFat.value = p.transFat || 0;
    form.elements.carbohydrate.value = p.carbohydrate || 0;
    if(form.elements.sugar) form.elements.sugar.value = p.sugar || 0;
    form.elements.sodium.value = p.sodium || 0;
    if(form.elements.fiber) form.elements.fiber.value = p.fiber || 0;
    if(form.elements.tags) form.elements.tags.value = p.category ? `TFND,${p.category}` : 'TFND';
    document.getElementById('ingredientDialogTitle').textContent = '新增原料（自 TFDA 資料庫）';
    if(!dialog.open) dialog.showModal();
    toast(`已預填：${p.name}`);
  }

  function adoptNutritionToTargetForm(realIdx){
    const food = nutritionBrowserState.filtered[realIdx];
    if(!food){ toast('找不到該筆食品'); return; }
    const p = pickNutritionFields(food);
    const form = nutritionBrowserTargetForm;
    if(!form){ adoptNutritionAsNewIngredient(realIdx); return; }
    if(!form.elements.name.value) form.elements.name.value = p.name;
    form.elements.source.value = 'TFND/TFDA 離線資料庫';
    form.elements.calories.value = p.calories || 0;
    form.elements.protein.value = p.protein || 0;
    form.elements.fat.value = p.fat || 0;
    if(form.elements.saturatedFat) form.elements.saturatedFat.value = p.saturatedFat || 0;
    if(form.elements.transFat) form.elements.transFat.value = p.transFat || 0;
    form.elements.carbohydrate.value = p.carbohydrate || 0;
    if(form.elements.sugar) form.elements.sugar.value = p.sugar || 0;
    form.elements.sodium.value = p.sodium || 0;
    if(form.elements.fiber) form.elements.fiber.value = p.fiber || 0;
    // 切回原料對話框
    const dialog = document.getElementById('ingredientDialog');
    if(dialog && !dialog.open) dialog.showModal();
    // 切回原料庫分頁（雖然 dialog 是 modal，但保險）
    toast(`已填回：${p.name}`);
    nutritionBrowserTargetForm = null;
  }

  function browseNutritionFromDialog(){
    const dialog = document.getElementById('ingredientDialog');
    const form = document.getElementById('ingredientForm');
    if(dialog && dialog.open){
      nutritionBrowserTargetForm = form;
      // 預帶名稱當搜尋
      const name = (form.elements.name.value||'').trim();
      if(name) nutritionBrowserState.search = name;
    }
    // 切到 TFDA 資料庫分頁
    document.querySelectorAll('.tab').forEach((t)=>t.classList.toggle('active', t.dataset.tab==='nutrition'));
    document.querySelectorAll('.panel').forEach((p)=>p.classList.toggle('active', p.id==='nutrition'));
    const sb = document.getElementById('nutritionSearch');
    if(sb) sb.value = nutritionBrowserState.search;
    renderNutritionBrowser();
  }

  function bindNutritionBrowserInputs(){
    const sb = document.getElementById('nutritionSearch');
    const cat = document.getElementById('nutritionCategoryFilter');
    const sort = document.getElementById('nutritionSort');
    if(sb && !sb.dataset.nbBound){ sb.dataset.nbBound='1'; sb.addEventListener('input', ()=>{ nutritionBrowserState.search=sb.value; nutritionBrowserState.page=1; renderNutritionBrowser(); }); }
    if(cat && !cat.dataset.nbBound){ cat.dataset.nbBound='1'; cat.addEventListener('change', ()=>{ nutritionBrowserState.category=cat.value; nutritionBrowserState.page=1; renderNutritionBrowser(); }); }
    if(sort && !sort.dataset.nbBound){ sort.dataset.nbBound='1'; sort.addEventListener('change', ()=>{ nutritionBrowserState.sort=sort.value; renderNutritionBrowser(); }); }
  }

  // 暴露給全域事件分派使用（既有的 click 分派器會呼叫這些函數名）
  window.__flpExtras = {
    renderPrintSessionPanel, bindPrintSessionInputs, clearPrintSession,
    applyPrintSessionAndPrint(){
      // 套用 = 已經在 input 時即時寫入；這裡只要重繪 + 列印
      renderLabel();
      setTimeout(()=>window.print(), 80);
    },
    renderNutritionBrowser, bindNutritionBrowserInputs, browseNutritionFromDialog,
    adoptNutritionAsNewIngredient, adoptNutritionToTargetForm,
    nutritionNextPage(){ nutritionBrowserState.page+=1; renderNutritionBrowser(); },
    nutritionPrevPage(){ nutritionBrowserState.page=Math.max(1, nutritionBrowserState.page-1); renderNutritionBrowser(); },
    reloadNutritionDb: async ()=>{ offlineNutritionFoods=[]; await ensureNutritionDbLoaded(); renderNutritionCategoryOptions(); renderNutritionBrowser(); toast('已重新載入 TFDA 離線資料庫'); },
    loadPrintSession
  };

  // 啟動：載入 sessionStorage、綁定批次資訊輸入、綁定資料庫瀏覽輸入
  loadPrintSession();
  document.addEventListener('DOMContentLoaded', ()=>{
    bindPrintSessionInputs();
    bindNutritionBrowserInputs();
    renderPrintSessionPanel();
  });
  // 若 DOMContentLoaded 已過（既有 IIFE 在 body 尾部執行），直接呼叫
  if(document.readyState !== 'loading'){
    setTimeout(()=>{ bindPrintSessionInputs(); bindNutritionBrowserInputs(); renderPrintSessionPanel(); }, 0);
  }

  // 監聽分頁切換：切到 nutrition 時自動載入；切到 label 時刷新批次面板
  document.addEventListener('click', (e)=>{
    const t = e.target.closest && e.target.closest('.tab');
    if(!t) return;
    const tab = t.dataset.tab;
    if(tab === 'nutrition'){ setTimeout(renderNutritionBrowser, 0); }
    if(tab === 'label'){ setTimeout(()=>{ bindPrintSessionInputs(); renderPrintSessionPanel(); }, 0); }
  }, true);

  // 攔截 data-action click，分派到 __flpExtras 對應的方法（不影響既有分派）
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest && e.target.closest('[data-action]');
    if(!btn) return;
    const action = btn.dataset.action;
    const idx = btn.dataset.idx ? parseInt(btn.dataset.idx,10) : null;
    const ex = window.__flpExtras;
    switch(action){
      case 'clearPrintSession': ex.clearPrintSession(); break;
      case 'applyPrintSessionAndPrint': ex.applyPrintSessionAndPrint(); break;
      case 'browseNutritionFromDialog': ex.browseNutritionFromDialog(); break;
      case 'adoptNutritionAsNewIngredient': if(idx!=null) ex.adoptNutritionAsNewIngredient(idx); break;
      case 'adoptNutritionToTargetForm': if(idx!=null) ex.adoptNutritionToTargetForm(idx); break;
      case 'nutritionNextPage': ex.nutritionNextPage(); break;
      case 'nutritionPrevPage': ex.nutritionPrevPage(); break;
      case 'reloadNutritionDb': ex.reloadNutritionDb(); break;
    }
  });


  // ======== 公司／品牌資料：可手打也可選 ========
  function getDefaultCompany(){return state.companies.find((c)=>c.isDefault)||state.companies[0]||null;}
  function getDefaultBrand(companyId){
    const brands = companyId ? state.brands.filter((b)=>!b.companyId||b.companyId===companyId) : state.brands;
    return brands.find((b)=>b.isDefault)||brands[0]||null;
  }
  function resolveRecipeCompany(recipe){
    // 覆寫優先；其次抓 companyId；再來抓預設；都沒有則回空字串
    const base = state.companies.find((c)=>c.id===recipe.companyId) || getDefaultCompany() || {};
    return {
      name:    recipe.companyNameOverride    || base.name    || '',
      phone:   recipe.companyPhoneOverride   || base.phone   || '',
      address: recipe.companyAddressOverride || base.address || '',
      taxId:   recipe.companyTaxIdOverride   || base.taxId   || '',
      country: recipe.originCountry || base.country || ''
    };
  }
  function resolveRecipeBrand(recipe){
    return state.brands.find((b)=>b.id===recipe.brandId) || null;
  }

  // ======== 標示內容生成：內容物、添加物、過敏原、有效日期等 ========
  function buildIngredientList(recipe){
    // 依投入重量由高到低排序、合併同名
    const merged = new Map();
    recipe.items.forEach((item)=>{
      const ing = state.ingredients.find((i)=>i.id===item.ingredientId);
      if(!ing) return;
      const w = parseNumber(item.weight);
      merged.set(ing.name,(merged.get(ing.name)||0)+w);
    });
    return [...merged.entries()].sort((a,b)=>b[1]-a[1]).map(([name])=>name);
  }
  function detectAllergenSuggestions(recipe){
    // 從原料名稱與標籤掃出可能過敏原（僅建議，使用者勾選才會列入）
    const haystack = recipe.items.map((it)=>{
      const ing = state.ingredients.find((i)=>i.id===it.ingredientId);
      return ing ? `${ing.name} ${ing.tags||''}` : '';
    }).join(' ');
    return ALLERGEN_CATALOG.filter((a)=>a.keywords.some((kw)=>haystack.includes(kw))).map((a)=>a.id);
  }
  function detectAdditiveSuggestions(recipe){
    const suggestions = [];
    recipe.items.forEach((it)=>{
      const ing = state.ingredients.find((i)=>i.id===it.ingredientId);
      if(!ing) return;
      const hay = `${ing.name} ${ing.tags||''}`;
      ADDITIVE_KEYWORDS.forEach((k)=>{
        if(hay.includes(k.keyword) && !suggestions.find((s)=>s.name===k.keyword)){
          suggestions.push({ name:k.keyword, suggestedFunction:k.suggestedFunction });
        }
      });
    });
    return suggestions;
  }
  function detectGmoSuggestions(recipe){
    const hits=[];
    recipe.items.forEach((it)=>{
      const ing=state.ingredients.find((i)=>i.id===it.ingredientId);
      if(!ing)return;
      GMO_CANDIDATES.forEach((kw)=>{ if(ing.name.includes(kw) && !hits.includes(kw)) hits.push(kw); });
    });
    return hits;
  }
  function computeExpiryDisplay(recipe){
    if(recipe.expiryMode==='date' && recipe.expiryDate){
      return { manufactureDate:'', expiryDate:recipe.expiryDate };
    }
    if(recipe.manufactureDate && parseNumber(recipe.shelfLifeMonths)>0){
      const md=new Date(recipe.manufactureDate);
      if(!isNaN(md)){
        const exp=new Date(md);
        exp.setMonth(exp.getMonth()+parseNumber(recipe.shelfLifeMonths));
        return { manufactureDate:recipe.manufactureDate, expiryDate:exp.toISOString().slice(0,10) };
      }
    }
    return { manufactureDate:recipe.manufactureDate||'', expiryDate:'' };
  }

  // ======== 畫面渲染 ========
  function renderAll(){
    renderDashboard();
    renderIngredients();
    renderRecipes();
    renderRecipeSelect();
    renderRegulations();
    renderCompanies();
    renderBrands();
  }
  function renderDashboard(){
    document.getElementById('ingredientCount').textContent=state.ingredients.length;
    document.getElementById('recipeCount').textContent=state.recipes.length;
    document.getElementById('regulationCount').textContent=state.regulations.length;
    document.getElementById('lastSyncAt').textContent=state.lastSyncAt?new Date(state.lastSyncAt).toLocaleString('zh-TW'):'尚未同步';
    document.getElementById('activityLog').innerHTML=state.activity.map((e)=>`<div class="log-entry"><strong>${new Date(e.at).toLocaleString('zh-TW')}</strong><br>${escapeHtml(e.message)}</div>`).join('')||'<p>尚無紀錄</p>';
  }
  function renderIngredients(){
    const q=document.getElementById('ingredientSearch').value.trim().toLowerCase();
    const rows=state.ingredients.filter((i)=>`${i.name} ${i.source} ${i.tags}`.toLowerCase().includes(q));
    document.getElementById('ingredientTable').innerHTML=rows.map((i)=>`
      <tr><td><strong>${escapeHtml(i.name)}</strong><br><small>${escapeHtml(i.source||'')}</small><br><span class="badge">${escapeHtml(i.tags||'自建')}</span></td>
      <td>${fmt(i.calories)} kcal</td><td>${fmt(i.protein)} g</td><td>${fmt(i.fat)} g</td><td>${fmt(i.carbohydrate)} g</td><td>${fmt(i.sodium)} mg</td>
      <td><button data-action="editIngredient" data-id="${i.id}">編輯</button> <button class="danger" data-action="deleteIngredient" data-id="${i.id}">刪除</button></td></tr>`).join('');
  }
  function renderRecipes(){
    document.getElementById('recipeCards').innerHTML=state.recipes.map((r)=>{
      const calc=calculateRecipe(r);
      return `<article class="card"><h3>${escapeHtml(r.productName||r.name)}</h3><p>${escapeHtml(r.notes||'無備註')}</p>
        <p><span class="badge">格式 ${r.labelType}</span><span class="badge">每份 ${fmt(calc.servingSize)}g</span><span class="badge">約 ${fmt(calc.servingCount)} 份</span></p>
        <p>每份熱量 <strong>${fmt(calc.perServing.calories,0)} kcal</strong>，蛋白質 ${fmt(calc.perServing.protein)}g，脂肪 ${fmt(calc.perServing.fat)}g。</p>
        <button data-action="selectRecipe" data-id="${r.id}">產生標示</button> <button data-action="editRecipe" data-id="${r.id}">編輯</button> <button class="danger" data-action="deleteRecipe" data-id="${r.id}">刪除</button>
      </article>`;
    }).join('')||'<article class="card"><p>尚無配方，請新增第一筆配方。</p></article>';
  }
  function renderRecipeSelect(){
    const select=document.getElementById('labelRecipeSelect');
    select.innerHTML=state.recipes.map((r)=>`<option value="${r.id}" ${r.id===state.selectedRecipeId?'selected':''}>${escapeHtml(r.productName||r.name)}</option>`).join('');
    renderLabel();
  }
  function renderRegulations(){
    const q=document.getElementById('regulationSearch').value.trim().toLowerCase();
    const list=state.regulations.filter((r)=>`${r.source} ${r.type} ${r.title} ${r.text} ${r.tags}`.toLowerCase().includes(q));
    document.getElementById('regulationList').innerHTML=list.map((r)=>`<article class="regulation-item"><p><span class="badge">${escapeHtml(r.source)}</span><span class="badge">${escapeHtml(r.type)}</span><span class="badge">${escapeHtml(r.tags)}</span></p><h3>${escapeHtml(r.title)}</h3><p>${escapeHtml(r.text)}</p><p><small>抓取：${new Date(r.fetchedAt).toLocaleString('zh-TW')}｜Checksum：${r.checksum}</small></p><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">來源連結</a></article>`).join('')||'<p>查無法規資料。</p>';
  }
  function renderCompanies(){
    const box=document.getElementById('companyList'); if(!box)return;
    box.innerHTML=state.companies.map((c)=>`
      <div class="entity-item">
        <div class="meta">
          <strong>${escapeHtml(c.name)}</strong>${c.isDefault?'<span class="default-badge">預設</span>':''}
          <small>${escapeHtml(c.phone||'—')}｜${escapeHtml(c.address||'—')}｜統編 ${escapeHtml(c.taxId||'—')}｜原產國 ${escapeHtml(c.country||'—')}</small>
        </div>
        <div class="actions">
          <button data-action="editCompany" data-id="${c.id}">編輯</button>
          <button class="danger" data-action="deleteCompany" data-id="${c.id}">刪除</button>
        </div>
      </div>`).join('');
  }
  function renderBrands(){
    const box=document.getElementById('brandList'); if(!box)return;
    box.innerHTML=state.brands.map((b)=>{
      const c=state.companies.find((x)=>x.id===b.companyId);
      return `<div class="entity-item">
        <div class="meta">
          <strong>${escapeHtml(b.name)}</strong>${b.isDefault?'<span class="default-badge">預設</span>':''}
          <small>關聯公司：${escapeHtml(c?.name||'未指定')}</small>
        </div>
        <div class="actions">
          <button data-action="editBrand" data-id="${b.id}">編輯</button>
          <button class="danger" data-action="deleteBrand" data-id="${b.id}">刪除</button>
        </div>
      </div>`;
    }).join('');
  }

  // ======== TFDA 九大項標示渲染 ========
  function renderLabel(){
    const recipe=state.recipes.find((r)=>r.id===state.selectedRecipeId)||state.recipes[0];
    const preview=document.getElementById('labelPreview');
    const editor=document.getElementById('recipeEditor');
    if(!recipe){ preview.innerHTML='<p>請先建立配方。</p>'; editor.innerHTML=''; return; }
    const calc=calculateRecipe(recipe);
    const company=resolveRecipeCompany(recipe);
    const brand=resolveRecipeBrand(recipe);
    const ingredients=buildIngredientList(recipe);
    const expiry=computeExpiryDisplayMerged(recipe);
    const storageForLabel = (printSession.storageOverride && printSession.storageOverride.trim()) || recipe.storageCondition || '';
    const batchNoForLabel = (printSession.batchNo || '').trim();

    const addText=(recipe.additives||[]).filter((a)=>a&&a.name).map((a)=>a.function?`${a.name}（${a.function}）`:a.name).join('、');
    const allergenSelected=(recipe.allergens||[]).filter((a)=>a&&a.id);
    const allergenLines=[
      ...allergenSelected.filter((a)=>a.mode==='contains').map((a)=>`本產品含有${ALLERGEN_CATALOG.find((x)=>x.id===a.id)?.name||a.id}。`),
      ...allergenSelected.filter((a)=>a.mode==='mayContain').map((a)=>`本產品製造廠房處理含${ALLERGEN_CATALOG.find((x)=>x.id===a.id)?.name||a.id}之產品。`)
    ];
    const gmoText=(recipe.gmoIngredients||[]).length ? `本產品含基因改造${recipe.gmoIngredients.join('、')}。` : '';
    const warnings=(recipe.warnings||'').split('\n').map((w)=>w.trim()).filter(Boolean);

    const nutritionRow=(name,key,unit,indent=false)=>`<div class="nutrition-row ${indent?'indent':''}"><span>${name}</span><strong>${fmt(calc.perServing[key],key==='calories'||key==='sodium'?0:1)} ${unit}</strong><span>${recipe.labelType==='B'?dailyPercent(key,calc.perServing[key]):fmt(calc.per100[key],key==='calories'||key==='sodium'?0:1)+' '+unit}</span></div>`;

    preview.innerHTML=`<div class="food-label">
      <h2 class="label-title">${escapeHtml(recipe.productName||recipe.name)}</h2>

      <div class="label-section">
        <div class="label-field"><span>品名</span><strong>${escapeHtml(recipe.productName||recipe.name)}</strong></div>
        ${brand?`<div class="label-field"><span>品牌</span><strong>${escapeHtml(brand.name)}</strong></div>`:''}
      </div>

      <div class="label-section">
        <h4>內容物名稱</h4>
        <div class="label-ingredients">${ingredients.map(escapeHtml).join('、')||'—'}</div>
      </div>

      ${addText?`<div class="label-section"><h4>食品添加物</h4><div class="label-additives">${escapeHtml(addText)}</div></div>`:''}

      <div class="label-section">
        <div class="label-field"><span>淨重 / 容量</span><strong>${fmt(calc.finalWeight)} 公克</strong></div>
        <div class="label-field"><span>每份重量</span><strong>${fmt(calc.servingSize)} 公克</strong></div>
        <div class="label-field"><span>本包裝含</span><strong>${fmt(calc.servingCount)} 份</strong></div>
      </div>

      <div class="label-section">
        <h4>製造廠商 / 國內負責廠商</h4>
        <div class="label-field"><span>名稱</span><strong>${escapeHtml(company.name||'—')}</strong></div>
        <div class="label-field"><span>電話</span><strong>${escapeHtml(company.phone||'—')}</strong></div>
        <div class="label-field"><span>地址</span><strong>${escapeHtml(company.address||'—')}</strong></div>
        ${company.taxId?`<div class="label-field"><span>統一編號</span><strong>${escapeHtml(company.taxId)}</strong></div>`:''}
        <div class="label-field"><span>原產地（國）</span><strong>${escapeHtml(company.country||'—')}</strong></div>
      </div>

      <div class="label-section">
        <h4>有效日期 / 保存</h4>
        ${expiry.manufactureDate?`<div class="label-field"><span>製造日期</span><strong>${escapeHtml(expiry.manufactureDate)}</strong></div>`:''}
        ${expiry.expiryDate?`<div class="label-field"><span>有效日期</span><strong>${escapeHtml(expiry.expiryDate)}</strong></div>`:'<div class="label-field"><span>有效日期</span><strong>（請於印製時填入）</strong></div>'}
        ${storageForLabel?`<div class="label-field"><span>保存條件</span><strong>${escapeHtml(storageForLabel)}</strong></div>`:''}
        ${batchNoForLabel?`<div class="label-field"><span>批號</span><strong>${escapeHtml(batchNoForLabel)}</strong></div>`:''}

      </div>

      <div class="label-section nutrition-block">
        <h4 style="text-align:center;font-size:1.1rem">營養標示</h4>
        <div class="nutrition-row bold head"><span>項目</span><strong>每份</strong><span>${recipe.labelType==='B'?'每日參考值%':'每100公克'}</span></div>
        ${nutritionRow('熱量','calories','大卡')}
        ${nutritionRow('蛋白質','protein','公克')}
        ${nutritionRow('脂肪','fat','公克')}
        ${nutritionRow('飽和脂肪','saturatedFat','公克',true)}
        ${nutritionRow('反式脂肪','transFat','公克',true)}
        ${nutritionRow('碳水化合物','carbohydrate','公克')}
        ${nutritionRow('糖','sugar','公克',true)}
        ${nutritionRow('膳食纖維','fiber','公克',true)}
        ${nutritionRow('鈉','sodium','毫克')}
      </div>

      ${allergenLines.length?`<div class="label-section"><h4>過敏原資訊</h4>${allergenLines.map((line)=>`<div class="label-allergen">${escapeHtml(line)}</div>`).join('')}</div>`:''}

      ${gmoText?`<div class="label-section"><div class="label-allergen">${escapeHtml(gmoText)}</div></div>`:''}

      ${warnings.length?`<div class="label-section"><h4>其他標示 / 警語</h4>${warnings.map((w)=>`<div class="label-warning">${escapeHtml(w)}</div>`).join('')}</div>`:''}

            <p class="label-footer-meta no-print">配方：${escapeHtml(recipe.name)}｜更新：${new Date(recipe.updatedAt).toLocaleDateString('zh-TW')}｜本工具依輸入資料自動計算，正式上市前仍建議由品保 / 法規人員依最新 TFDA 公告複核。</p>
    </div>`;

    editor.innerHTML=`<h3>${escapeHtml(recipe.productName||recipe.name)}</h3>
      <p>原料總投入 ${fmt(calc.totalInputWeight)}g；成品/包裝重量 ${fmt(calc.finalWeight)}g。</p>
      ${recipe.items.map((item)=>{const ing=state.ingredients.find((i)=>i.id===item.ingredientId);return `<div class="nutrition-row"><span>${escapeHtml(ing?.name||'未知原料')}</span><strong>${fmt(item.weight)} g</strong></div>`;}).join('')}
      <p><button data-action="editRecipe" data-id="${recipe.id}">編輯此配方</button> <button data-action="printLabel">列印標示</button></p>`;
  }

  // ======== 原料 CRUD ========
  function openIngredientDialog(id){
    const form=document.getElementById('ingredientForm');
    const item=state.ingredients.find((i)=>i.id===id)||{};
    document.getElementById('ingredientDialogTitle').textContent=id?'編輯原料':'新增原料';
    ['id','name','source','calories','protein','fat','saturatedFat','transFat','carbohydrate','sugar','sodium','fiber','tags'].forEach((k)=>{ form.elements[k].value=item[k]??''; });
    onlineLookupCandidates=[];
    renderOnlineLookupResults([]);
    document.getElementById('ingredientDialog').showModal();
  }
  async function fetchJsonWithTimeout(url,timeoutMs=8500){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{const response=await fetch(url,{signal:controller.signal,headers:{accept:'application/json'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);return await response.json();}
    finally{clearTimeout(timer);}
  }
  function roundNutrient(v){const n=Number(v);return Number.isFinite(n)?Math.max(0,Number(n.toFixed(2))):0;}
  function nutrientFromUsda(food,names){const f=(food.foodNutrients||[]).find((it)=>names.some((n)=>String(it.nutrientName||'').toLowerCase().includes(n)));return f?roundNutrient(f.value):0;}
  function candidateFromOpenFoodFacts(p){
    const n=p.nutriments||{}; const name=p.product_name||p.generic_name;
    if(!name||!Object.keys(n).length)return null;
    const sodiumMg=n.sodium_100g!=null?Number(n.sodium_100g)*1000:Number(n.salt_100g||0)/2.5*1000;
    return {name,source:`Open Food Facts${p.brands?`｜${p.brands}`:''}`,calories:roundNutrient(n['energy-kcal_100g']??(Number(n.energy_100g||0)/4.184)),protein:roundNutrient(n.proteins_100g),fat:roundNutrient(n.fat_100g),saturatedFat:roundNutrient(n['saturated-fat_100g']),transFat:roundNutrient(n['trans-fat_100g']),carbohydrate:roundNutrient(n.carbohydrates_100g),sugar:roundNutrient(n.sugars_100g),sodium:roundNutrient(sodiumMg),fiber:roundNutrient(n.fiber_100g),tags:'線上查詢,Open Food Facts',url:p.url||'https://world.openfoodfacts.org/'};
  }
  function candidateFromUsda(f){
    if(!f.description)return null;
    return {name:f.description,source:`USDA FoodData Central｜FDC ${f.fdcId||''}`,calories:nutrientFromUsda(f,['energy']),protein:nutrientFromUsda(f,['protein']),fat:nutrientFromUsda(f,['total lipid','total fat']),saturatedFat:nutrientFromUsda(f,['saturated']),transFat:nutrientFromUsda(f,['trans']),carbohydrate:nutrientFromUsda(f,['carbohydrate']),sugar:nutrientFromUsda(f,['sugars']),sodium:nutrientFromUsda(f,['sodium']),fiber:nutrientFromUsda(f,['fiber']),tags:'線上查詢,USDA FoodData Central',url:f.fdcId?`https://fdc.nal.usda.gov/fdc-app.html#/food-details/${f.fdcId}/nutrients`:'https://fdc.nal.usda.gov/'};
  }
  async function loadTfdaNutritionDatabase(){
    if(offlineNutritionFoods.length)return offlineNutritionFoods;
    if(!offlineNutritionLoadPromise){
      offlineNutritionLoadPromise=fetchJsonWithTimeout(TFDA_NUTRITION_DB_URL,12000).then((data)=>{offlineNutritionMeta=data.meta||null;offlineNutritionFoods=Array.isArray(data.foods)?data.foods:[];return offlineNutritionFoods;});
    }
    return offlineNutritionLoadPromise;
  }
  function candidateFromTfda(food){
    return {name:food.name,source:`TFND/TFDA 離線資料庫｜${food.category||'未分類'}｜${food.id}`,calories:roundNutrient(food.calories),protein:roundNutrient(food.protein),fat:roundNutrient(food.fat),saturatedFat:roundNutrient(food.saturatedFat),transFat:roundNutrient(food.transFat),carbohydrate:roundNutrient(food.carbohydrate),sugar:roundNutrient(food.sugar),sodium:roundNutrient(food.sodium),fiber:roundNutrient(food.fiber),tags:`TFND離線資料庫,TFDA離線資料庫,${food.category||''},${food.commonName||''}`,url:offlineNutritionMeta?.sourceUrl||'https://data.gov.tw/datasets/8543',description:food.description||food.commonName||food.englishName||''};
  }
  async function searchTfdaOfflineNutrition(query){
    const foods=await loadTfdaNutritionDatabase();
    const nq=query.trim().toLowerCase();
    const terms=nq.split(/\s+/).filter(Boolean);
    return foods.map((food)=>{
      const hay=`${food.name} ${food.commonName||''} ${food.englishName||''} ${food.category||''} ${food.description||''}`.toLowerCase();
      let score=0;
      if(String(food.name||'').toLowerCase()===nq)score+=100;
      if(String(food.name||'').toLowerCase().includes(nq))score+=50;
      if(String(food.commonName||'').toLowerCase().includes(nq))score+=35;
      if(String(food.englishName||'').toLowerCase().includes(nq))score+=25;
      terms.forEach((t)=>{if(hay.includes(t))score+=10;});
      return {food,score};
    }).filter((x)=>x.score>0).sort((a,b)=>b.score-a.score||a.food.name.localeCompare(b.food.name,'zh-Hant')).slice(0,12).map((x)=>candidateFromTfda(x.food));
  }
  async function lookupIngredientOnline(){
    const form=document.getElementById('ingredientForm');
    const query=form.elements.name.value.trim();
    if(!query){toast('請先輸入原料名稱，例如：雞胸肉、牛奶、麵粉。');return;}
    const box=document.getElementById('onlineLookupResults');
    box.innerHTML='<div class="lookup-empty">查詢中：正在比對內建 TFND/TFDA 離線資料庫、本機資料與公開線上來源...</div>';
    const local=state.ingredients.filter((i)=>i.name.toLowerCase().includes(query.toLowerCase())||query.toLowerCase().includes(i.name.toLowerCase())).slice(0,3).map((i)=>({...i,source:`${i.source}｜本機種子資料`,tags:`${i.tags||''},本機比對`}));
    const reqs=[
      searchTfdaOfflineNutrition(query),
      fetchJsonWithTimeout(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5&fields=product_name,generic_name,brands,nutriments,url`).then((d)=>(d.products||[]).map(candidateFromOpenFoodFacts).filter(Boolean)),
      fetchJsonWithTimeout(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&query=${encodeURIComponent(query)}&pageSize=5`).then((d)=>(d.foods||[]).map(candidateFromUsda).filter(Boolean))
    ];
    const settled=await Promise.allSettled(reqs);
    const off=settled[0]?.status==='fulfilled'?settled[0].value:[];
    const on=settled.slice(1).flatMap((s)=>s.status==='fulfilled'?s.value:[]);
    onlineLookupCandidates=[...off,...local,...on].filter((it,i,arr)=>arr.findIndex((x)=>`${x.name}-${x.source}`===`${it.name}-${it.source}`)===i).slice(0,8);
    renderOnlineLookupResults(onlineLookupCandidates,settled.slice(1).filter((s)=>s.status==='rejected').length,off.length);
    if(onlineLookupCandidates.length)toast(`找到 ${onlineLookupCandidates.length} 筆可帶入的營養資料，其中 TFND/TFDA 離線資料 ${off.length} 筆。`);
  }
  function renderOnlineLookupResults(candidates,failed=0,offCnt=0){
    const box=document.getElementById('onlineLookupResults'); if(!box)return;
    if(!candidates.length){box.innerHTML='<div class="lookup-empty">離線資料庫與公開來源都沒有找到符合項目；請改用其他名稱、CSV 匯入或手動輸入。</div>';return;}
    const lbl=offlineNutritionMeta?.sourceLabel?`（${escapeHtml(offlineNutritionMeta.sourceLabel)}）`:'';
    const summary=`<div class="lookup-empty">已載入 TFND/TFDA 離線食品營養資料庫${lbl} ${offlineNutritionMeta?.foodCount||offlineNutritionFoods.length||0} 筆，本次命中 ${offCnt} 筆；請選擇最接近的食品後按「帶入」。</div>`;
    box.innerHTML=summary+candidates.map((it,i)=>`<div class="lookup-result"><div class="lookup-result-header"><div><strong>${escapeHtml(it.name)}</strong><br><small>${escapeHtml(it.source||'')}</small></div><button type="button" class="primary" data-action="applyNutritionCandidate" data-index="${i}">帶入</button></div><div class="lookup-nutrients"><span>熱量 ${fmt(it.calories)} kcal</span><span>蛋白質 ${fmt(it.protein)}g</span><span>脂肪 ${fmt(it.fat)}g</span><span>碳水 ${fmt(it.carbohydrate)}g</span><span>糖 ${fmt(it.sugar)}g</span><span>鈉 ${fmt(it.sodium,0)}mg</span></div>${it.description?`<small>${escapeHtml(it.description).slice(0,120)}</small><br>`:''}${it.url?`<small><a href="${escapeHtml(it.url)}" target="_blank" rel="noopener">查看來源</a></small>`:''}</div>`).join('')+(failed?'<div class="lookup-empty">提示：部分線上來源沒有回應；TFND/TFDA 離線資料庫仍可使用。</div>':'');
  }
  function applyNutritionCandidate(index){
    const it=onlineLookupCandidates[Number(index)]; const form=document.getElementById('ingredientForm'); if(!it||!form)return;
    ['name','source','calories','protein','fat','saturatedFat','transFat','carbohydrate','sugar','sodium','fiber','tags'].forEach((k)=>{form.elements[k].value=it[k]??'';});
    toast('已帶入候選營養資料，請複核後按「儲存」。');
  }
  function saveIngredient(){
    const form=document.getElementById('ingredientForm');
    const d=Object.fromEntries(new FormData(form).entries());
    const rec={...d,calories:parseNumber(d.calories),protein:parseNumber(d.protein),fat:parseNumber(d.fat),saturatedFat:parseNumber(d.saturatedFat),transFat:parseNumber(d.transFat),carbohydrate:parseNumber(d.carbohydrate),sugar:parseNumber(d.sugar),sodium:parseNumber(d.sodium),fiber:parseNumber(d.fiber),updatedAt:nowIso()};
    if(d.id)state.ingredients=state.ingredients.map((i)=>i.id===d.id?rec:i);
    else state.ingredients.push({...rec,id:uid('ing')});
    saveState(`原料資料已儲存：${rec.name}`);
  }

  // ======== 配方 CRUD（含標示資訊分頁） ========
  function openRecipeDialog(id){
    const form=document.getElementById('recipeForm');
    const recipe=state.recipes.find((r)=>r.id===id)||{
      id:'',name:'',productName:'',labelType:'A',packageWeight:100,servingSize:50,notes:'',items:[],
      companyId:getDefaultCompany()?.id||'',brandId:'',
      companyNameOverride:'',companyPhoneOverride:'',companyAddressOverride:'',companyTaxIdOverride:'',
      originCountry:getDefaultCompany()?.country||'',
      expiryMode:'manufactureDate',manufactureDate:'',shelfLifeMonths:12,expiryDate:'',
      storageCondition:'',additives:[],allergens:[],gmoIngredients:[],warnings:''
    };
    document.getElementById('recipeDialogTitle').textContent=id?'編輯配方':'新增配方';
    ['id','name','productName','labelType','packageWeight','servingSize','notes','originCountry','companyId','brandId','companyNameOverride','companyPhoneOverride','companyAddressOverride','companyTaxIdOverride','expiryMode','manufactureDate','shelfLifeMonths','expiryDate','storageCondition','warnings'].forEach((k)=>{ if(form.elements[k])form.elements[k].value=recipe[k]??''; });

    populateCompanyBrandSelectors(recipe);
    syncExpiryModeFields(recipe.expiryMode);

    renderRecipeItemRows(recipe.items.length?recipe.items:[{ingredientId:state.ingredients[0]?.id,weight:100}]);
    renderAdditiveEditor(recipe);
    renderAllergenEditor(recipe);
    renderGmoEditor(recipe);

    // 切回第一頁
    switchSubTab('basic');

    document.getElementById('recipeDialog').showModal();
  }
  function populateCompanyBrandSelectors(recipe){
    const cs=document.getElementById('recipeCompanySelect');
    cs.innerHTML='<option value="">— 由下方手動輸入 —</option>'+state.companies.map((c)=>`<option value="${c.id}" ${c.id===recipe.companyId?'selected':''}>${escapeHtml(c.name)}${c.isDefault?'（預設）':''}</option>`).join('');
    const bs=document.getElementById('recipeBrandSelect');
    bs.innerHTML='<option value="">— 不指定 —</option>'+state.brands.map((b)=>`<option value="${b.id}" ${b.id===recipe.brandId?'selected':''}>${escapeHtml(b.name)}</option>`).join('');
  }
  function syncExpiryModeFields(mode){
    document.querySelectorAll('[data-expiry-field]').forEach((el)=>{ el.hidden = (el.dataset.expiryField !== mode); });
  }
  function renderRecipeItemRows(items){
    const options=state.ingredients.map((i)=>`<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
    document.getElementById('recipeItems').innerHTML=items.map((item)=>`<div class="recipe-line"><select class="recipe-ingredient">${options}</select><input class="recipe-weight" type="number" step="0.1" value="${item.weight||0}" placeholder="重量g" /><button type="button" data-action="removeRecipeItem">移除</button></div>`).join('');
    [...document.querySelectorAll('.recipe-ingredient')].forEach((sel,i)=>{ sel.value=items[i].ingredientId||state.ingredients[0]?.id; });
  }
  function renderAdditiveEditor(recipe){
    // 系統建議：來自原料掃描
    const sug=detectAdditiveSuggestions(recipe);
    const sugBox=document.getElementById('additiveSuggestions');
    if(sug.length){
      sugBox.innerHTML='<strong>系統建議添加物（勾選後加入）：</strong><div style="margin-top:.4rem;display:flex;flex-wrap:wrap;gap:.4rem">'+sug.map((s,i)=>`<button type="button" data-action="addSuggestedAdditive" data-name="${escapeHtml(s.name)}" data-function="${escapeHtml(s.suggestedFunction)}">＋ ${escapeHtml(s.name)}（${escapeHtml(s.suggestedFunction)}）</button>`).join('')+'</div>';
    } else { sugBox.innerHTML=''; }

    // 已加入列表
    const list=document.getElementById('additiveList');
    const items=Array.isArray(recipe.additives)?recipe.additives:[];
    list.innerHTML=items.map((a,i)=>`
      <div class="additive-row" data-index="${i}">
        <input class="additive-name" placeholder="添加物名稱" value="${escapeHtml(a.name||'')}" />
        <select class="additive-function">${ADDITIVE_FUNCTIONS.map((f)=>`<option value="${f}" ${a.function===f?'selected':''}>${f}</option>`).join('')}</select>
        <button type="button" data-action="removeAdditive" data-index="${i}">移除</button>
      </div>`).join('');
  }
  function renderAllergenEditor(recipe){
    const grid=document.getElementById('allergenGrid');
    const suggestions=detectAllergenSuggestions(recipe);
    const selected=new Map((recipe.allergens||[]).map((a)=>[a.id,a.mode||'contains']));
    grid.innerHTML=ALLERGEN_CATALOG.map((a)=>{
      const isSel=selected.has(a.id);
      const mode=selected.get(a.id)||'contains';
      const isSug=!isSel && suggestions.includes(a.id);
      return `<div class="allergen-item ${isSug?'suggested':''}" data-allergen="${a.id}">
        <label class="row"><input type="checkbox" class="allergen-check" ${isSel?'checked':''}> ${escapeHtml(a.name)}</label>
        <select class="allergen-mode" ${isSel?'':'disabled'}>
          <option value="contains" ${mode==='contains'?'selected':''}>本產品含有</option>
          <option value="mayContain" ${mode==='mayContain'?'selected':''}>製程廠房處理</option>
        </select>
        ${isSug?'<small>系統建議：原料中含相關關鍵字</small>':''}
      </div>`;
    }).join('');
  }
  function renderGmoEditor(recipe){
    const grid=document.getElementById('gmoGrid');
    const suggestions=detectGmoSuggestions(recipe);
    const selected=new Set(recipe.gmoIngredients||[]);
    const all=[...new Set([...GMO_CANDIDATES,...suggestions])];
    grid.innerHTML=all.map((name)=>{
      const isSel=selected.has(name);
      const isSug=!isSel && suggestions.includes(name);
      return `<div class="allergen-item ${isSug?'suggested':''}" data-gmo="${escapeHtml(name)}">
        <label class="row"><input type="checkbox" class="gmo-check" ${isSel?'checked':''}> ${escapeHtml(name)}</label>
        ${isSug?'<small>系統建議：原料中含此項</small>':''}
      </div>`;
    }).join('');
  }
  function collectRecipeDialogData(){
    const form=document.getElementById('recipeForm');
    const d=Object.fromEntries(new FormData(form).entries());

    const rows=[...document.querySelectorAll('#recipeItems .recipe-line')].map((row)=>({
      ingredientId:row.querySelector('.recipe-ingredient').value,
      weight:parseNumber(row.querySelector('.recipe-weight').value)
    })).filter((x)=>x.ingredientId && x.weight>0);

    const additives=[...document.querySelectorAll('#additiveList .additive-row')].map((row)=>({
      name:row.querySelector('.additive-name').value.trim(),
      function:row.querySelector('.additive-function').value
    })).filter((x)=>x.name);

    const allergens=[...document.querySelectorAll('#allergenGrid .allergen-item')].map((el)=>{
      const checked=el.querySelector('.allergen-check').checked;
      if(!checked)return null;
      return { id:el.dataset.allergen, mode:el.querySelector('.allergen-mode').value };
    }).filter(Boolean);

    const gmo=[...document.querySelectorAll('#gmoGrid .allergen-item')].filter((el)=>el.querySelector('.gmo-check').checked).map((el)=>el.dataset.gmo);

    return { ...d, items:rows, additives, allergens, gmoIngredients:gmo, shelfLifeMonths:parseNumber(d.shelfLifeMonths), packageWeight:parseNumber(d.packageWeight), servingSize:parseNumber(d.servingSize) };
  }
  function saveRecipe(){
    const data=collectRecipeDialogData();
    if(!data.items.length){toast('請至少加入一筆有效原料。');return;}
    const record={...data,updatedAt:nowIso()};
    if(data.id)state.recipes=state.recipes.map((r)=>r.id===data.id?{...r,...record}:r);
    else { record.id=uid('rec'); state.recipes.push(record); state.selectedRecipeId=record.id; }
    saveState(`配方已儲存：${record.productName||record.name}`);
  }

  // ======== 公司 / 品牌 CRUD ========
  function openCompanyDialog(id){
    const form=document.getElementById('companyForm');
    const c=state.companies.find((x)=>x.id===id)||{id:'',name:'',phone:'',taxId:'',address:'',country:'',isDefault:false};
    document.getElementById('companyDialogTitle').textContent=id?'編輯公司／廠商':'新增公司／廠商';
    ['id','name','phone','taxId','address','country'].forEach((k)=>{form.elements[k].value=c[k]??'';});
    form.elements.isDefault.value=c.isDefault?'true':'false';
    document.getElementById('companyDialog').showModal();
  }
  function saveCompany(){
    const form=document.getElementById('companyForm');
    const d=Object.fromEntries(new FormData(form).entries());
    const rec={id:d.id||uid('co'),name:d.name.trim(),phone:d.phone.trim(),taxId:d.taxId.trim(),address:d.address.trim(),country:d.country.trim(),isDefault:d.isDefault==='true'};
    if(rec.isDefault)state.companies=state.companies.map((c)=>({...c,isDefault:false}));
    if(d.id)state.companies=state.companies.map((c)=>c.id===d.id?rec:c);
    else state.companies.push(rec);
    saveState(`公司資料已儲存：${rec.name}`);
  }
  function deleteCompany(id){
    if(!confirm('確定刪除此公司？已關聯的配方仍會保留覆寫資料。'))return;
    state.companies=state.companies.filter((c)=>c.id!==id);
    saveState('已刪除公司資料。');
  }
  function openBrandDialog(id){
    const form=document.getElementById('brandForm');
    const b=state.brands.find((x)=>x.id===id)||{id:'',name:'',companyId:'',isDefault:false};
    document.getElementById('brandDialogTitle').textContent=id?'編輯品牌':'新增品牌';
    form.elements.id.value=b.id||'';
    form.elements.name.value=b.name||'';
    const cs=document.getElementById('brandCompanySelect');
    cs.innerHTML='<option value="">— 不指定 —</option>'+state.companies.map((c)=>`<option value="${c.id}" ${c.id===b.companyId?'selected':''}>${escapeHtml(c.name)}</option>`).join('');
    form.elements.isDefault.value=b.isDefault?'true':'false';
    document.getElementById('brandDialog').showModal();
  }
  function saveBrand(){
    const form=document.getElementById('brandForm');
    const d=Object.fromEntries(new FormData(form).entries());
    const rec={id:d.id||uid('br'),name:d.name.trim(),companyId:d.companyId||'',isDefault:d.isDefault==='true'};
    if(rec.isDefault)state.brands=state.brands.map((b)=>({...b,isDefault:false}));
    if(d.id)state.brands=state.brands.map((b)=>b.id===d.id?rec:b);
    else state.brands.push(rec);
    saveState(`品牌資料已儲存：${rec.name}`);
  }
  function deleteBrand(id){
    if(!confirm('確定刪除此品牌？'))return;
    state.brands=state.brands.filter((b)=>b.id!==id);
    saveState('已刪除品牌資料。');
  }

  // ======== 法規同步、CSV、備份 / 還原（沿用原邏輯） ========
  async function syncRegulations(){
    toast('同步中...');
    state.lastSyncAt=nowIso();
    state.regulations=state.regulations.map((r)=>({...r,fetchedAt:nowIso(),checksum:checksum(`${r.title}${r.text}`)}));
    saveState('已嘗試同步法規（離線環境保留現有資料）。');
  }
  function download(filename,content,mime='application/json'){
    const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
  }
  function exportIngredients(){
    const headers=['name','source','calories','protein','fat','saturatedFat','transFat','carbohydrate','sugar','sodium','fiber','tags'];
    const csv=[headers.join(',')].concat(state.ingredients.map((i)=>headers.map((h)=>JSON.stringify(i[h]??'')).join(','))).join('\n');
    download('ingredients.csv',csv,'text/csv');
  }
  function importIngredients(file){
    const reader=new FileReader();
    reader.onload=()=>{
      const text=String(reader.result||''); const lines=text.split(/\r?\n/).filter(Boolean);
      const headers=lines.shift().split(',').map((s)=>s.replace(/^"|"$/g,''));
      const added=[];
      lines.forEach((line)=>{
        const cells=line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)||[];
        const obj={}; headers.forEach((h,idx)=>{obj[h]=(cells[idx]||'').replace(/,$/, '').replace(/^"|"$/g,'').replace(/""/g,'"');});
        if(obj.name){added.push({id:uid('ing'),...obj,calories:parseNumber(obj.calories),protein:parseNumber(obj.protein),fat:parseNumber(obj.fat),saturatedFat:parseNumber(obj.saturatedFat),transFat:parseNumber(obj.transFat),carbohydrate:parseNumber(obj.carbohydrate),sugar:parseNumber(obj.sugar),sodium:parseNumber(obj.sodium),fiber:parseNumber(obj.fiber),updatedAt:nowIso()});}
      });
      state.ingredients=state.ingredients.concat(added);
      saveState(`匯入 ${added.length} 筆原料資料。`);
    };
    reader.readAsText(file,'utf-8');
  }
  function exportRegulations(){download('regulations.json',JSON.stringify(state.regulations,null,2));}
  function backupAll(){download('food-label-pro-backup.json',JSON.stringify(state,null,2));}
  function restoreFromFile(file){
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const parsed=JSON.parse(reader.result);
        state=migrateState(parsed);
        saveState('已還原備份資料。');
      }catch(e){toast('還原失敗：JSON 格式錯誤。');}
    };
    reader.readAsText(file,'utf-8');
  }

  // ======== 分頁切換（主頁 & dialog 內） ========
  function switchMainTab(name){
    document.querySelectorAll('.tab').forEach((t)=>t.classList.toggle('active',t.dataset.tab===name));
    document.querySelectorAll('.panel').forEach((p)=>p.classList.toggle('active',p.id===name));
  }
  function switchSubTab(name){
    document.querySelectorAll('.sub-tab').forEach((t)=>t.classList.toggle('active',t.dataset.subtab===name));
    document.querySelectorAll('.sub-panel').forEach((p)=>p.classList.toggle('active',p.dataset.subpanel===name));
  }

  // ======== 列印 ========
  function printLabel(){ window.print(); }

  // ======== 事件總管：集中處理 data-action / data-tab / data-subtab ========
  function bindEvents(){
    document.addEventListener('click',(e)=>{
      const tabBtn=e.target.closest('[data-tab]');
      if(tabBtn){switchMainTab(tabBtn.dataset.tab);return;}
      const subBtn=e.target.closest('[data-subtab]');
      if(subBtn){switchSubTab(subBtn.dataset.subtab);return;}

      const btn=e.target.closest('[data-action]'); if(!btn)return;
      const action=btn.dataset.action;
      const id=btn.dataset.id;

      switch(action){
        case 'openIngredientDialog': openIngredientDialog(); break;
        case 'editIngredient':       openIngredientDialog(id); break;
        case 'deleteIngredient':
          if(confirm('確定刪除此原料？')){state.ingredients=state.ingredients.filter((i)=>i.id!==id);saveState('已刪除原料。');}
          break;
        case 'exportIngredients':    exportIngredients(); break;
        case 'lookupIngredientOnline': lookupIngredientOnline(); break;
        case 'applyNutritionCandidate': applyNutritionCandidate(btn.dataset.index); break;

        case 'createRecipe':         openRecipeDialog(); break;
        case 'editRecipe':           openRecipeDialog(id); break;
        case 'deleteRecipe':
          if(confirm('確定刪除此配方？')){state.recipes=state.recipes.filter((r)=>r.id!==id);if(state.selectedRecipeId===id)state.selectedRecipeId=state.recipes[0]?.id||null;saveState('已刪除配方。');}
          break;
        case 'selectRecipe':         state.selectedRecipeId=id; saveState(); switchMainTab('label'); break;
        case 'addRecipeItem': {
          const current=[...document.querySelectorAll('#recipeItems .recipe-line')].map((row)=>({ingredientId:row.querySelector('.recipe-ingredient').value,weight:parseNumber(row.querySelector('.recipe-weight').value)}));
          current.push({ingredientId:state.ingredients[0]?.id,weight:0});
          renderRecipeItemRows(current);
          break;
        }
        case 'removeRecipeItem': btn.closest('.recipe-line').remove(); break;

        case 'addAdditiveRow': {
          const cur=collectRecipeDialogData(); cur.additives.push({name:'',function:ADDITIVE_FUNCTIONS[0]});
          renderAdditiveEditor({...cur});
          break;
        }
        case 'addSuggestedAdditive': {
          const cur=collectRecipeDialogData();
          cur.additives.push({name:btn.dataset.name,function:btn.dataset.function});
          renderAdditiveEditor({...cur});
          break;
        }
        case 'removeAdditive': {
          const idx=Number(btn.dataset.index);
          const cur=collectRecipeDialogData();
          cur.additives.splice(idx,1);
          renderAdditiveEditor({...cur});
          break;
        }

        case 'openCompanyDialog':    openCompanyDialog(); break;
        case 'editCompany':          openCompanyDialog(id); break;
        case 'deleteCompany':        deleteCompany(id); break;
        case 'openBrandDialog':      openBrandDialog(); break;
        case 'editBrand':            openBrandDialog(id); break;
        case 'deleteBrand':          deleteBrand(id); break;

        case 'syncRegulations':      syncRegulations(); break;
        case 'exportRegulations':    exportRegulations(); break;
        case 'backupAll':            backupAll(); break;
        case 'resetDemoData':
          if(confirm('將清除所有本機資料並回到示範狀態，確定？')){ resetAllStorage().then(async ()=>{ state=await loadState(); renderAll(); toast('已重置為示範資料。'); }); }
          break;
        case 'printLabel':           printLabel(); break;

        // 修正：取消按鈕在 required 欄位下無法關閉 → 直接呼叫 close
        case 'closeDialog': {
          const name=btn.dataset.dialog;
          const dlg=name?document.getElementById(name):btn.closest('dialog');
          if(dlg && dlg.open)dlg.close('cancel');
          break;
        }
      }
    });

    // 表單提交：method=dialog 預設按下「儲存」會送出 submit
    document.getElementById('ingredientForm').addEventListener('submit',(e)=>{
      if(e.submitter && e.submitter.value==='cancel')return; // 雙保險
      saveIngredient();
    });
    document.getElementById('recipeForm').addEventListener('submit',(e)=>{
      if(e.submitter && e.submitter.value==='cancel')return;
      saveRecipe();
    });
    document.getElementById('companyForm').addEventListener('submit',(e)=>{
      if(e.submitter && e.submitter.value==='cancel')return;
      saveCompany();
      populateCompanyBrandSelectors(state.recipes.find((r)=>r.id===state.selectedRecipeId)||{companyId:'',brandId:''});
    });
    document.getElementById('brandForm').addEventListener('submit',(e)=>{
      if(e.submitter && e.submitter.value==='cancel')return;
      saveBrand();
    });

    // 過敏原 checkbox 同步啟用 / 停用 mode select
    document.getElementById('allergenGrid').addEventListener('change',(e)=>{
      const item=e.target.closest('.allergen-item'); if(!item)return;
      if(e.target.classList.contains('allergen-check')){
        item.querySelector('.allergen-mode').disabled=!e.target.checked;
      }
    });

    // 有效日期模式切換
    document.getElementById('recipeExpiryMode').addEventListener('change',(e)=>syncExpiryModeFields(e.target.value));

    // 搜尋與檔案 input
    document.getElementById('ingredientSearch').addEventListener('input',renderIngredients);
    document.getElementById('regulationSearch').addEventListener('input',renderRegulations);
    document.getElementById('ingredientImport').addEventListener('change',(e)=>{const f=e.target.files?.[0]; if(f)importIngredients(f); e.target.value='';});
    document.getElementById('restoreInput').addEventListener('change',(e)=>{const f=e.target.files?.[0]; if(f)restoreFromFile(f); e.target.value='';});
    document.getElementById('labelRecipeSelect').addEventListener('change',(e)=>{state.selectedRecipeId=e.target.value;saveState();});

    // PWA install prompt
    let deferredPrompt=null;
    window.addEventListener('beforeinstallprompt',(e)=>{e.preventDefault();deferredPrompt=e;const btn=document.getElementById('installBtn');btn.hidden=false;btn.onclick=async()=>{await deferredPrompt.prompt();deferredPrompt=null;btn.hidden=true;};});
    if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js').catch(()=>{});});}
  }

  // ======== 啟動 ========
  (async () => {
    try { idbHandle = await openIdb(); idbAvailable = true; }
    catch (_) { idbAvailable = false; idbHandle = null; }
    state = await loadState();
    bindEvents();
    renderAll();
  })();
})();

