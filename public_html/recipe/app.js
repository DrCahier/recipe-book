// ====== 定数 ======
const DATA_URL    = '/data/recipes.json';
const LS_KEY_DATA = 'recipes-cache-v1';
const LS_KEY_FAVS = 'recipe-favs-v1';
const SCROLL_KEY  = 'list-scrollY';

// ====== ユーティリティ ======
function $(sel){ return document.querySelector(sel); }
function $all(sel){ return Array.from(document.querySelectorAll(sel)); }
function esc(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn.apply(null,a), ms); }; }
function qs(){ return new URLSearchParams(location.search); }
function setQ(obj, push){
    const sp = qs();
    Object.keys(obj).forEach(k=>{
        const v = obj[k];
        if (v==null || v==='') sp.delete(k); else sp.set(k, v);
    });
    const qstr = sp.toString();
    const url = qstr ? location.pathname + '?' + qstr : location.pathname;
    if (push===false) history.replaceState({}, '', url); else history.pushState({}, '', url);
}

// ====== データキャッシュ ======
function setDataCache(data){ localStorage.setItem(LS_KEY_DATA, JSON.stringify(data||[])); }
function getDataCache(){ try{ return JSON.parse(localStorage.getItem(LS_KEY_DATA)||'[]'); } catch{ return []; } }

// ====== お気に入り管理 ======
function loadFavs(){ try{ return new Set(JSON.parse(localStorage.getItem(LS_KEY_FAVS)||'[]')); } catch{ return new Set(); } }
function saveFavs(set){ localStorage.setItem(LS_KEY_FAVS, JSON.stringify(Array.from(set))); }
let FAVS = loadFavs();
function isFav(id){ return FAVS.has(id); }
function toggleFav(id){ if (isFav(id)) FAVS.delete(id); else FAVS.add(id); saveFavs(FAVS); }

// ====== 並び替え ======
function parseMinutes(timeStr){ const m = String(timeStr||'').match(/\d+/); return m ? parseInt(m[0],10) : Number.POSITIVE_INFINITY; }
function sortRecipes(list, sortKey, favFirst){
    const arr = list.slice();
    if (sortKey === 'title_asc') arr.sort((a,b)=> a.title.localeCompare(b.title,'ja'));
    else if (sortKey === 'time_asc') arr.sort((a,b)=> parseMinutes(a.time)-parseMinutes(b.time));
    else if (sortKey === 'time_desc') arr.sort((a,b)=> parseMinutes(b.time)-parseMinutes(a.time));
    if (favFirst) arr.sort((a,b)=> (isFav(b.id)?1:0) - (isFav(a.id)?1:0));
    return arr;
}

