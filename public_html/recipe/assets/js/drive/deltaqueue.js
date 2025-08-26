// ==[drive/deltaqueue]=============================================
// section: ローカル変更の検知→差分だけ即時アップロードするキュー
// anchors:
//   - DELTAQUEUE_TUNE
//   - DELTAQUEUE_HOOKS
// ================================================================ //

import { LOCAL_KEY, setMsg } from './config.js';
import { uploadOrUpdateMarkdown } from './sync.js';
import { isGlobalSyncActive } from './lock.js'; // ← これをファイル先頭の import 群に追加


let running = false;
let lastSigs = new Map(); // id -> signature

function signatureOf(recipe) {
    // 「編集」を表す主要フィールドだけで署名を作る
    const pick = {
        id: recipe.id,
        title: recipe.title || '',
        time: recipe.time || '',
        tags: Array.isArray(recipe.tags) ? recipe.tags : [],
        ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
        steps: Array.isArray(recipe.steps) ? recipe.steps : [],
        updatedAt: recipe.updatedAt || ''
    };
    return JSON.stringify(pick);
}

function detectChanges() {
    const list = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    if (!Array.isArray(list) || list.length === 0) return [];

    const changed = [];
    for (const r of list) {
        if (!r?.id) continue;
        const sig = signatureOf(r);
        const prev = lastSigs.get(r.id);
        if (prev !== sig) {
            changed.push(r);
            lastSigs.set(r.id, sig);
        }
    }
    // なくなったIDは掃除
    const ids = new Set(list.map(r => r.id));
    for (const id of Array.from(lastSigs.keys())) {
        if (!ids.has(id)) lastSigs.delete(id);
    }
    return changed;
}

processQueueOnce()
async function processQueueOnce() {
    if (isGlobalSyncActive()) return;  // ★同期中は動かさない
    if (running) return;
    running = true;
    try {
        const items = detectChanges();
        if (items.length === 0) return;

        // 多重アップを避けるため直列実行
        for (const r of items) {
            try {
                await uploadOrUpdateMarkdown(r);
                // 成功してもUIは静かに。必要ならここでトースト:
                // setMsg(`自動保存: ${r.title || r.id}`);
            } catch (e) {
                setMsg(`自動保存失敗: ${e.message}`, true);
            }
        }
    } finally {
        running = false;
    }
}


export function startDeltaQueue() {
    // 監視ポーリング（短め）。編集から反映までの体感を良くする
    const intervalMs = 5_000; // <ANCHOR:DELTAQUEUE_TUNE>
    setInterval(processQueueOnce, intervalMs);

    // 起動直後にも一度だけチェック（前回の編集中断などに対応）
    setTimeout(processQueueOnce, 1200);

    // storage イベント（他タブ編集）にも反応
    window.addEventListener('storage', (ev) => {
        if (ev.key === LOCAL_KEY) processQueueOnce();
    });

    // <ANCHOR:DELTAQUEUE_HOOKS>
}
