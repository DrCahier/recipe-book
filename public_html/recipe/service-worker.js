const CACHE_NAME = 'recipe-app-v1';
const PRECACHE = [
    '/', '/index.html', '/assets/css/style.css', '/manifest.json',
    '/assets/img/icn/192.png', '/assets/img/icn/512.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        for (const url of PRECACHE) {
            try {
                await cache.add(url);
            } catch (err) {
                console.warn('[SW] skip cache (failed):', url, err);
            }
        }
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('/index.html')))
    );
});
