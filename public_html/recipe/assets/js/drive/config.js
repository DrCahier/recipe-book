// ==[drive/config]==================================================
// section: 定数・共有ユーティリティ
// anchors:
//   - ANCHOR_EXTRA_CONFIG
// ================================================================ //

export const CLIENT_ID = '662348647538-vcm12uih5ecasv9hhmelkll4v5prpbnj.apps.googleusercontent.com';
export const SCOPE     = 'https://www.googleapis.com/auth/drive.file';

// local/session keys
export const LOCAL_KEY  = 'recipes-cache-v1';
export const TOKEN_KEY  = 'gauth-token';
export const FOLDER_KEY = 'drive-folder-id';
export const LAST_SYNC  = 'drive-last-sync-iso';

// appProperties（フォルダ識別に使用）
export const APP_PROP_KEY = 'recipeapp';
export const APP_PROP_VAL = '1';

// UI helper
export const $ = (s) => document.querySelector(s);
export function setMsg(msg, err = false) {
    const el = $('#drive-result');
    if (!el) return;
    el.textContent = msg;
    el.style.color = err ? '#c00' : '#0a6';
}

// 任意の追加設定はこの下に（上書きしやすいアンカー）
// <ANCHOR:ANCHOR_EXTRA_CONFIG>
