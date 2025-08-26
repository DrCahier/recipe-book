// ==[drive/sync]====================================================
// Local -> Drive 同期（後勝ち / remote_only / 競合防止ロック）
// ================================================================ //
import {
    FOLDER_KEY, LAST_SYNC, LOCAL_KEY, $, setMsg,
    APP_PROP_KEY, APP_PROP_VAL, FILENAME_STRATEGY, CONFLICT_BACKUP_MODE
} from './config.js';
import { ensureAuth } from './auth.js';
import { driveFetch } from './http.js';
import { toMarkdown, parseRecipeFromMarkdown } from './format.js';
import { INTERACTIVE_CONFLICT_PROMPT } from './config.js';
import { beginGlobalSync, endGlobalSync, isGlobalSyncActive, tryLock, releaseLock } from './lock.js';

// id:XXXX 形式にも対応して「生のID」にそろえる
function rawFolderId(v){ return v?.startsWith('id:') ? v.slice(3) : v; }

// フォルダID取得箇所をすべて：
const folderId = rawFolderId(localStorage.getItem(FOLDER_KEY));


function markRemoteNewer(id){
    try{
        const k = 'drive-remote-hints';
        const m = JSON.parse(localStorage.getItem(k) || '{}');
        m[id] = Date.now();
        localStorage.setItem(k, JSON.stringify(m));
        window.dispatchEvent(new CustomEvent('recipe:remoteNewer', { detail: { id } }));
    }catch(e){ console.warn('markRemoteNewer failed', e); }
}
function clearRemoteNewer(id){
    try{
        const k = 'drive-remote-hints';
        const m = JSON.parse(localStorage.getItem(k) || '{}');
        if (m[id]) { delete m[id]; localStorage.setItem(k, JSON.stringify(m)); }
    }catch{}
}

function nowStamp() { const d=new Date(),p=(n,w)=>String(n).padStart(w,'0'); return d.getFullYear()+p(d.getMonth()+1,2)+p(d.getDate(),2)+p(d.getHours(),2)+p(d.getMinutes(),2)+p(d.getSeconds(),2); }
function normalizeForCompare(md) { return (md||'').replace(/^\s*updatedAt:\s?.*$/gmi,'').trim(); }

// ---- Drive helpers ----
async function getFileContent(fileId, token) { const res=await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,{},token); return res.text(); }
async function uploadConflictCopy(folderId, baseName, mdText, token) {
    const meta={ name:`${baseName}-conflict-${nowStamp()}.md`, parents:[folderId], mimeType:'text/markdown' };
    const boundary='----recipeapp-conflict-'+Math.random().toString(36).slice(2);
    const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${mdText}\r\n--${boundary}--`;
    await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body},token).then(r=>r.json().catch(()=>{}));
}
async function patchFile(fileId, md, token, recipeId) {
    const boundary='----recipeapp-patch-'+Math.random().toString(36).slice(2);
    const meta={ mimeType:'text/markdown', appProperties:{ [APP_PROP_KEY]:APP_PROP_VAL, recipeId:String(recipeId) } };
    const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${md}\r\n--${boundary}--`;
    await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,{method:'PATCH',headers:{'Content-Type':'multipart/related; boundary='+boundary},body},token).then(r=>r.json().catch(()=>{}));
}
async function renameIfNeeded(fileId, desiredName, currentName, token) {
    if (currentName===desiredName) return;
    await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`,{method:'PATCH',headers:{'Content-Type':'application/json; charset=UTF-8'},body:JSON.stringify({name:desiredName})},token).then(r=>r.json().catch(()=>{}));
}

// ---- 既存探索（recipeId 主キー）+ 旧命名フォールバック ----
async function findExistingByRecipeId(folderId, recipeId, token) {
    const fields='files(id,name,modifiedTime,appProperties,parents)';
    // 1) appProperties
    const qProp = [
        `'${folderId}' in parents`,`mimeType = 'text/markdown'`,`trashed = false`,
        `appProperties has { key='recipeId' and value='${String(recipeId).replace(/'/g,"\\'")}' }`
    ].join(' and ');
    let j = await (await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qProp)}&fields=${encodeURIComponent(fields)}&pageSize=10`,{},token)).json();
    if (j.files?.length) return j.files[0];
    // 2) 旧命名: "id-*.md"
    const qPrefix = [
        `'${folderId}' in parents`,`mimeType = 'text/markdown'`,`trashed = false`,
        `name contains '${(String(recipeId)+'-').replace(/'/g,"\\'")}'`
    ].join(' and ');
    j = await (await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qPrefix)}&fields=${encodeURIComponent(fields)}&pageSize=50`,{},token)).json();
    if (j.files?.length){ j.files.sort((a,b)=>Date.parse(b.modifiedTime||0)-Date.parse(a.modifiedTime||0)); return j.files[0]; }
    return null;
}

// ---- 名前決定 ----
function baseTitle(title){ return (title||'').trim() || '無題レシピ'; }
async function decideFileName(folderId, token, recipe, existingName) {
    const t = baseTitle(recipe.title);
    if (FILENAME_STRATEGY==='title_id') return `${t} (${recipe.id}).md`;
    // title_counter: タイトルに追従、既存 (n) は引継ぎ試行
    let keepN=null; const m=existingName?.match(/\((\d+)\)\.md$/); if(m) keepN=Number(m[1]);
    const q=[`'${folderId}' in parents`,`mimeType = 'text/markdown'`,`trashed = false`,`name contains '${t.replace(/'/g,"\\'")}'`].join(' and ');
    const fields='files(id,name,appProperties)'; const url=`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=200`;
    const j=await (await driveFetch(url,{},token)).json(); const taken=new Set((j.files||[]).map(f=>f.name));
    if (keepN!=null){ const cand = keepN===1?`${t}.md`:`${t} (${keepN}).md`; if(!taken.has(cand)) return cand; }
    if (!taken.has(`${t}.md`)) return `${t}.md`;
    let n=2; while(taken.has(`${t} (${n}).md`)) n++; return `${t} (${n}).md`;
}

