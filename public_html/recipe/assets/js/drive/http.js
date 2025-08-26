// ==[drive/http]====================================================
// section: Drive API フェッチ共通（401→再認可リトライ）
// anchors:
//   - HTTP_HOOKS
// ================================================================ //

import { TOKEN_KEY } from './config.js';
import { ensureAuth } from './auth.js';

export async function driveFetch(url, options = {}, token, _retried = false) {
    const res = await fetch(url, {
        ...options,
        headers: { ...(options.headers || {}), 'Authorization': 'Bearer ' + token }
    });

    if (res.status === 401 && !_retried) {
        try {
            sessionStorage.removeItem(TOKEN_KEY);
            const fresh = await ensureAuth();
            return await driveFetch(url, options, fresh, true);
        } catch (e) {}
    }

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Drive API ${res.status} ${res.statusText}: ${text}`);
    }

    // <ANCHOR:HTTP_HOOKS>
    return res;
}
