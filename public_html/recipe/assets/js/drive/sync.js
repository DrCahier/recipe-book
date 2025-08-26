// assets/js/drive/sync.js
import { FOLDER_KEY } from './config.js';
import { setMsg } from './conflictprompt.js'; // UI 更新のみ依存

// ---- HTTP API ラッパ（実体の居場所/名前が違っても吸収する） ----
async function resolveUploadFn() {
    // 1) index.js（集約ハブ）にあるか？
    try {
        const mod = await import('./index.js');
        let fn =
            mod.uploadOrUpdateMarkdown ||
            (mod.default && mod.default.uploadOrUpdateMarkdown) ||
            mod.uploadOrUpdateMd ||
            (mod.default && mod.default.uploadOrUpdateMd) ||
            mod.uploadMarkdown ||
            (mod.default && mod.default.uploadMarkdown);
        if (typeof fn === 'function') return fn;
    } catch {}

    // 2) 直接 http.js にあるか？
    try {
        const mod = await import('./http.js');
        let fn =
            mod.uploadOrUpdateMarkdown ||
            (mod.default && mod.default.uploadOrUpdateMarkdown) ||
            mod.uploadOrUpdateMd ||
            (mod.default && mod.default.uploadOrUpdateMd) ||
            mod.uploadMarkdown ||
            (mod.default && mod.default.uploadMarkdown);
        if (typeof fn === 'function') return fn;
    } catch {}

    // 3) グローバルに束ねられているか？
    if (typeof window !== 'undefined') {
        const g = window.Drive || window.drive || window.HTTP || window.http;
        if (g) {
            let fn =
                g.uploadOrUpdateMarkdown ||
                g.uploadOrUpdateMd ||
                g.uploadMarkdown;
            if (typeof fn === 'function') return fn;
        }
    }

    // 4) それでも見つからなければ null を返す（呼び出し側でUI表示）
    return null;
}

// 公開API：他モジュールから呼ばれる
export async function uploadOrUpdateMarkdown(recipe, opts = {}) {
    const fn = await resolveUploadFn();
    if (!fn) {
        const msg = 'http.uploadOrUpdateMarkdown が見つかりません';
        console.error('[sync] ' + msg);
        throw new Error(msg);
    }
    return fn(recipe, opts);
}

// ====== ここから既存の同期処理（必要最低限の例） ======

export async function syncAll() {
    const folderId = localStorage.getItem(FOLDER_KEY);
    if (!folderId) {
        setMsg('#drive-result', '<span style="color:#c22;">保存先が未設定です</span>');
        return;
    }

    // 例: ローカルキャッシュから読み出し
    const recipes = JSON.parse(localStorage.getItem('recipes-cache-v1') || '[]');

    const counts = { created: 0, updated: 0, skipped: 0, failed: 0, locked: 0 };
    const results = [];

    let uploadFn = await resolveUploadFn();
    if (!uploadFn) {
        setMsg('#drive-result', '<span style="color:#c22;">自動保存失敗: http.uploadOrUpdateMarkdown が見つかりません</span>');
        return;
    }

    for (const r of recipes) {
        try {
            const res = await uploadFn(r);
            results.push(res);
            if (res?.status === 'created') counts.created++;
            else if (res?.status === 'updated') counts.updated++;
            else counts.skipped++;
        } catch (e) {
            console.error('[sync] upload failed', e);
            counts.failed++;
            if (e?.winner === 'locked') counts.locked++;
        }
    }

    setMsg(
        '#drive-result',
        `取り込み完了：新規 ${counts.created} / 上書き ${counts.updated} / スキップ ${counts.skipped}`
        + (counts.locked ? `（ロック:${counts.locked}）` : '')
        + ` / 失敗 ${counts.failed}（合計 ${results.length}）`
    );

    return results;
}