// ====== レンダ：一覧 ======
function renderList(recipes, q, opts){
    q = (q||'').toLowerCase().trim();
    opts = Object.assign({ favOnly:false, sort:'', favFirst:false }, opts||{});
    const list = $('#recipe-list'); const empty = $('#empty');

    let filtered = recipes.filter(r=>{
        if (opts.favOnly && !isFav(r.id)) return false;
        if (!q) return true;
        const hay = [r.title, r.desc, (r.tags||[]).join(' '), (r.ingredients||[]).join(' ')].join(' ').toLowerCase();
        return hay.includes(q);
    });

    filtered = sortRecipes(filtered, opts.sort, opts.favFirst);

    list.innerHTML = filtered.map(r=>{
        const href =
            '/?v=detail&id=' + encodeURIComponent(r.id) +
            (q ? '&q='+encodeURIComponent(q) : '') +
            (opts.favOnly ? '&fav=1' : '') +
            (opts.sort ? '&sort='+encodeURIComponent(opts.sort) : '') +
            (opts.favFirst ? '&favfirst=1' : '');
        const star = isFav(r.id) ? '★' : '☆';
        const pressed = isFav(r.id) ? 'true':'false';
        return (
            `<li class="item" data-id="${r.id}">
  <div class="item__topline">
    <h3 class="item__title"><a class="item__link" href="${href}" data-id="${r.id}">${esc(r.title)}</a></h3>
    <button class="fav-btn js-fav" data-id="${r.id}" aria-pressed="${pressed}" title="お気に入りに追加/解除">${star} お気に入り</button>
  </div>
  <p class="item__desc">${esc(r.desc||'')}</p>
  <div class="badges">
    <span class="badge" title="調理時間">${esc(r.time||'')}</span>
    ${(r.tags||[]).map(t =>
                '<a role="link" class="badge" href="/?q='+encodeURIComponent(t)+(opts.favOnly?'&fav=1':'')+(opts.sort?'&sort='+encodeURIComponent(opts.sort):'')+(opts.favFirst?'&favfirst=1':'')+'" data-tag="'+esc(t)+'">#'+esc(t)+'</a>'
            ).join('')}
  </div>
  <div><a class="btn item__detail" href="${href}" data-id="${r.id}">詳しく見る</a></div>
</li>`
        );
    }).join('');

    if (empty) empty.hidden = filtered.length > 0;
    const hint = $('#emptyHint');
    if (hint) hint.textContent = opts.favOnly ? '★ボタンでお気に入りに追加すると、ここに表示されます。' : 'キーワードを変えるか、フィルタを解除してください。';

    $all('.item__link, .item__detail').forEach(a=>{
        a.addEventListener('click', (e)=>{
            if (e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0) return;
            e.preventDefault();
            navigate('detail', { id: a.getAttribute('data-id') });
        });
    });
    $all('.js-fav').forEach(btn=>{
        btn.addEventListener('click', ()=>{
            const id = btn.getAttribute('data-id');
            toggleFav(id);
            const on = isFav(id);
            btn.setAttribute('aria-pressed', on?'true':'false');
            btn.textContent = (on?'★':'☆') + ' お気に入り';
            updateFavUI();
            const favOnly  = ($('#favFilterBtn') && $('#favFilterBtn').getAttribute('aria-pressed')==='true');
            const sortSel  = $('#sortSel') ? $('#sortSel').value : '';
            const favFirst = $('#favFirstChk') ? !!$('#favFirstChk').checked : false;
            renderList(getDataCache(), ($('#q')?$('#q').value:''), { favOnly, sort: sortSel, favFirst });
        });
    });
}

// ====== レンダ：詳細 ======
function renderDetail(id){
    const r = getDataCache().find(x=> x.id===id);
    if (!r){ showPage('list'); return; }
    const dh = $('#detail-heading'); if (dh) dh.textContent = r.title;
    const dt = $('#d-time'); if (dt) dt.textContent = r.time||'';
    const tg = $('#d-tags'); if (tg) tg.textContent = (r.tags||[]).map(t=> '#'+t).join(' ');
    const ing= $('#d-ingredients'); if (ing) ing.innerHTML = (r.ingredients||[]).map(i=>'<li>'+esc(i)+'</li>').join('');
    const st = $('#d-steps'); if (st) st.innerHTML = (r.steps||[]).map(s=>'<li>'+esc(s)+'</li>').join('');

    const on = isFav(id);
    const btn = $('#favToggleDetail');
    if (btn){
        btn.setAttribute('aria-pressed', on?'true':'false');
        btn.textContent = (on?'★':'☆') + ' お気に入り';
        btn.onclick = function(){
            toggleFav(id);
            const state = isFav(id);
            btn.setAttribute('aria-pressed', state?'true':'false');
            btn.textContent = (state?'★':'☆') + ' お気に入り';
            updateFavUI();
        };
    }
}

