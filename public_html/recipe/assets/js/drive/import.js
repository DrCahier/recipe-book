// ==[drive/import]==================================================
// section: Drive -> Local 取り込み
// anchors:
//   - IMPORT_HOOKS
// ================================================================ //

import { FOLDER_KEY, LOCAL_KEY, $ , setMsg } from './config.js';
import { ensureAuth } from './auth.js';
import { driveFetch } from './http.js';
import { parseRecipeFromMarkdown } from './format.js';

async function getFileContent(fileId, token) {
    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {}, token);
    return res.text();
}

export async function importFromDrive() {
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
                // <ANCHOR:IMPORT_HOOKS>
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
