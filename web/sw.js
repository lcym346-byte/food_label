// Service Worker：讓 GitHub Pages / PWA 可離線開啟核心檔案。
const CACHE_NAME='food-label-pro-v4';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./favicon.svg','./data/tfda_nutrition_compact.json'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).catch(()=>caches.match('./index.html'))))});
