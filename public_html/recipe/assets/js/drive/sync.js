// ==[drive/sync]====================================================
// section: Local -> Drive 同期（衝突解決つき）
// anchors:
//   - SYNC_QUEUE_SETUP
//   - SYNC_HOOKS
// ================================================================ //

import { FOLDER_KEY, LAST_SYNC, LOCAL_KEY, $ , setMsg } from './config.js';
import { ensureAuth } from './auth.js';
import { driveFetch } from './http.js';
import { toMarkdown, parseRecipeFromMarkdown, slug } from './format.js';

function nowStamp() {
    const d = new Date();
    const p = (n, w) => String(n).padStart(w, '0');
    return d.getFullYear()
        + p(d.getMonth()+1,2)
        + p(d.getDate(),2)
        + p(d.getHours(),2)
        + p(d.getMinutes(),2)
        + p(d.getSeconds(),2);
}

async function findFileIdByName(folderId, name, token) {
    const q = [
        `'${folderId}' in parents`,
        `name = '${name.replace(/'/g, "\\'")}'`,
        `trashed = false`
    ].join(' and ');
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)`;
    const j = await (await driveFetch(url, {}, token)).json();
    return j.files?.[0] || null;
}

async function getFileContent(fileId, token) {
    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {}, token);
    return res.text();
}

async function uploadConflictCopy(folderId, baseName, mdText, token) {
    const meta = { name: `${baseName}-conflict-${nowStamp()}.md`, parents: [folderId], mimeType: 'text/markdown' };
    const boundary = '----recipeapp-conflict-' + Math.random().toString(36).slice(2);
    const body = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8','',
        JSON.stringify(meta),
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8','',
        mdText,
        `--${boundary}--`
    ].join('\r\n');
    await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        { method:'POST', headers:{ 'Content-Type':'multipart/related; boundary='+boundary }, body }, token
    ).then(r=>r.json().catch(()=>{}));
}

export async function uploadOrUpdateMarkdown(recipe) {
    const token = await ensureAuth();
    const folderId = localStorage.getItem(FOLDER_KEY);
    if (!folderId) throw new Error('保存先が未設定です');

    const baseName = `${recipe.id}-${slug(recipe.title || 'recipe')}`;
    const fileName = `${baseName}.md`;
    const localMd  = toMarkdown(recipe);

    const existing = await findFileIdByName(folderId, fileName, token);

    if (!existing) {
        const boundary = '----recipeapp-new-' + Math.random().toString(36).slice(2);
        const meta = { name: fileName, parents:[folderId], mimeType:'text/markdown' };
        const body = [
            `--${boundary}`,
            'Content-Type: application/json; charset=UTF-8','',
            JSON.stringify(meta),
            `--${boundary}`,
            'Content-Type: text/plain; charset=UTF-8','',
            localMd,
            `--${boundary}--`
        ].join('\r\n');
        await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
            { method:'POST', headers:{ 'Content-Type':'multipart/related; boundary='+boundary }, body }, token
        ).then(r=>r.json().catch(()=>{}));
        return { created:true, updated:false, conflictSaved:false, skipped:false };
    }

    let remoteMd = '';
    try { remoteMd = await getFileContent(existing.id, token); } catch (_) {}
    const remoteRecipe = remoteMd ? parseRecipeFromMarkdown(remoteMd) : null;

    const tLocal  = Date.parse(recipe.updatedAt || 0);
    const tRemote = Date.parse(remoteRecipe?.updatedAt || existing.modifiedTime || 0);

    // どちらも時刻不明→更新（PATCH）
    if (!Number.isFinite(tLocal) && !Number.isFinite(tRemote)) {
        return await patchWith(localMd, existing.id, false);
    }

    if (Number.isFinite(tLocal) && Number.isFinite(tRemote)) {
        if (tLocal > tRemote) {
            if (remoteMd) { try { await uploadConflictCopy(folderId, baseName, remoteMd, token); } catch(_){} }
            return await patchWith(localMd, existing.id, true);
        } else if (tRemote > tLocal) {
            try { await uploadConflictCopy(folderId, baseName, localMd, token); } catch(_){}
            return { created:false, updated:false, conflictSaved:true, skipped:true, winner:'remote' };
        } else {
            return { created:false, updated:false, conflictSaved:false, skipped:true, winner:'tie' };
        }
    }

    if (Number.isFinite(tLocal) && !Number.isFinite(tRemote)) {
        if (remoteMd) { try { await uploadConflictCopy(folderId, baseName, remoteMd, token); } catch(_){} }
        return await patchWith(localMd, existing.id, true);
    }
    if (!Number.isFinite(tLocal) && Number.isFinite(tRemote)) {
        try { await uploadConflictCopy(folderId, baseName, localMd, token); } catch(_){}
        return { created:false, updated:false, conflictSaved:true, skipped:true, winner:'remote' };
    }

    return await patchWith(localMd, existing.id, false);

    async function patchWith(md, fileId, archived) {
        const boundary = '----recipeapp-patch-' + Math.random().toString(36).slice(2);
        const meta = { mimeType:'text/markdown' };
        const body = [
            `--${boundary}`,
            'Content-Type: application/json; charset=UTF-8','',
            JSON.stringify(meta),
            `--${boundary}`,
            'Content-Type: text/plain; charset=UTF-8','',
            md,
            `--${boundary}--`
        ].join('\r\n');
        await driveFetch(
            `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
            { method:'PATCH', headers:{ 'Content-Type':'multipart/related; boundary='+boundary }, body }, token
        ).then(r=>r.json().catch(()=>{}));
        return { created:false, updated:true, conflictSaved: !!archived, skipped:false, winner:'local' };
    }
}

export async function syncAll() {
    try {
        await ensureAuth();
        const folderId = localStorage.getItem(FOLDER_KEY);
        if (!folderId) { setMsg('保存先が未設定です', true); return; }

        const list = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
        if (!Array.isArray(list) || list.length === 0) {
            setMsg('ローカルにレシピがありません', true); return;
        }

        let created = 0, updated = 0, failed = 0, conflicts = 0, skipped = 0;
        for (const r of list) {
            try {
                r.updatedAt = new Date().toISOString();
                const res = await uploadOrUpdateMarkdown(r);
                if (res?.created) created++;
                else if (res?.updated) updated++;
                else if (res?.skipped) skipped++;
                if (res?.conflictSaved) conflicts++;
                // <ANCHOR:SYNC_HOOKS>
            } catch (e) {
                console.error('upload failed', e);
                failed++;
            }
        }
        localStorage.setItem(LAST_SYNC, new Date().toISOString());
        setMsg(`同期完了：作成 ${created} / 更新 ${updated} / 衝突バックアップ ${conflicts} / スキップ ${skipped} / 失敗 ${failed}（合計 ${created + updated}/${list.length}）`);
    } catch (e) {
        setMsg('同期失敗: ' + e.message, true);
    }
}

// 将来の自動同期キューはここで初期化
// <ANCHOR:SYNC_QUEUE_SETUP>
