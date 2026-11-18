// Service worker: statik resurslar va rasmlarni keshlab, tizimni chaqmoqdek tez yuklash va offline ishlash
const STATIC_CACHE = 'dokon-static-v33';
const IMAGE_CACHE = 'dokon-images-v1';

const STATIC_PREFIXES = ['/vendor/', '/brand/', '/admin/app.css', '/admin/js/', '/i18n/'];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  const allowedCaches = [STATIC_CACHE, IMAGE_CACHE];
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !allowedCaches.includes(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Faqat GET so'rovlar va bir xil origin
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // API doimo tarmoqdan
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 1. RASMLAR (/uploads/, /brand/, va rasm kengaytmalari) — Cache-First + Offline moslik
  const isImage = url.pathname.startsWith('/uploads/') ||
    url.pathname.startsWith('/brand/') ||
    /\.(png|jpe?g|webp|svg|gif|ico)(\?.*)?$/i.test(url.pathname);

  if (isImage) {
    e.respondWith(
      caches.open(IMAGE_CACHE).then((cache) =>
        cache.match(e.request).then((cached) => {
          if (cached) {
            // Fon rejimida yangilash (Stale-While-Revalidate agar tarmoq bo'lsa)
            fetch(e.request).then((netRes) => {
              if (netRes && netRes.status === 200) {
                cache.put(e.request, netRes.clone());
              }
            }).catch(() => {});
            return cached;
          }
          // Keshda yo'q — tarmoqdan yuklaymiz va keshga saqlaymiz
          return fetch(e.request).then((netRes) => {
            if (netRes && netRes.status === 200) {
              cache.put(e.request, netRes.clone());
            }
            return netRes;
          }).catch(() => {
            // Offline rejimda va rasm keshda yo'q bo'lsa
            return new Response('', { status: 404, statusText: 'Offline - Image not found' });
          });
        })
      )
    );
    return;
  }

  // 2. Ilova kodlari (/admin/app.css, /admin/js/) — Network-First (yangilanishlar darhol yetib borishi uchun)
  const isAppCode = url.pathname.startsWith('/admin/app.css') || url.pathname.startsWith('/admin/js/');
  if (isAppCode) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.open(STATIC_CACHE).then((cache) => cache.match(e.request)))
    );
    return;
  }

  // 3. Statik kutubxonalar (vendor, shriftlar, i18n) — Cache-First
  const isStatic = STATIC_PREFIXES.some((p) => url.pathname.startsWith(p));
  if (isStatic) {
    e.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(e.request).then((cached) => {
          if (cached) return cached;
          return fetch(e.request).then((res) => {
            if (res && res.status === 200) {
              cache.put(e.request, res.clone());
            }
            return res;
          });
        })
      )
    );
    return;
  }

  // Qolgan so'rovlar — tarmoqdan
  e.respondWith(fetch(e.request));
});
