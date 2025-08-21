/* eslint-disable no-restricted-globals */
const VERSION = 'v2.0.0';
const PRECACHE_NAME = `precache-${VERSION}`;
const RUNTIME_NAME  = `runtime-${VERSION}`;

const PRECACHE_URLS = [
    '/', '/index.html',
    '/offline.html',
    '/manifest.json',
    '/assets/css/style.css',
    '/assets/img/icn/192.png',
    '/assets/img/icn/512.png',
    '/app.js',
    '/data/recipes.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(PRECACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => ![PRECACHE_NAME, RUNTIME_NAME].includes(k))
                    .map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;

    // 非HTTP/HTTPSは無視（chrome-extension等を避ける）
    if (!request.url.startsWith(self.location.origin) && !/^https?:\/\//.test(request.url)) return;

    // 画像など含め、GET以外はスルー
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // HTML: ネットワーク優先 + オフラインフォールバック
    if (request.headers.get('accept')?.includes('text/html')) {
        event.respondWith((async () => {
            try {
                const net = await fetch(request);
                const cache = await caches.open(RUNTIME_NAME);
                cache.put(request, net.clone());
                return net;
            } catch {
                const cache = await caches.open(PRECACHE_NAME);
                return (await cache.match('/offline.html')) || new Response('Offline', { status: 503 });
            }
        })());
        return;
    }

    // JSON（レシピなど）: Stale-While-Revalidate
    if (url.pathname.endsWith('.json')) {
        event.respondWith((async () => {
            const cache = await caches.open(RUNTIME_NAME);
            const cached = await cache.match(request);
            const fetchPromise = fetch(request).then(res => {
                cache.put(request, res.clone());
                return res;
            }).catch(() => cached);
            return cached || fetchPromise;
        })());
        return;
    }

    // CSS/JS/画像など静的: Cache First
    event.respondWith((async () => {
        const cache = await caches.open(PRECACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
            const net = await fetch(request);
            cache.put(request, net.clone());
            return net;
        } catch {
            // 最低限のフォールバック（なければそのまま失敗）
            return cached || Response.error();
        }
    })());
});
