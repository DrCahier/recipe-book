// ==[drive/finder]==================================================
// section: appProperties でフォルダを再発見 & 付与
// anchors:
//   - FINDER_HOOKS
// ================================================================ //

import { APP_PROP_KEY, APP_PROP_VAL } from './config.js';
import { ensureAuth } from './auth.js';
import { driveFetch } from './http.js';

export async function findFolderByAppProperties() {
    const token = await ensureAuth();
    const q = [
        `mimeType = 'application/vnd.google-apps.folder'`,
        `trashed = false`,
        `appProperties has { key='${APP_PROP_KEY}' and value='${APP_PROP_VAL}' }`
    ].join(' and ');
    const fields = 'files(id, name, appProperties, parents, modifiedTime)';
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=10`;
    const j = await (await driveFetch(url, {}, token)).json();
    return (j.files && j.files[0]) || null; // 最初の1件だけ返す
}

export async function ensureFolderAppProperties(folderId) {
    const token = await ensureAuth();
    try {
        await driveFetch(
            `https://www.googleapis.com/drive/v3/files/${folderId}`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                body: JSON.stringify({ appProperties: { [APP_PROP_KEY]: APP_PROP_VAL } })
            },
            token
        ).then(r=>r.json().catch(()=>{}));
    } catch (e) {
        // 失敗しても致命ではないので握りつぶす（ログは呼び出し側で）
    }
    // <ANCHOR:FINDER_HOOKS>
}
