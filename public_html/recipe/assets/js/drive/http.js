// ==[drive/http]====================================================
// section: Drive API フェッチ共通（401→再認可リトライ）
// ================================================================ //

import { TOKEN_KEY, FOLDER_KEY, FILENAME_STRATEGY, APP_PROP_KEY, APP_PROP_VAL } from './config.js';
import { ensureAuth } from './auth.js';

// 共通 fetch ラッパ
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

    return res;
}

// ---------- util ----------
function buildName(recipe) {
    const id = recipe.id || 'untitled';
    const title = (recipe.title || '').trim();
    if (FILENAME_STRATEGY === 'title_id' && title) return `${title} (${id}).md`;
    return `${id}.md`;
}

function toMarkdown(recipe) {
    if (recipe.body) return String(recipe.body);
    const lines = [];
    lines.push(`# ${recipe.title || recipe.id || 'Untitled'}`);
    if (recipe.time) lines.push(`**時間**: ${recipe.time}`);
    if (Array.isArray(recipe.tags) && recipe.tags.length) lines.push(`**タグ**: ${recipe.tags.join(', ')}`);
    if (Array.isArray(recipe.ingredients) && recipe.ingredients.length) {
        lines.push('\n## 材料'); recipe.ingredients.forEach(x => lines.push(`- ${x}`));
    }
    if (Array.isArray(recipe.steps) && recipe.steps.length) {
        lines.push('\n## 手順'); recipe.steps.forEach((s, i) => lines.push(`${i+1}. ${s}`));
    }
    return lines.join('\n\n') + '\n';
}

async function findExistingId(name, folderId, token) {
    const q = [
        `name = '${name.replace(/'/g, "\\'")}'`,
        `'${folderId}' in parents`,
        'trashed = false'
    ].join(' and ');
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,appProperties)`;
    const res = await driveFetch(url, { method: 'GET' }, token);
    const { files = [] } = await res.json();
    return files[0]?.id || null;
}

function buildMultipart({ metadata, content, mime = 'text/markdown' }) {
    const boundary = '-------formBoundary' + Math.random().toString(16).slice(2);
    const dash = `--${boundary}`;
    const body = [
        dash, 'Content-Type: application/json; charset=UTF-8', '',
        JSON.stringify(metadata),
        dash, `Content-Type: ${mime}; charset=UTF-8`, '',
        content,
        dash + '--', ''
    ].join('\r\n');
    return { body, boundary };
}

// ---------- 公開 API ----------
export async function uploadOrUpdateMarkdown(recipe, opts = {}) {
    const token = sessionStorage.getItem('gauth-token');
    if (!token) throw new Error('not authorized');

    const folderId = localStorage.getItem(FOLDER_KEY);
    if (!folderId) throw new Error('保存先フォルダが未設定です');

    const name = buildName(recipe);
    const content = toMarkdown(recipe);
    const metadata = {
        name,
        mimeType: 'text/markdown',
        parents: [folderId],
        appProperties: { [APP_PROP_KEY]: APP_PROP_VAL, id: recipe.id || '' }
    };

    const existingId = await findExistingId(name, folderId, token);
    const base = 'https://www.googleapis.com/upload/drive/v3/files';
    const url = existingId
        ? `${base}/${existingId}?uploadType=multipart`
        : `${base}?uploadType=multipart`;
    const method = existingId ? 'PATCH' : 'POST';

    const { body, boundary } = buildMultipart({ metadata, content });

    const res = await driveFetch(url, {
        method,
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body
    }, token);

    const json = await res.json();
    return { status: existingId ? 'updated' : 'created', id: json.id, name: json.name };
}
