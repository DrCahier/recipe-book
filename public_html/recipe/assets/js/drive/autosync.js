// ==[drive/autosync]===============================================
// section: オンライン復帰・一定間隔での軽量オート同期
// 競合防止: syncAll 実行中（グローバルロック中）は何もしない
// ================================================================ //

import { ensureAuth } from './auth.js';
import { syncAll } from './sync.js';
import { isGlobalSyncActive } from './lock.js';

let timer = null;

async function trySync() {
    // ★ ここがポイント：同期処理が走っている間は何もしない
    if (isGlobalSyncActive()) return;

    try {
        // ensureAuth は失敗しても例外投げるだけ。popup系はユーザー操作時に済ませる想定
        await ensureAuth();
        await syncAll();
    } catch (e) {
        // オフラインや認可切れ等は静かにスキップ（次回チャレンジ）
        console.debug('autosync skipped:', e?.message || e);
    }
}

export function startAutoSync() {
    // 起動直後に一回だけ（オンラインなら）
    if (navigator.onLine) setTimeout(trySync, 1200);

    // オンライン復帰で即同期
    window.addEventListener('online', () => setTimeout(trySync, 500));

    // タブが前面に来たときに軽く同期
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
            setTimeout(trySync, 800);
        }
    });

    // 定期同期（軽め）— 必要に応じて間隔を調整
    const intervalMs = 60_000; // 60秒
    clearInterval(timer);
    timer = setInterval(() => {
        if (navigator.onLine) trySync();
    }, intervalMs);
}
