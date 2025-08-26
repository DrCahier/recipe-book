// assets/js/drive/lock.js

// ---- グローバル同期ロック（多重実行防止） ----
const LS = window.localStorage;
const GLOBAL_KEY = 'drive-sync-busy';

export function beginGlobalSync() {
    LS.setItem(GLOBAL_KEY, String(Date.now()));
}
export function endGlobalSync() {
    LS.removeItem(GLOBAL_KEY);
}
export function isGlobalSyncActive() {
    return !!LS.getItem(GLOBAL_KEY);
}

// ---- レシピIDロック（タブ間共有・TTL付き） ----
const LOCK_TTL_MS = 5 * 60 * 1000; // 5分
const LK = id => `lock-${id}`;     // キーは lock-<id> に統一

// レシピIDに対するロックを試みる
export function tryLock(id) {
    const now = Date.now();
    const k = LK(id);
    const raw = LS.getItem(k);
    if (raw) {
        const ts = Number(raw) || 0;
        if (now - ts < LOCK_TTL_MS) {
            // まだ有効なのでロック失敗
            return false;
        }
        // 期限切れロックは自動解放
        LS.removeItem(k);
    }
    LS.setItem(k, String(now));
    return true;
}

// ロック解除
export function unlock(id) {
    LS.removeItem(LK(id));
}
