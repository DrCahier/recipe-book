/* assets/js/drive.js - Phase 3: 衝突解決つき
   - GIS OAuth
   - Local -> Drive 同期：作成/更新/失敗に加え「衝突」を処理
     * 同名(.md)がある場合は中身を取得して updatedAt を比較
     * どちらか新しい方を勝者として採用し、もう一方は `-conflict-YYYYMMDDHHmmss.md` で同フォルダに保存
   - Drive -> Local 取り込み：updatedAt 新しい方で上書き（ローカル側のみ）
*/

(function () {
    'use strict';

    // ===== 設定 =====
    const CLIENT_ID = '662348647538-vcm12uih5ecasv9hhmelkll4v5prpbnj.apps.googleusercontent.com';
    const SCOPE = 'https://www.googleapis.com/auth/drive.file';

    const LOCAL_KEY  = 'recipes-cache-v1';
    const TOKEN_KEY  = 'gauth-token';        // sessionStorage
    const FOLDER_KEY = 'drive-folder-id';    // localStorage
    const LAST_SYNC  = 'drive-last-sync-iso';

    const $ = (s) => document.querySelector(s);
    function setMsg(msg, err = false) {
        const el = $('#drive-result');
        if (!el) return;
        el.textContent = msg;
        el.style.color = err ? '#c00' : '#0a6';
    }

    // ===== 認証（GIS） =====
    async function ensureAuth() {
        return new Promise((resolve, reject) => {
            const cached = sessionStorage.getItem(TOKEN_KEY);
            if (cached) return resolve(cached);
            if (!(window.google && google.accounts?.oauth2)) {
                return reject(new Error('Google Identity Services が読み込まれていません'));
            }
            const client = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPE,
                callback: (t) => {
                    if (!t?.access_token) return reject(new Error('アクセストークン取得に失敗'));
                    sessionStorage.setItem(TOKEN_KEY, t.access_token);
                    resolve(t.access_token);
                }
            });
            try { client.requestAccessToken(); } catch (e) { reject(e); }
        });
    }

    // ===== Drive API ヘルパ =====
    // 置き換え：共通フェッチ（401なら1回だけリトライ）
    async function driveFetch(url, options = {}, token, _retried = false) {
        const res = await fetch(url, {
            ...options,
            headers: { ...(options.headers || {}), 'Authorization': 'Bearer ' + token }
        });

        // トークン失効・無効
        if (res.status === 401 && !_retried) {
            try {
                // 古いトークン破棄 → 再認可
                sessionStorage.removeItem('gauth-token');
                const fresh = await ensureAuth();
                return await driveFetch(url, options, fresh, true);
            } catch (e) {
                // リトライも失敗したら元のレスポンスを投げる
            }
        }

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Drive API ${res.status} ${res.statusText}: ${text}`);
        }
        return res;
    }


    async function findFileIdByName(folderId, name, token) {
        const q = [
            `'${folderId}' in parents`,
            `name = '${name.replace(/'/g, "\\'")}'`,
            `trashed = false`
        ].join(' and ');
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)`;
        const j = await (await driveFetch(url, {}, token)).json();
        return j.files?.[0] || null; // {id,name,modifiedTime} or null
    }

    async function getFileContent(fileId, token) {
        const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {}, token);
        return res.text();
    }

    // ===== Markdown 生成/解析 =====
    function yamlEscape(v) {
        if (v == null) return '';
        const s = String(v);
        return /[:#\-\[\]\{\},&*?]|^\s|\s$|["'\n]/.test(s) ? JSON.stringify(s) : s;
    }
    function yamlArray(arr) {
        if (!Array.isArray(arr)) return '[]';
        return '[' + arr.map(v => JSON.stringify(String(v))).join(', ') + ']';
    }
    function toMarkdown(recipe) {
        const fm = {
            id: recipe.id,
            title: recipe.title || '',
            time: recipe.time || '',
            tags: Array.isArray(recipe.tags) ? recipe.tags : [],
            updatedAt: recipe.updatedAt || new Date().toISOString()
        };
        const lines = [
            '---',
            'id: ' + yamlEscape(fm.id),
            'title: ' + yamlEscape(fm.title),
            fm.time ? 'time: ' + yamlEscape(fm.time) : null,
            'tags: ' + yamlArray(fm.tags),
            'updatedAt: ' + yamlEscape(fm.updatedAt),
            '---',
            '',
            '## 材料',
            ...(recipe.ingredients || []).map(i => '- ' + (i ?? '')),
            '',
            '## 手順',
            ...(recipe.steps || []).map((s, i) => (i + 1) + '. ' + (s ?? '')),
            ''
        ].filter(Boolean);
        return lines.join('\n');
    }
    function slug(s) {
        return (s || '')
            .toString()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .toLowerCase();
    }
    if (!window.RecipeFormat) window.RecipeFormat = {};
    window.RecipeFormat.toMarkdown = toMarkdown;

    // --- YAML + 本文パース（最小実装） ---
    function parseYamlFrontMatter(mdText) {
        const m = mdText.match(/^---\s*[\r\n]+([\s\S]*?)\r?\n---\s*[\r\n]*/);
        if (!m) return { fm: {}, rest: mdText };
        const yaml = m[1];
        const rest = mdText.slice(m[0].length);

        const fm = {};
        yaml.split(/\r?\n/).forEach(line => {
            const idx = line.indexOf(':');
            if (idx < 0) return;
            const key = line.slice(0, idx).trim();
            let val = line.slice(idx + 1).trim();
            if (/^\[.*\]$/.test(val)) {
                const inner = val.slice(1, -1).trim();
                const arr = inner ? inner.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')) : [];
                fm[key] = arr;
            } else {
                fm[key] = val.replace(/^['"]|['"]$/g, '');
            }
        });
        return { fm, rest };
    }
    function parseRecipeFromMarkdown(mdText) {
        const { fm, rest } = parseYamlFrontMatter(mdText);
        // 簡易：本文から材料/手順を拾う
        const sections = {};
        let current = null;
        for (const line of rest.split(/\r?\n/)) {
            const h = line.match(/^##\s*(.+)$/);
            if (h) { current = h[1].trim(); sections[current] = []; continue; }
            if (current) sections[current].push(line);
        }
        const ingredients = (sections['材料'] || []).filter(l => /^\s*-\s+/.test(l)).map(l => l.replace(/^\s*-\s+/, '').trim()).filter(Boolean);
        const steps = (sections['手順'] || []).filter(l => /^\s*\d+\.\s+/.test(l)).map(l => l.replace(/^\s*\d+\.\s+/, '').trim()).filter(Boolean);

        return {
            id: fm.id || '',
            title: fm.title || '',
            time: fm.time || '',
            tags: Array.isArray(fm.tags) ? fm.tags : (typeof fm.tags === 'string' && fm.tags ? [fm.tags] : []),
            updatedAt: fm.updatedAt || '',
            ingredients, steps
        };
    }

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

    // ===== Local -> Drive（衝突解決つき） =====
    async function uploadOrUpdateMarkdown(recipe) {
        const token = await ensureAuth();
        const folderId = localStorage.getItem(FOLDER_KEY);
        if (!folderId) throw new Error('保存先が未設定です');

        const baseName = `${recipe.id}-${slug(recipe.title || 'recipe')}`;
        const fileName = `${baseName}.md`;
        const localMd  = toMarkdown(recipe);

        // 既存チェック
        const existing = await findFileIdByName(folderId, fileName, token);

        // 新規
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

        // 既存あり：remote を取得して updatedAt 比較
        let remoteMd = '';
        try { remoteMd = await getFileContent(existing.id, token); } catch (_) {}
        const remoteRecipe = remoteMd ? parseRecipeFromMarkdown(remoteMd) : null;

        const tLocal  = Date.parse(recipe.updatedAt || 0);
        const tRemote = Date.parse(remoteRecipe?.updatedAt || existing.modifiedTime || 0);

        // どちらも時刻が取れない場合は更新（PATCH）
        if (!Number.isFinite(tLocal) && !Number.isFinite(tRemote)) {
            return await patchWith(localMd, existing.id, false);
        }

        if (Number.isFinite(tLocal) && Number.isFinite(tRemote)) {
            if (tLocal > tRemote) {
                // ローカルが新しい → 上書きする前にリモートを conflict 保存
                if (remoteMd) { try { await uploadConflictCopy(folderId, baseName, remoteMd, token); } catch(_){} }
                return await patchWith(localMd, existing.id, true);
            } else if (tRemote > tLocal) {
                // リモートが新しい → 上書きせず、ローカル版を conflict 保存
                try { await uploadConflictCopy(folderId, baseName, localMd, token); } catch(_){}
                return { created:false, updated:false, conflictSaved:true, skipped:true, winner:'remote' };
            } else {
                // 同着 → 更新せずスキップ（将来は3-way merge）
                return { created:false, updated:false, conflictSaved:false, skipped:true, winner:'tie' };
            }
        }

        // 片方しか時刻がない場合：時刻ありを優先
        if (Number.isFinite(tLocal) && !Number.isFinite(tRemote)) {
            if (remoteMd) { try { await uploadConflictCopy(folderId, baseName, remoteMd, token); } catch(_){} }
            return await patchWith(localMd, existing.id, true);
        }
        if (!Number.isFinite(tLocal) && Number.isFinite(tRemote)) {
            try { await uploadConflictCopy(folderId, baseName, localMd, token); } catch(_){}
            return { created:false, updated:false, conflictSaved:true, skipped:true, winner:'remote' };
        }

        // フォールバック
        return await patchWith(localMd, existing.id, false);

        async function patchWith(md, fileId, archived) {
            const boundary = '----recipeapp-patch-' + Math.random().toString(36).slice(2);
            const meta = { mimeType:'text/markdown' }; // name/parents は変更しない
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

    async function syncAll() {
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
                    // 仕様：保存時に updatedAt を更新
                    r.updatedAt = new Date().toISOString();
                    const res = await uploadOrUpdateMarkdown(r);
                    if (res?.created) created++;
                    else if (res?.updated) updated++;
                    else if (res?.skipped) skipped++;
                    if (res?.conflictSaved) conflicts++;
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

    // ===== Drive -> Local（取り込み：既出） =====
    async function importFromDrive() {
        try {
            const token = await ensureAuth();
            const folderId = localStorage.getItem(FOLDER_KEY);
            if (!folderId) { setMsg('保存先が未設定です', true); return; }

            const q = [
                `'${folderId}' in parents`,
                `mimeType = 'text/markdown'`,
                `trashed = false`
            ].join(' and ');
            const fields = 'nextPageToken, files(id,name,modifiedTime)';
            let pageToken = '';
            const remoteFiles = [];

            do {
                const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}${pageToken ? `&pageToken=${pageToken}` : ''}`;
                const j = await (await driveFetch(url, {}, token)).json();
                remoteFiles.push(...(j.files || []));
                pageToken = j.nextPageToken || '';
            } while (pageToken);

            if (remoteFiles.length === 0) {
                setMsg('Driveに取り込み対象の .md が見つかりません'); return;
            }

            const localList = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
            const mapById = new Map(localList.map(r => [r.id, r]));
            let created = 0, updated = 0, skippedOlder = 0, failed = 0;

            for (const f of remoteFiles) {
                try {
                    const md = await getFileContent(f.id, token);
                    const rcv = parseRecipeFromMarkdown(md);
                    if (!rcv.id) { skippedOlder++; continue; }

                    const local = mapById.get(rcv.id);
                    const remoteTime = Date.parse(rcv.updatedAt || f.modifiedTime || 0);
                    const localTime  = local ? Date.parse(local.updatedAt || 0) : 0;

                    if (!local) {
                        mapById.set(rcv.id, rcv); created++;
                    } else if (remoteTime > localTime) {
                        mapById.set(rcv.id, { ...local, ...rcv }); updated++;
                    } else {
                        skippedOlder++;
                    }
                } catch (e) {
                    console.error('import failed', f.name, e);
                    failed++;
                }
            }

            const next = Array.from(mapById.values());
            localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
            setMsg(`取り込み完了：新規 ${created} / 上書き ${updated} / スキップ ${skippedOlder} / 失敗 ${failed}（合計 ${created + updated}/${remoteFiles.length}）`);
        } catch (e) {
            setMsg('取り込み失敗: ' + e.message, true);
        }
    }

    // ===== 旧UIのフォルダ選択（必要なら） =====
    async function chooseFolderPrompt() {
        const current = localStorage.getItem(FOLDER_KEY) || '';
        const id = prompt('DriveフォルダIDを入力（暫定。後でPickerに置換）', current);
        if (!id) return;
        localStorage.setItem(FOLDER_KEY, id);
        $('#drive-import')?.removeAttribute('disabled');
        $('#drive-sync')?.removeAttribute('disabled');
        setMsg('保存先を設定しました');
    }

    // ===== イベント結線 =====
    function bind() {
        const btnConnect = $('#drive-connect');
        const btnPick    = $('#drive-pick-folder'); // 旧UIがある場合のみ
        const btnImport  = $('#drive-import');
        const btnSync    = $('#drive-sync');

        if (btnConnect) btnConnect.addEventListener('click', async () => {
            try {
                await ensureAuth();
                setMsg('接続OK');
                if (localStorage.getItem(FOLDER_KEY)) {
                    btnImport?.removeAttribute('disabled');
                    btnSync?.removeAttribute('disabled');
                }
                btnPick?.removeAttribute('disabled');
            } catch (e) {
                setMsg('接続失敗: ' + e.message, true);
            }
        });

        if (btnPick)   btnPick.addEventListener('click', chooseFolderPrompt);
        if (btnImport) btnImport.addEventListener('click', importFromDrive);
        if (btnSync)   btnSync.addEventListener('click', syncAll);

        if (localStorage.getItem(FOLDER_KEY)) {
            btnImport?.removeAttribute('disabled');
            btnSync?.removeAttribute('disabled');
        }
    }

    document.addEventListener('DOMContentLoaded', bind);

    // 公開API（必要なら）
    window.RecipeDrive = { ensureAuth, syncAll, importFromDrive, toMarkdown };
})();
