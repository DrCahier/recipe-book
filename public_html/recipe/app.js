// ====== 定数 ======
const DATA_URL = '/data/recipes.json';
const LS_KEY_DATA = 'recipes-cache-v1';
const LS_KEY_FAVS = 'recipe-favs-v1';
const SCROLL_KEY = 'list-scrollY';

// ====== ユーティリティ ======
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s='') => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const debounce = (fn, ms=200) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
const qs = () => new URLSearchParams(location.search);
const setQ = (obj, push=true) => {
    const sp = qs();
    Object.entries(obj).forEach(([k,v]) => (v==null || v==='') ? sp.delete(k) : sp.set(k, v));
    const url = `${location.pathname}?${sp.toString()}`;
    (push ? history.pushState({}, '', url) : history.replaceState({}, '', url));
};

// ====== データキャッシュ ======
const setDataCache = (data)=> localStorage.setItem(LS_KEY_DATA, JSON.stringify(data||[]));
const getDataCache = ()=> { try { return JSON.parse(localStorage.getItem(LS_KEY_DATA) || '[]'); } catch { return []; } };

// ====== お気に入り管理 ======
const loadFavs = () => new Set(JSON.parse(localStorage.getItem(LS_KEY_FAVS) || '[]'));
const saveFavs = (set) => localStorage.setItem(LS_KEY_FAVS, JSON.stringify(Array.from(set)));
let FAVS = loadFavs();
const isFav = (id) => FAVS.has(id);
const toggleFav = (id) => { isFav(id) ? FAVS.delete(id) : FAVS.add(id); saveFavs(FAVS); };

// ====== 並び替えヘルパ ======
function parseMinutes(timeStr='') {
    // 例: "10分", "5分+漬け時間" → 10 / 5
    const m = String(timeStr).match(/\d+/);
    return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY; // 不明は最後尾へ
}
function sortRecipes(list, sortKey, favFirst=false) {
    const arr = [...list];
    // メインキー
    if (sortKey === 'title_asc') {
        arr.sort((a,b) => a.title.localeCompare(b.title, 'ja'));
    } else if (sortKey === 'time_asc') {
        arr.sort((a,b) => parseMinutes(a.time) - parseMinutes(b.time));
    } else if (sortKey === 'time_desc') {
        arr.sort((a,b) => parseMinutes(b.time) - parseMinutes(a.time));
    }
    // お気に入りを上に（安定的に）
    if (favFirst) {
        arr.sort((a,b) => (isFav(b.id)?1:0) - (isFav(a.id)?1:0));
    }
    return arr;
}

