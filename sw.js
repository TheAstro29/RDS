// v3.3.1 (cache v24) · v2.2.0 — ไฟล์ของแอป (HTML/JS/CSS) โหลดจากเน็ตก่อนเสมอ ได้เวอร์ชันล่าสุดทันทีหลังอัปเดต
// ถ้าออฟไลน์ค่อยใช้ตัวที่เก็บไว้ในเครื่อง ส่วนไลบรารีจาก CDN (ไม่เปลี่ยนบ่อย) ใช้ตัวในเครื่องก่อน
const CACHE_NAME = 'rds-shell-v24';
const SHELL_FILES = [
  './', './index.html', './style.css?v=3.3.1', './script.js?v=3.3.1', './manifest.json', './icons/c2tech-logo.png',
  './assets/icon-192.png', './assets/icon-512.png',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11.10.5/dist/sweetalert2.all.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600;700;800&family=Chakra+Petch:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.url.includes('script.google.com') || req.url.includes('googleusercontent.com') || req.url.includes('cloudfunctions.net') || req.url.includes('firebasestorage.googleapis.com')) return; // ข้อมูลจริงไม่เก็บแคช

  const sameOrigin = new URL(req.url).origin === self.location.origin;
  if (sameOrigin) {
    // network-first
    // v3.3.1 cache: 'no-cache' = ถามเซิร์ฟเวอร์ทุกครั้ง (ไม่ใช้สำเนาใน HTTP cache ของเบราว์เซอร์ที่ GitHub Pages ให้เก็บได้ 10 นาที)
    event.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
        if (res.redirected && req.mode === 'navigate') return fetch(req); // หน้าที่ถูก redirect ให้เบราว์เซอร์จัดการเอง
        if (res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }
  // cache-first สำหรับ CDN/ฟอนต์
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
      return res;
    }))
  );
});
