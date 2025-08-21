/* eslint-disable no-restricted-globals */
const VERSION = 'v2.0.1';
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

    // 非HTTP/HTTPSは無視（chrome-extension等）
    if (!request.url.startsWith(self.location.origin) && !/^https?:\/\//.test(request.url)) return;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // HTML: ネット優先 + オフラインフォールバック
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

    // JSON: Stale-While-Revalidate + 最終手段で空配列レスポンス
    if (url.pathname.endsWith('.json')) {
        event.respondWith((async () => {
            const cache = await caches.open(RUNTIME_NAME);
            const cached = await cache.match(request);
            try {
                const net = await fetch(request);
                cache.put(request, net.clone());
                return net;
            } catch (e) {
                if (cached) return cached;
                // ここが今回の堅牢化ポイント：何も無いときは空配列を返す
                return new Response('[]', {
                    status: 200,
                    headers: { 'Content-Type': 'application/json; charset=utf-8' }
                });
            }
        })());
        return;
    }

    // 静的資産: Cache First
    event.respondWith((async () => {
        const cache = await caches.open(PRECACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
            const net = await fetch(request);
            cache.put(request, net.clone());
            return net;
        } catch {
            return cached || Response.error();
        }
    })());
});
