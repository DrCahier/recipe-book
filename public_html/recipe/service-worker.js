/* App Shell + オフライン対応（navigateは index.html / offline.html にフォールバック） */
const CACHE_NAME = 'recipe-app-v3'; // バージョンを上げて更新を確実に
const PRECACHE = [
    '/', '/index.html',
    '/offline.html',
    '/manifest.json',
    '/assets/css/style.css',
    '/assets/img/icn/192.png',
    '/assets/img/icn/512.png'
];

// インストール：プレキャッシュ
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

// 有効化：古いキャッシュ削除＋Navigation Preload
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => k !== CACHE_NAME && caches.delete(k)));
        if (self.registration.navigationPreload) {
            try { await self.registration.navigationPreload.enable(); } catch {}
        }
        await self.clients.claim();
    })());
});

// ナビゲーションは App Shell 優先：
// 1) preload または fetch
// 2) ネットワーク 2xx はそのまま返す
// 3) 2xx 以外（例：404）は index.html（SPAルーティング用）
// 4) ネットワーク不可なら offline.html → index.html の順
self.addEventListener('fetch', (event) => {
    const req = event.request;

    if (req.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                // Navigation Preload の 2xx のときのみ採用（404/500 は却下）
                const preload = await event.preloadResponse;
                if (preload && preload.ok) return preload;

                // 通常フェッチ：2xx ならそのまま
                const res = await fetch(req);
                if (res.ok) return res;

                // 2xx 以外は App Shell へ（/no-such-route 等の対策）
                const cache = await caches.open(CACHE_NAME);
                const shell = await cache.match('/index.html');
                return shell || res;
            } catch (e) {
                // オフライン時：offline → index の順でフォールバック
                const cache = await caches.open(CACHE_NAME);
                const offline = await cache.match('/offline.html');
                if (offline) return offline;
                const shell = await cache.match('/index.html');
                return shell || new Response('オフラインです', {
                    status: 503,
                    headers: { 'Content-Type': 'text/plain; charset=UTF-8' }
                });
            }
        })());
        return;
    }

    // 静的アセットなど：ネットワーク優先 → キャッシュfallback（GETのみ保存）
    event.respondWith((async () => {
        try {
            const network = await fetch(req);
            if (req.method === 'GET') {
                const cache = await caches.open(CACHE_NAME);
                cache.put(req, network.clone());
            }
            return network;
        } catch (e) {
            const cached = await caches.match(req);
            return cached || Response.error();
        }
    })());
});

// 即時更新用（任意）
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