// ====== レンダ：一覧 ======
function renderList(recipes, q='', opts={ favOnly:false, sort:'', favFirst:false }) {
    const list = $('#recipe-list');
    const empty = $('#empty');
    const query = (q||'').toLowerCase().trim();

    let filtered = recipes.filter(r => {
        if (opts.favOnly && !isFav(r.id)) return false;
        if (!query) return true;
        const hay = [r.title, r.desc, (r.tags||[]).join(' ')].join(' ').toLowerCase();
        return hay.includes(query);
    });

    // 並び替え
    filtered = sortRecipes(filtered, opts.sort, opts.favFirst);

    list.innerHTML = filtered.map(r => {
        const href = `/?v=detail&id=${encodeURIComponent(r.id)}`
            + (query ? `&q=${encodeURIComponent(query)}` : '')
            + (opts.favOnly ? `&fav=1` : '')
            + (opts.sort ? `&sort=${encodeURIComponent(opts.sort)}` : '')
            + (opts.favFirst ? `&favfirst=1` : '');
        const pressed = isFav(r.id) ? 'true' : 'false';
        const star = isFav(r.id) ? '★' : '☆';
        return `
      <li class="item" data-id="${r.id}">
        <div class="item__topline">
          <h3 class="item__title"><a class="item__link" href="${href}" data-id="${r.id}">${esc(r.title)}</a></h3>
          <button class="fav-btn js-fav" data-id="${r.id}" aria-pressed="${pressed}" title="お気に入りに追加/解除">${star} お気に入り</button>
        </div>
        <p class="item__desc">${esc(r.desc||'')}</p>
        <div class="badges">
          <span class="badge" title="調理時間">${esc(r.time||'')}</span>
          ${(r.tags||[]).map(t =>
            `<a role="link" class="badge"
               href="/?q=${encodeURIComponent(t)}${opts.favOnly? '&fav=1':''}${opts.sort? `&sort=${encodeURIComponent(opts.sort)}`:''}${opts.favFirst? '&favfirst=1':''}"
               data-tag="${esc(t)}">#${esc(t)}</a>`
        ).join('')}
        </div>
        <div><a class="btn item__detail" href="${href}" data-id="${r.id}">詳しく見る</a></div>
      </li>`;
    }).join('');

    empty.hidden = filtered.length > 0;

    // 空表示ヒント
    const favOnly = opts.favOnly === true;
    const hint = document.querySelector('#emptyHint');
    if (hint) {
        hint.textContent = favOnly
            ? '★ボタンでお気に入りに追加すると、ここに表示されます。'
            : 'キーワードを変えるか、フィルタを解除してください。';
    }

    // SPA遷移
    $$('.item__link, .item__detail').forEach(a => {
        a.addEventListener('click', (e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            navigate('detail', { id: a.dataset.id });
        });
    });

    // タグ → 検索遷移
    $$('[data-tag]').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            const t = el.getAttribute('data-tag') || '';
            $('#q').value = t;
            const favFlag  = $('#favFilterBtn').getAttribute('aria-pressed') === 'true';
            const sortSel  = $('#sortSel').value || '';
            const favFirst = $('#favFirstChk').checked;
            setQ({
                q: t, v: null, id: null,
                fav: favFlag ? '1' : null,
                sort: sortSel || null,
                favfirst: favFirst ? '1' : null
            });
            renderList(getDataCache(), t, { favOnly: favFlag, sort: sortSel, favFirst });
            showPage('list');
            updateFavUI();
        });
    });

    // お気に入りトグル
    $$('.js-fav').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            toggleFav(id);
            const on = isFav(id);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            btn.textContent = (on ? '★' : '☆') + ' お気に入り';
            updateFavUI();
            const favOnly = $('#favFilterBtn').getAttribute('aria-pressed') === 'true';
            const sortSel  = $('#sortSel').value || '';
            const favFirst = $('#favFirstChk').checked;
            // 再描画（並び順も維持）
            renderList(getDataCache(), $('#q').value, { favOnly, sort: sortSel, favFirst });
        });
    });
}

// ====== レンダ：詳細 ======
function renderDetail(id) {
    const r = getDataCache().find(x => x.id === id);
    if (!r) return showPage('list');

    $('#detail-heading').textContent = r.title;
    $('#d-time').textContent = r.time || '';
    $('#d-tags').textContent = (r.tags||[]).map(t => `#${t}`).join(' ');
    $('#d-ingredients').innerHTML = (r.ingredients||[]).map(i => `<li>${esc(i)}</li>`).join('');
    $('#d-steps').innerHTML = (r.steps||[]).map(s => `<li>${esc(s)}</li>`).join('');

    const on = isFav(id);
    const btn = $('#favToggleDetail');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = (on ? '★' : '☆') + ' お気に入り';
    btn.onclick = () => {
        toggleFav(id);
        const state = isFav(id);
        btn.setAttribute('aria-pressed', state ? 'true' : 'false');
        btn.textContent = (state ? '★' : '☆') + ' お気に入り';
        updateFavUI();
    };
}