async function createNewFile(folderId, token, recipe, name, md) {
    const boundary='----recipeapp-new-'+Math.random().toString(36).slice(2);
    const meta={ name, parents:[folderId], mimeType:'text/markdown', appProperties:{ [APP_PROP_KEY]:APP_PROP_VAL, recipeId:String(recipe.id) } };
    const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${md}\r\n--${boundary}--`;
    await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body},token).then(r=>r.json().catch(()=>{}));
}

function applyRemoteToLocal(remoteRecipe){
    try{
        const list=JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]');
        const idx=list.findIndex(x=>x.id===remoteRecipe?.id);
        if(idx>=0){ list[idx]={...list[idx],...remoteRecipe}; localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); }
    }catch(e){ console.warn('applyRemoteToLocal failed:', e); }
}

// ---- 本体（IDロック + 作成直前の二重チェック）----
export async function uploadOrUpdateMarkdown(recipe, opts = {}) {
    const token = await ensureAuth();
    const folderId = rawFolderId(localStorage.getItem(FOLDER_KEY));
    if (!folderId) throw new Error('保存先が未設定です');

    // ★レシピ単位ロック（同時実行防止）
    if (!tryLock(recipe.id)) return { created:false, updated:false, skipped:true, conflictSaved:false, winner:'locked' };
    try {
        // まず既存確認
        let existing = await findExistingByRecipeId(folderId, recipe.id, token);
        const localMd = toMarkdown(recipe);
        const desiredName = await decideFileName(folderId, token, recipe, existing?.name);

        // ---- 新規：作成直前にもっかい確認（整合性遅延/他タスクの先行作成対策）----
        if (!existing) {
            // 150ms 待って再検索（Driveの整合性待ち）
            await new Promise(r=>setTimeout(r,150));
            existing = await findExistingByRecipeId(folderId, recipe.id, token);
            if (!existing) {
                await createNewFile(folderId, token, recipe, desiredName, localMd);
                return { created:true, updated:false, conflictSaved:false, skipped:false };
            }
            // ここに来た＝他タスクが先に作った → 以下、更新フローへ合流
        }

        // 既存：内容一致なら rename のみ/完全スキップ
        let remoteMd=''; try{ remoteMd = await getFileContent(existing.id, token); }catch(_){}
        const sameContent = normalizeForCompare(remoteMd) === normalizeForCompare(localMd);
        if (sameContent) {
            await renameIfNeeded(existing.id, desiredName, existing.name, token);
            return { created:false, updated:false, conflictSaved:false, skipped:true, winner:'equal' };
        }

        // 差分あり → 後勝ち
        const remoteRecipe = remoteMd ? parseRecipeFromMarkdown(remoteMd) : null;
        const tLocal  = Date.parse(recipe.updatedAt || 0);
        const tRemote = Date.parse(remoteRecipe?.updatedAt || existing.modifiedTime || 0);
        const wantAlways = CONFLICT_BACKUP_MODE==='always';
        const wantRemote = CONFLICT_BACKUP_MODE==='remote_only';

        if (!Number.isFinite(tLocal) && !Number.isFinite(tRemote)) {
            await patchFile(existing.id, localMd, token, recipe.id);
            await renameIfNeeded(existing.id, desiredName, existing.name, token);
            return { created:false, updated:true, conflictSaved:false, skipped:false, winner:'local' };
        }

        if (Number.isFinite(tLocal) && Number.isFinite(tRemote)) {
            if (tLocal > tRemote) {
                if (wantAlways) { try{ await uploadConflictCopy(folderId, desiredName.replace(/\.md$/,''), remoteMd, token);}catch{} }
                await patchFile(existing.id, localMd, token, recipe.id);
                await renameIfNeeded(existing.id, desiredName, existing.name, token);
                return { created:false, updated:true, conflictSaved: wantAlways, skipped:false, winner:'local' };
            } else if (tRemote > tLocal) {
                // ★ リモートが新しい
                if (INTERACTIVE_CONFLICT_PROMPT && !opts.forceLocal) {
                    // バックアップは作らず、UIに選択を委ねる
                    if (remoteRecipe) applyRemoteToLocal(remoteRecipe); // ★ ここを追加：ローカルも先に最新へ
                    markRemoteNewer(recipe.id);
                    // 名前だけは最新タイトルに揃える（表示の一貫性のため）
                    await renameIfNeeded(existing.id, desiredName, existing.name, token);
                    return { created:false, updated:false, conflictSaved:false, skipped:true, winner:'remote_prompt' };
                }
                // forceLocal 指定なら強制上書き（ユーザーが「今の端末を残す」を選んだとき）
                if (opts.forceLocal) {
                    await patchFile(existing.id, localMd, token, recipe.id);
                    await renameIfNeeded(existing.id, desiredName, existing.name, token);
                    clearRemoteNewer(recipe.id);
                    return { created:false, updated:true, conflictSaved:false, skipped:false, winner:'local_forced' };
                }
                // 通常（プロンプト無効時）は Drive 勝ちをローカルへ反映
                if (remoteRecipe) applyRemoteToLocal(remoteRecipe);
                await renameIfNeeded(existing.id, desiredName, existing.name, token);
                return { created:false, updated:false, conflictSaved:false, skipped:true, winner:'remote' };
            } else {
                // タイ → リネームだけ
                await renameIfNeeded(existing.id, desiredName, existing.name, token);
                return { created:false, updated:false, conflictSaved:false, skipped:true, winner:'tie' };
            }
        }

        if (Number.isFinite(tLocal) && !Number.isFinite(tRemote)) {
            if (wantAlways) { try{ await uploadConflictCopy(folderId, desiredName.replace(/\.md$/,''), remoteMd, token);}catch{} }
            await patchFile(existing.id, localMd, token, recipe.id);
            await renameIfNeeded(existing.id, desiredName, existing.name, token);
            return { created:false, updated:true, conflictSaved: wantAlways, skipped:false, winner:'local' };
        }
        if (!Number.isFinite(tLocal) && Number.isFinite(tRemote)) {
            if (wantAlways || wantRemote) { try{ await uploadConflictCopy(folderId, desiredName.replace(/\.md$/,''), localMd, token);}catch{} }
            if (remoteRecipe) applyRemoteToLocal(remoteRecipe);
            await renameIfNeeded(existing.id, desiredName, existing.name, token);
            return { created:false, updated:false, conflictSaved:true, skipped:true, winner:'remote' };
        }

        await patchFile(existing.id, localMd, token, recipe.id);
        await renameIfNeeded(existing.id, desiredName, existing.name, token);
        return { created:false, updated:true, conflictSaved:false, skipped:false, winner:'local' };
    } finally {
        releaseLock(recipe.id);
    }
}

// ---- syncAll：実行中はグローバルロック ----
export async function syncAll() {
    try {
        if (isGlobalSyncActive()) return; // 二重実行防止
        beginGlobalSync();
        await ensureAuth();
        const folderId = localStorage.getItem(FOLDER_KEY);
        if (!folderId) { setMsg('保存先が未設定です', true); return; }

        const list = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
        if (!Array.isArray(list) || list.length === 0) { setMsg('ローカルにレシピがありません', true); return; }

        let created=0, updated=0, failed=0, conflicts=0, skipped=0;
        for (const r of list) {
            try {
                const res = await uploadOrUpdateMarkdown(r);
                if (res?.created) created++; else if (res?.updated) updated++; else if (res?.skipped) skipped++;
                if (res?.conflictSaved) conflicts++;
            } catch (e) { console.error('upload failed', e); failed++; }
        }
        localStorage.setItem(LAST_SYNC, new Date().toISOString());
        setMsg(`同期完了：作成 ${created} / 更新 ${updated} / 衝突バックアップ ${conflicts} / スキップ ${skipped} / 失敗 ${failed}（合計 ${created + updated}/${list.length}）`);
    } catch (e) {
        setMsg('同期失敗: ' + e.message, true);
    } finally {
        endGlobalSync();
    }
}