// ====== レンダ：タグ一覧 ======
function renderTags(recipes, favOnly){
    favOnly = !!favOnly;
    const list = $('#tag-list');
    const stats= $('#tagStats');
    const empty= $('#tag-empty');

    const target = favOnly ? recipes.filter(r=> isFav(r.id)) : recipes;

    const map = new Map();
    target.forEach(r => (r.tags||[]).forEach(t => map.set(String(t), (map.get(String(t))||0)+1)));

    const tags = Array.from(map.entries()).map(([name,count])=>({name, count}))
        .sort((a,b)=> b.count - a.count || a.name.localeCompare(b.name,'ja'));

    if (stats) stats.textContent = 'タグ数: ' + tags.length + ' / レシピ数: ' + target.length + (favOnly?'（お気に入りのみ）':'');
    if (empty) empty.hidden = tags.length > 0;

    if (list){
        list.innerHTML = tags.map(t =>
            `<li class="tag-item">
  <a class="tagchip" href="/?q=${encodeURIComponent(t.name)}${favOnly?'&fav=1':''}" data-tag="${esc(t.name)}" aria-label="タグ ${esc(t.name)} を検索">
    <span class="tagname">#${esc(t.name)}</span>
    <span class="tagcount">(${t.count})</span>
  </a>
</li>`
        ).join('');
    }

    $all('#tag-list [data-tag]').forEach(a=>{
        a.addEventListener('click', (e)=>{
            if (e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0) return;
            e.preventDefault();
            const tag = a.getAttribute('data-tag')||'';
            if ($('#q')) $('#q').value = tag;
            const sortSel  = $('#sortSel') ? $('#sortSel').value : '';
            const favFirst = $('#favFirstChk') ? !!$('#favFirstChk').checked : false;
            setQ({ q: tag, v: null, id: null, fav: favOnly?'1':null, sort: sortSel||null, favfirst: favFirst?'1':null });
            renderList(getDataCache(), tag, { favOnly, sort: sortSel, favFirst });
            showPage('list');
        });
    });
}

// ====== ページ切り替え ======
function showPage(name){
    var elList = document.getElementById('page-list');
    var elDetail = document.getElementById('page-detail');
    var elTags = document.getElementById('page-tags');
    if (elList)   elList.hidden   = (name !== 'list');
    if (elDetail) elDetail.hidden = (name !== 'detail');
    if (elTags)   elTags.hidden   = (name !== 'tags');

    var backFav = document.getElementById('backFromFavs');
    if (backFav){
        var favBtn = document.getElementById('favFilterBtn');
        var fav = !!(favBtn && favBtn.getAttribute('aria-pressed') === 'true');
        backFav.hidden = (!fav || name !== 'list');
    }
}

// ====== ルーティング ======
function navigate(view, params){
    params = params||{};
    const sp = qs();
    const q   = sp.get('q') || '';
    const fav = (sp.get('fav') === '1');
    const sort = sp.get('sort') || '';
    const favFirst = (sp.get('favfirst') === '1');

    if (view === 'detail'){
        sessionStorage.setItem(SCROLL_KEY, String(window.scrollY||0));
        setQ({ v:'detail', id: params.id, q: q, fav: fav?'1':null, sort: sort||null, favfirst: favFirst?'1':null });
        renderDetail(params.id);
        showPage('detail');
    } else if (view === 'tags'){
        setQ({ v:'tags', q: q, fav: fav?'1':null, sort: sort||null, favfirst: favFirst?'1':null });
        renderTags(getDataCache(), fav);
        showPage('tags');
    } else {
        setQ({
            v: null,
            id: null,
            q: (typeof params.q==='string') ? params.q : q,
            fav: params.fav ? '1' : (fav ? '1' : null),
            sort: (typeof params.sort==='string' ? params.sort : sort) || null,
            favfirst: (typeof params.favFirst==='boolean' ? params.favFirst : favFirst) ? '1' : null
        });
        showPage('list');
        const y = Number(sessionStorage.getItem(SCROLL_KEY)||0);
        requestAnimationFrame(function(){ window.scrollTo({ top: y, behavior: 'auto' }); });
    }
}

