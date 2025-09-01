// assets/js/drive/index.js

// 個別モジュールの公開
export * from './config.js';
export * from './sync.js';
export * from './auth.js';
export * from './picker.js';
export * from './http.js';
export * from './import.js';
export * from './finder.js';
export * from './format.js';
export * from './lock.js';

// 明示的 re-export（念のため）
export { startAutoSync } from './autosync.js';
export { startDeltaQueue } from './deltaqueue.js';

// デフォルト集約（デバッグや window 直結用）
import * as Config from './config.js';
import * as Sync from './sync.js';
import * as Auth from './auth.js';
import * as Picker from './picker.js';
import * as Http from './http.js';
import * as Importer from './import.js';
import * as Finder from './finder.js';
import * as Format from './format.js';
import * as Lock from './lock.js';
import { startAutoSync } from './autosync.js';
import { startDeltaQueue } from './deltaqueue.js';

// デバッグ用: 全ロック解除
window.unlockAll = () => {
    Object.keys(localStorage)
        .filter(k => k.startsWith('lock-'))
        .forEach(k => localStorage.removeItem(k));
    console.log('[Drive] unlocked all');
};

const Drive = {
    ...Config, ...Sync, ...Auth, ...Picker, ...Http, ...Importer, ...Finder, ...Format, ...Lock,
    startAutoSync,
    startDeltaQueue,
};

export default Drive;
