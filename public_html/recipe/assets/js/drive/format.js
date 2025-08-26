// ==[drive/format]==================================================
// section: Markdown 生成/解析 & 文字列ユーティリティ
// anchors:
//   - FORMAT_EXT
// ================================================================ //

export function yamlEscape(v) {
    if (v == null) return '';
    const s = String(v);
    return /[:#\-\[\]\{\},&*?]|^\s|\s$|["'\n]/.test(s) ? JSON.stringify(s) : s;
}
export function yamlArray(arr) {
    if (!Array.isArray(arr)) return '[]';
    return '[' + arr.map(v => JSON.stringify(String(v))).join(', ') + ']';
}
export function toMarkdown(recipe) {
    const fm = {
        id: recipe.id,
        title: recipe.title || '',
        time: recipe.time || '',
        tags: Array.isArray(recipe.tags) ? recipe.tags : [],
        updatedAt: recipe.updatedAt || new Date().toISOString()
    };
    const lines = [
        '---',
        'id: ' + yamlEscape(fm.id),
        'title: ' + yamlEscape(fm.title),
        fm.time ? 'time: ' + yamlEscape(fm.time) : null,
        'tags: ' + yamlArray(fm.tags),
        'updatedAt: ' + yamlEscape(fm.updatedAt),
        '---',
        '',
        '## 材料',
        ...(recipe.ingredients || []).map(i => '- ' + (i ?? '')),
        '',
        '## 手順',
        ...(recipe.steps || []).map((s, i) => (i + 1) + '. ' + (s ?? '')),
        ''
    ].filter(Boolean);
    return lines.join('\n');
}

export function slug(s) {
    return (s || '')
        .toString()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}

export function parseYamlFrontMatter(mdText) {
    const m = mdText.match(/^---\s*[\r\n]+([\s\S]*?)\r?\n---\s*[\r\n]*/);
    if (!m) return { fm: {}, rest: mdText };
    const yaml = m[1];
    const rest = mdText.slice(m[0].length);

    const fm = {};
    yaml.split(/\r?\n/).forEach(line => {
        const idx = line.indexOf(':');
        if (idx < 0) return;
        const key = line.slice(0, idx).trim();
        let val = line.slice(idx + 1).trim();
        if (/^\[.*\]$/.test(val)) {
            const inner = val.slice(1, -1).trim();
            const arr = inner ? inner.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')) : [];
            fm[key] = arr;
        } else {
            fm[key] = val.replace(/^['"]|['"]$/g, '');
        }
    });
    return { fm, rest };
}

export function parseRecipeFromMarkdown(mdText) {
    const { fm, rest } = parseYamlFrontMatter(mdText);
    const sections = {};
    let current = null;
    for (const line of rest.split(/\r?\n/)) {
        const h = line.match(/^##\s*(.+)$/);
        if (h) { current = h[1].trim(); sections[current] = []; continue; }
        if (current) sections[current].push(line);
    }
    const ingredients = (sections['材料'] || []).filter(l => /^\s*-\s+/.test(l)).map(l => l.replace(/^\s*-\s+/, '').trim()).filter(Boolean);
    const steps = (sections['手順'] || []).filter(l => /^\s*\d+\.\s+/.test(l)).map(l => l.replace(/^\s*\d+\.\s+/, '').trim()).filter(Boolean);

    // <ANCHOR:FORMAT_EXT>
    return {
        id: fm.id || '',
        title: fm.title || '',
        time: fm.time || '',
        tags: Array.isArray(fm.tags) ? fm.tags : (typeof fm.tags === 'string' && fm.tags ? [fm.tags] : []),
        updatedAt: fm.updatedAt || '',
        ingredients, steps
    };
}
