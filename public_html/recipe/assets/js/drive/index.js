// assets/js/drive/index.js

// Drive 関連のモジュールをここで束ねる
export * from './config.js';
export * from './sync.js';
// ★ 循環回避のため conflictprompt は re-export しない
// export * from './conflictprompt.js';
export * from './auth.js';
export * from './picker.js';
export * from './http.js';
export * from './import.js';
export * from './finder.js';
export * from './format.js';
export * from './lock.js';
export * from './autosync.js';
export * from './deltaqueue.js';

// デバッグ用: 全ロック解除
window.unlockAll = () => {
    Object.keys(localStorage)
        .filter(k => k.startsWith('lock-'))
        .forEach(k => localStorage.removeItem(k));
    console.log('[Drive] unlocked all');
};
