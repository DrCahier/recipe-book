// ==[drive/index]===================================================
// section: エントリポイント（イベント結線 & 公開API）
// anchors:
//   - ENTRY_HOOKS
// ================================================================ //

import { $ } from './config.js';
import { ensureAuth } from './auth.js';
import { syncAll } from './sync.js';
import { importFromDrive } from './import.js';
import { openFolderPicker } from './picker.js';
import { toMarkdown } from './format.js';

function bind() {
    const btnConnect = $('#drive-connect');
    const btnPick    = $('#drive-pick-folder');
    const btnImport  = $('#drive-import');
    const btnSync    = $('#drive-sync');

    if (btnConnect) btnConnect.addEventListener('click', async () => {
        try {
            await ensureAuth();
            const hasFolder = !!localStorage.getItem('drive-folder-id');
            if (hasFolder) {
                btnImport?.removeAttribute('disabled');
                btnSync?.removeAttribute('disabled');
            }
            btnPick?.removeAttribute('disabled');
            const { setMsg } = await import('./config.js'); // 遅延importで循環回避
            setMsg('接続OK');
        } catch (e) {
            const { setMsg } = await import('./config.js');
            setMsg('接続失敗: ' + e.message, true);
        }
    });

    if (btnPick)   btnPick.addEventListener('click', openFolderPicker);
    if (btnImport) btnImport.addEventListener('click', importFromDrive);
    if (btnSync)   btnSync.addEventListener('click', syncAll);

    if (localStorage.getItem('drive-folder-id')) {
        btnImport?.removeAttribute('disabled');
        btnSync?.removeAttribute('disabled');
    }

    // <ANCHOR:ENTRY_HOOKS>
}

document.addEventListener('DOMContentLoaded', bind);

// グローバル公開（既存互換）
window.RecipeDrive = { ensureAuth, syncAll, importFromDrive, toMarkdown, openFolderPicker };