function handleRoute(replace){
    const sp  = qs();
    const v   = sp.get('v');
    const q   = sp.get('q') || '';
    const id  = sp.get('id');
    const fav = (sp.get('fav') === '1');
    const sort = sp.get('sort') || '';
    const favFirst = (sp.get('favfirst') === '1');

    if ($('#q')) $('#q').value = q;
    if ($('#favFilterBtn')) $('#favFilterBtn').setAttribute('aria-pressed', fav?'true':'false');
    if ($('#sortSel')) $('#sortSel').value = sort || '';
    if ($('#favFirstChk')) $('#favFirstChk').checked = !!favFirst;

    renderList(getDataCache(), q, { favOnly: fav, sort: sort, favFirst: favFirst });

    if (v === 'detail' && id){
        renderDetail(id);
        showPage('detail');
    } else if (v === 'tags'){
        renderTags(getDataCache(), fav);
        showPage('tags');
    } else {
        showPage('list');
    }

    updateFavUI();
    setQ({ v:v, id:id, q:q, fav: fav?'1':null, sort: sort||null, favfirst: favFirst?'1':null }, false);
}

// ====== お気に入りUI ======
function updateFavUI(){
    const span = $('#favCount');
    if (span) span.textContent = FAVS.size ? '('+FAVS.size+')' : '';

    const favBtn = $('#favFilterBtn');
    const favOn = !!(favBtn && favBtn.getAttribute('aria-pressed')==='true');
    const backFav = document.getElementById('backFromFavs');
    const pageList = document.getElementById('page-list');
    if (backFav){
        backFav.hidden = !(favOn && pageList && !pageList.hidden);
    }
}

// ====== データ取得（堅牢化） ======
async function loadRecipes(){
    try{
        const controller = new AbortController();
        const t = setTimeout(()=> controller.abort(), 8000);
        const res = await fetch(DATA_URL, { cache:'no-cache', signal: controller.signal });
        clearTimeout(t);
        if (!res.ok) throw new Error('HTTP '+res.status);
        let data;
        try { data = await res.json(); } catch { data = []; }
        if (!Array.isArray(data)) data = [];
        setDataCache(data);
        return getDataCache();
    } catch(e){
        if (e && (e.name==='AbortError' || e.message==='The user aborted a request.')) {
            return getDataCache();
        }
        console.info('Fetch failed, use cache:', e);
        return getDataCache();
    }
}