// ====== レンダ：タグ一覧 ======
function renderTags(recipes, favOnly=false) {
    const list = $('#tag-list');
    const stats = $('#tagStats');
    const empty = $('#tag-empty');

    const target = favOnly ? recipes.filter(r => isFav(r.id)) : recipes;

    const map = new Map();
    for (const r of target) (r.tags || []).forEach(t => map.set(String(t), (map.get(String(t)) || 0) + 1));

    const tags = Array.from(map.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a,b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'));

    stats.textContent = `タグ数: ${tags.length} / レシピ数: ${target.length}${favOnly ? '（お気に入りのみ）' : ''}`;
    empty.hidden = tags.length > 0;

    list.innerHTML = tags.map(t => `
    <li class="tag-item">
      <a class="tagchip" href="/?q=${encodeURIComponent(t.name)}${favOnly ? '&fav=1':''}" data-tag="${esc(t.name)}" aria-label="タグ ${esc(t.name)} を検索">
        <span class="tagname">#${esc(t.name)}</span>
        <span class="tagcount">(${t.count})</span>
      </a>
    </li>
  `).join('');

    $$('#tag-list [data-tag]').forEach(a => {
        a.addEventListener('click', (e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            const tag = a.getAttribute('data-tag') || '';
            $('#q').value = tag;
            const sortSel  = $('#sortSel').value || '';
            const favFirst = $('#favFirstChk').checked;
            setQ({ q: tag, v: null, id: null, fav: favOnly ? '1' : null, sort: sortSel || null, favfirst: favFirst ? '1' : null });
            renderList(getDataCache(), tag, { favOnly, sort: sortSel, favFirst });
            showPage('list');
        });
    });
}

// ====== ページ切り替え ======
function showPage(name) {
    $('#page-list').hidden   = name !== 'list';
    $('#page-detail').hidden = name !== 'detail';
    $('#page-tags').hidden   = name !== 'tags';
}

// ====== ルーター ======
function navigate(view, params={}) {
    const sp = qs();
    const q   = sp.get('q') || '';
    const fav = sp.get('fav') === '1';
    const sort = sp.get('sort') || '';
    const favFirst = sp.get('favfirst') === '1';

    if (view === 'detail') {
        sessionStorage.setItem(SCROLL_KEY, String(window.scrollY || 0));
        setQ({ v:'detail', id: params.id, q, fav: fav ? '1' : null, sort: sort || null, favfirst: favFirst ? '1' : null });
        renderDetail(params.id);
        showPage('detail');
    } else if (view === 'tags') {
        setQ({ v:'tags', q, fav: fav ? '1' : null, sort: sort || null, favfirst: favFirst ? '1' : null });
        renderTags(getDataCache(), fav);
        showPage('tags');
    } else {
        setQ({
            v: null,
            id: null,
            q: params.q ?? q,
            fav: params.fav ? '1' : (fav ? '1' : null),
            // ✅ 括弧で優先順序を明示
            sort: (params.sort ?? sort) || null,
            favfirst: (params.favFirst ?? favFirst) ? '1' : null
        });

        showPage('list');
        const y = Number(sessionStorage.getItem(SCROLL_KEY) || 0);
        requestAnimationFrame(()=> window.scrollTo({ top: y, behavior: 'instant' }));
    }
}

function handleRoute(replace=false) {
    const sp  = qs();
    const v   = sp.get('v');
    const q   = sp.get('q') || '';
    const id  = sp.get('id');
    const fav = sp.get('fav') === '1';
    const sort = sp.get('sort') || '';
    const favFirst = sp.get('favfirst') === '1';

    // UI復元
    $('#q').value = q;
    $('#favFilterBtn').setAttribute('aria-pressed', fav ? 'true' : 'false');
    $('#sortSel').value = sort || '';
    $('#favFirstChk').checked = favFirst;

    renderList(getDataCache(), q, { favOnly: fav, sort, favFirst });
    if (v === 'detail' && id) {
        renderDetail(id);
        showPage('detail');
    } else if (v === 'tags') {
        renderTags(getDataCache(), fav);
        showPage('tags');
    } else {
        showPage('list');
    }

    updateFavUI();
    if (replace) setQ({ v, id, q, fav: fav ? '1' : null, sort: sort || null, favfirst: favFirst ? '1' : null }, false);
}

// ====== お気に入りUI（件数） ======
function updateFavUI() {
    const count = FAVS.size;
    const span = document.querySelector('#favCount');
    if (span) span.textContent = count ? `(${count})` : '';
}

// ====== データ取得 ======
async function loadRecipes() {
    try {
        const res = await fetch(DATA_URL, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setDataCache(data);
        return data;
    } catch (e) {
        console.warn('Fetch failed, use cache:', e);
        return getDataCache();
    }
}

// ====== 起動 ======
async function init() {
    await loadRecipes();
    handleRoute(true);

    // 検索
    const onSearch = debounce((val) => {
        const q = val.trim();
        const fav = $('#favFilterBtn').getAttribute('aria-pressed') === 'true';
        const sort = $('#sortSel').value || '';
        const favFirst = $('#favFirstChk').checked;
        setQ({ q, v: null, id: null, fav: fav ? '1' : null, sort: sort || null, favfirst: favFirst ? '1' : null });
        renderList(getDataCache(), q, { favOnly: fav, sort, favFirst });
        showPage('list');
    }, 200);
    $('#q').addEventListener('input', (e) => onSearch(e.target.value));

    // 並び替え変更
    $('#sortSel').addEventListener('change', () => {
        const q = $('#q').value.trim();
        const fav = $('#favFilterBtn').getAttribute('aria-pressed') === 'true';
        const sort = $('#sortSel').value || '';
        const favFirst = $('#favFirstChk').checked;
        setQ({ sort: sort || null, v: null, id: null, q, fav: fav ? '1' : null, favfirst: favFirst ? '1' : null });
        renderList(getDataCache(), q, { favOnly: fav, sort, favFirst });
        showPage('list');
    });

    // 「★上に」切替
    $('#favFirstChk').addEventListener('change', () => {
        const q = $('#q').value.trim();
        const fav = $('#favFilterBtn').getAttribute('aria-pressed') === 'true';
        const sort = $('#sortSel').value || '';
        const favFirst = $('#favFirstChk').checked;
        setQ({ favfirst: favFirst ? '1' : null, v: null, id: null, q, fav: fav ? '1' : null, sort: sort || null });
        renderList(getDataCache(), q, { favOnly: fav, sort, favFirst });
        showPage('list');
    });

    // お気に入りフィルタ切替（現在ビューを維持）
    $('#favFilterBtn').addEventListener('click', () => {
        const now = $('#favFilterBtn').getAttribute('aria-pressed') === 'true';
        const next = !now;
        $('#favFilterBtn').setAttribute('aria-pressed', next ? 'true' : 'false');
        const q = $('#q').value.trim();
        const sort = $('#sortSel').value || '';
        const favFirst = $('#favFirstChk').checked;
        const v = qs().get('v');
        if (v === 'tags') {
            setQ({ fav: next ? '1' : null, q, v:'tags', id:null, sort: sort || null, favfirst: favFirst ? '1' : null });
            renderTags(getDataCache(), next);
            showPage('tags');
        } else {
            setQ({ fav: next ? '1' : null, q, v: null, id: null, sort: sort || null, favfirst: favFirst ? '1' : null });
            renderList(getDataCache(), q, { favOnly: next, sort, favFirst });
            showPage('list');
        }
        updateFavUI();
    });

    // 戻る/進む
    window.addEventListener('popstate', () => {
        handleRoute();
        if ((qs().get('v') || '') !== 'detail') {
            const y = Number(sessionStorage.getItem(SCROLL_KEY) || 0);
            requestAnimationFrame(()=> window.scrollTo({ top: y, behavior: 'instant' }));
        }
    });

    // 戻るリンク
    $('#backLink').addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navigate('list', {});
    });
    $('#backFromTags').addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navigate('list', {});
    });

    // タグページへ（ヘッダ）
    $('#navTags').addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navigate('tags', {});
    });

    // SW登録
    if ('serviceWorker' in navigator) {
        try { await navigator.serviceWorker.register('/service-worker.js'); }
        catch (e) { console.warn('SW registration failed:', e); }
    }
}

document.addEventListener('DOMContentLoaded', init);
