// ==[drive/auth]====================================================
// section: Google Identity Services OAuth（アクセストークン取得）
// anchors:
//   - AUTH_HOOKS
// ================================================================ //

import { CLIENT_ID, SCOPE, TOKEN_KEY } from './config.js';

export async function ensureAuth() {
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
                // <ANCHOR:AUTH_HOOKS>
                resolve(t.access_token);
            }
        });
        try { client.requestAccessToken(); } catch (e) { reject(e); }
    });
}
