// v2.2.0 — ไฟล์ของแอป (HTML/JS/CSS) โหลดจากเน็ตก่อนเสมอ ได้เวอร์ชันล่าสุดทันทีหลังอัปเดต
// ถ้าออฟไลน์ค่อยใช้ตัวที่เก็บไว้ในเครื่อง ส่วนไลบรารีจาก CDN (ไม่เปลี่ยนบ่อย) ใช้ตัวในเครื่องก่อน
const CACHE_NAME = 'rds-shell-v12';
const SHELL_FILES = [
  './', './index.html', './style.css', './script.js', './manifest.json',
  './assets/icon-192.png', './assets/icon-512.png',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11.10.5/dist/sweetalert2.all.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Anuphan:wght@500;600;700;800&display=swap'
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
  if (req.url.includes('script.google.com') || req.url.includes('googleusercontent.com')) return; // ข้อมูลจริงไม่เก็บแคช

  const sameOrigin = new URL(req.url).origin === self.location.origin;
  if (sameOrigin) {
    // network-first
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
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
