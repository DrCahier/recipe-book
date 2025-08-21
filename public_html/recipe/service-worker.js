/* 基本のプレキャッシュ＋ネットワーク優先 */
const CACHE_NAME = 'recipe-app-v1';
const PRECACHE = [
    '/', '/index.html',
    '/offline.html',
    '/manifest.json',
    '/service-worker.js',
    '/assets/css/style.css',
    '/assets/img/icn/192.png',
    '/assets/img/icn/512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.map((k) => k !== CACHE_NAME && caches.delete(k)))).then(() => self.clients.claim())
    );
});

// ナビゲーションはApp Shell（index.html）を返す
async function handleNavigation(request) {
    try {
        const network = await fetch(request);
        return network;
    } catch (e) {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match('/index.html');
        return cached || new Response('オフラインです', { status: 503, headers: { 'Content-Type': 'text/plain; charset=UTF-8' } });
    }
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // ナビゲーション（HTML）の場合
    if (req.mode === 'navigate') {
        event.respondWith(handleNavigation(req));
        return;
    }

    // それ以外はネットワーク優先 → キャッシュfallback
    event.respondWith((async () => {
        try {
            const network = await fetch(req);
            // 成功したらキャッシュに保存（GETのみ）
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

// 既存の fetch イベント内の navigate 分岐を、offline.html へフォールバックするよう変更：
async function handleNavigation(request) {
    try {
        const network = await fetch(request);
        return network;
    } catch (e) {
        const cache = await caches.open(CACHE_NAME);
// まず offline.html を返す
        const offline = await cache.match('/offline.html');
        if (offline) return offline;
// 予備として index.html も試す
        const shell = await cache.match('/index.html');
        return shell || new Response('オフラインです', { status:503 });
    }
}


// インストール時のプレキャッシュに offline.html を追加
// PRECACHE 配列に '/offline.html' を追加しておくこと：
// const PRECACHE = ['/', '/index.html', '/offline.html', '/manifest.json', ...];