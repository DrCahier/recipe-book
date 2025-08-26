// ==[drive/config]==================================================
// section: 定数・共有ユーティリティ
// anchors:
//   - ANCHOR_EXTRA_CONFIG
// ================================================================ //

export const CLIENT_ID = '662348647538-vcm12uih5ecasv9hhmelkll4v5prpbnj.apps.googleusercontent.com';
export const SCOPE     = 'https://www.googleapis.com/auth/drive.file';

export const LOCAL_KEY  = 'recipes-cache-v1';
export const TOKEN_KEY  = 'gauth-token';
export const FOLDER_KEY = 'drive-folder-id';
export const LAST_SYNC  = 'drive-last-sync-iso';

export const APP_PROP_KEY = 'recipeapp';
export const APP_PROP_VAL = '1';



export const FILENAME_STRATEGY = 'title_id'; // 「タイトル (id).md」に常時リネーム

// ★ 追加：コンフリクト保存ポリシー
// 'remote_only'（推奨）: リモートが新しいときだけバックアップ
// 'always'            : これまで通り常にバックアップ
// 'never'             : どちらも作らない（Driveの版管理に頼る）
export const CONFLICT_BACKUP_MODE = 'never'; // never（残す） / remote_only（リモートに conflict を残す

export const INTERACTIVE_CONFLICT_PROMPT = true; // リモート新しければ、選択モーダルでどちらを残すか聞く

export const $ = (s) => document.querySelector(s);
export function setMsg(msg, err = false) {
    const el = $('#drive-result');
    if (!el) return;
    el.textContent = msg;
    el.style.color = err ? '#c00' : '#0a6';
}

// <ANCHOR:ANCHOR_EXTRA_CONFIG>
