// /assets/js/app.js — ESM入口（Drive UI結線・保存先管理）
import * as Drive from './drive/index.js';
window.Drive = Drive; // デバッグ用

const $ = Drive.$ || ((s, r=document)=>r.querySelector(s));
const FOLDER_KEY = Drive.FOLDER_KEY || 'drive-folder-id';
const setMsg = Drive.setMsg || ((el, html)=>{ const n = typeof el==='string' ? $(el) : el; if(n) n.innerHTML = html; });

// "id:xxxx" と生IDの両方を受け取り、生IDへ正規化
function toRawId(v){ if(!v) return ''; return String(v).startsWith('id:') ? v.slice(3) : String(v); }
// 保存は常に「生ID」で行う
function setFolderId(id){ const raw = toRawId(id); raw ? localStorage.setItem(FOLDER_KEY, raw) : localStorage.removeItem(FOLDER_KEY); }
// 取得も生IDで返す（古い値に id: が残ってても吸収）
function getFolderId(){ return toRawId(localStorage.getItem(FOLDER_KEY)); }

function enable(el, on){ if(!el) return; on ? el.removeAttribute('disabled') : el.setAttribute('disabled',''); }

function refreshDriveButtons(){
    const rawId = getFolderId();
    const hasFolder = !!rawId;
    enable($('#drive-pick-folder'), true);
    enable($('#drive-import'), hasFolder);
    enable($('#drive-sync'),   hasFolder);

    const status = hasFolder
        ? `<span style="color:#2c7;">保存先：<code>${rawId}</code></span>`
        : `<span style="color:#c22;">保存先が未設定です</span>`;
    setMsg('#drive-result', status);
}

window.addEventListener('DOMContentLoaded', () => {
    // 保存先フォルダを選ぶ（まずは入力ダイアログ。Pickerがあれば自動で使う）
    $('#drive-pick-folder')?.addEventListener('click', async () => {
        try {
            if (Drive.pickFolder || Drive.openFolderPicker) {
                const res = await (Drive.pickFolder?.() ?? Drive.openFolderPicker());
                const folderId = res?.id || res?.folderId || res;
                if (!folderId) throw new Error('フォルダIDが取得できませんでした');
                setFolderId(folderId);      // ★ 生IDで保存
                refreshDriveButtons();
                console.log('[Drive] 保存先を設定:', getFolderId());
                return;
            }
        } catch (e) {
            console.warn('[Drive] pickerエラー。手入力にフォールバックします。', e);
        }

        const cur = getFolderId();
        const hint = cur ? `現在: ${cur}` : '例）DriveフォルダURL か フォルダID';
        const ans = prompt(`保存先フォルダの URL または ID を入力してください。\n${hint}`, cur || '');
        if (!ans) return;
        const m = String(ans).match(/folders\/([A-Za-z0-9_\-]+)/);
        const id = m ? m[1] : ans.trim();
        if (!id) return alert('フォルダIDが空です');
        setFolderId(id);                 // ★ 生IDで保存
        refreshDriveButtons();
    });

    // 同期
    $('#drive-sync')?.addEventListener('click', async (ev) => {
        ev.preventDefault();
        if ($('#drive-sync')?.hasAttribute('disabled')) return;
        try {
            $('#drive-sync')?.setAttribute('disabled','');
            await Drive.syncAll(); // 認証は内部で処理
            console.log('[Drive] 同期完了');
        } catch (e) {
            console.error('[Drive] 同期エラー', e);
            alert('同期に失敗しました。コンソールログをご確認ください。');
        } finally {
            refreshDriveButtons();
        }
    });

    // 初期状態
    refreshDriveButtons();
});