// ====== 起動 ======
async function init(){
    await loadRecipes();
    handleRoute(true);

    // 検索
    const onSearch = debounce(function(val){
        const q = String(val||'').trim();
        const fav = ($('#favFilterBtn') && $('#favFilterBtn').getAttribute('aria-pressed')==='true');
        const sort = $('#sortSel') ? $('#sortSel').value : '';
        const favFirst = $('#favFirstChk') ? !!$('#favFirstChk').checked : false;
        setQ({ q:q, v:null, id:null, fav: fav?'1':null, sort: sort||null, favfirst: favFirst?'1':null });
        renderList(getDataCache(), q, { favOnly: fav, sort: sort, favFirst: favFirst });
        showPage('list');
    }, 200);
    if ($('#q')) $('#q').addEventListener('input', (e)=> onSearch(e.target.value));

    // 並び替え
    if ($('#sortSel')) $('#sortSel').addEventListener('change', ()=>{
        const q = ($('#q')? $('#q').value.trim() : '');
        const fav = ($('#favFilterBtn') && $('#favFilterBtn').getAttribute('aria-pressed')==='true');
        const sort = ($('#sortSel')? $('#sortSel').value : '');
        const favFirst = ($('#favFirstChk')? !!$('#favFirstChk').checked : false);
        setQ({ sort: sort||null, v:null, id:null, q:q, fav: fav?'1':null, favfirst: favFirst?'1':null });
        renderList(getDataCache(), q, { favOnly: fav, sort: sort, favFirst: favFirst });
        showPage('list');
    });

    // 「★上に」
    if ($('#favFirstChk')) $('#favFirstChk').addEventListener('change', ()=>{
        const q = ($('#q')? $('#q').value.trim() : '');
        const fav = ($('#favFilterBtn') && $('#favFilterBtn').getAttribute('aria-pressed')==='true');
        const sort = ($('#sortSel')? $('#sortSel').value : '');
        const favFirst = ($('#favFirstChk')? !!$('#favFirstChk').checked : false);
        setQ({ favfirst: favFirst?'1':null, v:null, id:null, q:q, fav: fav?'1':null, sort: sort||null });
        renderList(getDataCache(), q, { favOnly: fav, sort: sort, favFirst: favFirst });
        showPage('list');
    });

    // お気に入りフィルタ
    if ($('#favFilterBtn')) $('#favFilterBtn').addEventListener('click', ()=>{
        const now = ($('#favFilterBtn').getAttribute('aria-pressed')==='true');
        const next = !now;
        $('#favFilterBtn').setAttribute('aria-pressed', next?'true':'false');
        const q = ($('#q')? $('#q').value.trim() : '');
        const sort = ($('#sortSel')? $('#sortSel').value : '');
        const favFirst = ($('#favFirstChk')? !!$('#favFirstChk').checked : false);
        const v = qs().get('v');
        if (v === 'tags'){
            setQ({ fav: next?'1':null, q:q, v:'tags', id:null, sort: sort||null, favfirst: favFirst?'1':null });
            renderTags(getDataCache(), next);
            showPage('tags');
        } else {
            setQ({ fav: next?'1':null, q:q, v:null, id:null, sort: sort||null, favfirst: favFirst?'1':null });
            renderList(getDataCache(), q, { favOnly: next, sort: sort, favFirst: favFirst });
            showPage('list');
        }
        updateFavUI();
    });

    // 戻る/進む
    window.addEventListener('popstate', ()=>{
        handleRoute();
        const v = qs().get('v') || '';
        if (v !== 'detail'){
            const y = Number(sessionStorage.getItem(SCROLL_KEY)||0);
            requestAnimationFrame(function(){ window.scrollTo({ top: y, behavior: 'auto' }); });
        }
    });

    // 詳細/タグの戻る
    if ($('#backLink')) $('#backLink').addEventListener('click', (e)=>{ if (e.button!==0) return; e.preventDefault(); navigate('list', {}); });
    if ($('#backFromTags')) $('#backFromTags').addEventListener('click', (e)=>{ if (e.button!==0) return; e.preventDefault(); navigate('list', {}); });

    // ヘッダの「お気に入り戻る」
    var backFav = document.getElementById('backFromFavs');
    if (backFav) backFav.addEventListener('click', (e)=>{
        if (e.button!==0) return;
        e.preventDefault();
        var favBtn = document.getElementById('favFilterBtn');
        if (favBtn) favBtn.setAttribute('aria-pressed','false');
        const q = ($('#q')? $('#q').value.trim() : '');
        const sort = ($('#sortSel')? $('#sortSel').value : '');
        const favFirst = ($('#favFirstChk')? !!$('#favFirstChk').checked : false);
        setQ({ v:null, id:null, q:q, fav:null, sort: sort||null, favfirst: favFirst?'1':null });
        renderList(getDataCache(), q, { favOnly:false, sort: sort, favFirst: favFirst });
        showPage('list');
        updateFavUI();
    });

    // タグページへ（ヘッダ）
    if ($('#navTags')) $('#navTags').addEventListener('click', (e)=>{ if (e.button!==0) return; e.preventDefault(); navigate('tags', {}); });

    // Service Worker
    if ('serviceWorker' in navigator){
        try { await navigator.serviceWorker.register('/service-worker.js'); }
        catch(e){ console.info('SW registration failed:', e); }
    }
}

document.addEventListener('DOMContentLoaded', init);
