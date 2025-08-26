// ==[drive/lock]====================================================
// 同期の多重実行を防ぐロック（タブ間共有）
// ================================================================ //
const LS = window.localStorage;
const GLOBAL_KEY = 'drive-sync-busy';
const ID_PREFIX  = 'drive-lock:';

export function beginGlobalSync() {
    LS.setItem(GLOBAL_KEY, String(Date.now()));
}
export function endGlobalSync() {
    LS.removeItem(GLOBAL_KEY);
}
export function isGlobalSyncActive() {
    return !!LS.getItem(GLOBAL_KEY);
}

// レシピID単位ロック（タブ間）
export function tryLock(id) {
    const k = ID_PREFIX + id;
    if (LS.getItem(k)) return false;
    LS.setItem(k, String(Date.now()));
    return true;
}
export function releaseLock(id) {
    try { window.localStorage.removeItem(ID_PREFIX + id); } catch {}
}
