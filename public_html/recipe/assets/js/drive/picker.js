// ==[drive/picker]==================================================
// section: Google Picker（フォルダ選択） + appProperties 付与 + フォールバック
// anchors:
//   - PICKER_HOOKS
// ================================================================ //

import { FOLDER_KEY, APP_PROP_KEY, APP_PROP_VAL, $ , setMsg } from './config.js';
import { ensureAuth } from './auth.js';
import { driveFetch } from './http.js';

let gapiLoaded = false;
function loadGapiIfNeeded() {
    return new Promise((resolve) => {
        if (gapiLoaded) return resolve();
        if (!(window.gapi)) return resolve(); // api.js が未ロードなら無視（後でフォールバック）
        gapi.load('client:picker', () => { gapiLoaded = true; resolve(); });
    });
}

async function setFolderAppProperties(folderId, token) {
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
        console.warn('set appProperties failed:', e);
    }
}

export async function openFolderPicker() {
    const apiKey = window.RECIPEAPP_CONFIG?.PICKER_API_KEY || '';
    const token = await ensureAuth();

    await loadGapiIfNeeded();
    const canUsePicker = !!(apiKey && window.google && window.google.picker && gapiLoaded);
    if (!canUsePicker) return await chooseFolderPrompt(); // フォールバック

    return new Promise((resolve) => {
        const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
            .setIncludeFolders(true)
            .setSelectFolderEnabled(true);

        const picker = new google.picker.PickerBuilder()
            .setAppId('')
            .setOAuthToken(token)
            .setDeveloperKey(apiKey)
            .setOrigin(window.location.protocol + '//' + window.location.host)
            .setCallback(async (data) => {
                if (data.action === google.picker.Action.PICKED && data.docs && data.docs[0]) {
                    const picked = data.docs[0];
                    const folderId = picked.id;
                    localStorage.setItem(FOLDER_KEY, folderId);

                    await setFolderAppProperties(folderId, token);
                    $('#drive-import')?.removeAttribute('disabled');
                    $('#drive-sync')?.removeAttribute('disabled');
                    setMsg('保存先を設定しました');
                    // <ANCHOR:PICKER_HOOKS>
                    resolve(folderId);
                } else if (data.action === google.picker.Action.CANCEL) {
                    setMsg('フォルダ選択をキャンセルしました');
                    resolve(null);
                }
            })
            .addView(view)
            .setTitle('保存先フォルダを選択')
            .build();

        picker.setVisible(true);
    });
}

// 旧UIフォールバック（IDを直接入力）
export async function chooseFolderPrompt() {
    const current = localStorage.getItem(FOLDER_KEY) || '';
    const id = prompt('DriveフォルダIDを入力（暫定。後でPickerに置換）', current);
    if (!id) return;
    localStorage.setItem(FOLDER_KEY, id);
    $('#drive-import')?.removeAttribute('disabled');
    $('#drive-sync')?.removeAttribute('disabled');
    setMsg('保存先を設定しました');
}
