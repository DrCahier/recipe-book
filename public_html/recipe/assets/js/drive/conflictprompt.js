/* assets/js/drive/conflictprompt.js
   リモートが新しいときに「どちらを残すか」選択モーダルを表示。
   - events:
     - 'recipe:remoteNewer' ... sync.js が検知したときに発火
   - API:
     - openConflictFor(id) ... 手動で開く（必要なら）
*/
import { LOCAL_KEY } from './config.js';

const HINT_KEY = 'drive-remote-hints';
const $ = (s, r=document)=>r.querySelector(s);

// 重複していた setMsg を1つに統一
export function setMsg(sel, html) {
    const n = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (n) n.innerHTML = html;
}

function getHintIds(){
    try{ const m = JSON.parse(localStorage.getItem(HINT_KEY) || '{}'); return Object.keys(m); }catch{ return []; }
}
function hasHint(id){
    try{ const m = JSON.parse(localStorage.getItem(HINT_KEY) || '{}'); return !!m[id]; }catch{ return false; }
}
function clearHint(id){
    try{
        const m = JSON.parse(localStorage.getItem(HINT_KEY) || '{}');
        if (m[id]){ delete m[id]; localStorage.setItem(HINT_KEY, JSON.stringify(m)); }
    }catch{}
}

function buildModal(id){
    const el = document.createElement('div');
    el.id = 'conflict-modal';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';
    el.innerHTML = `
    <div style="background:#fff;max-width:560px;width:100%;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.2);">
      <div style="padding:14px 16px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
        <strong>別の端末で編集されています</strong>
        <button id="cf-close" class="btn -ghost" aria-label="閉じる">✕</button>
      </div>
      <div style="padding:16px;display:grid;gap:12px;">
        <p>このレシピは、他の端末であなた自身により更新されました。どちらの内容を残しますか？</p>
        <div style="display:grid;gap:8px;">
          <button id="cf-keep-remote" class="btn">別の端末の内容を採用（この端末の変更を捨てる）</button>
          <button id="cf-keep-local"  class="btn -primary">今の端末の内容で上書き</button>
        </div>
        <small style="color:#666">※ バックアップファイルは作りません（設定: conflict=never）。</small>
      </div>
    </div>
  `;
    el.addEventListener('click', (e)=>{ if (e.target === el) el.remove(); });
    $('#cf-close', el).addEventListener('click', ()=> el.remove());

    // handlers
    $('#cf-keep-remote', el).addEventListener('click', async ()=>{
        try{
            clearHint(id);
            window.dispatchEvent(new CustomEvent('recipe:reloadRequested', { detail:{ id }}));
        } finally{
            el.remove();
        }
    });

    $('#cf-keep-local', el).addEventListener('click', async ()=>{
        try{
            // ★ ここでの依存を避けるため、必要な時だけ動的 import
            const { uploadOrUpdateMarkdown } = await import('./sync.js');
            const list = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
            const r = Array.isArray(list) ? list.find(x=>x.id===id)
                : (list.recipes && Array.isArray(list.recipes)) ? list.recipes.find(x=>x.id===id)
                    : (list.recipes ? list.recipes[id] : null);
            if (r){
                r.updatedAt = new Date().toISOString();
                await uploadOrUpdateMarkdown(r, { forceLocal:true });
            }
            clearHint(id);
            window.dispatchEvent(new CustomEvent('recipe:forcedUpload', { detail:{ id }}));
        }catch(e){
            console.error(e);
            alert('上書きに失敗しました: ' + (e?.message || e));
        }finally{
            el.remove();
        }
    });

    return el;
}

export function openConflictFor(id){
    if (!hasHint(id)) return;
    const m = document.getElementById('conflict-modal');
    if (m) m.remove();
    document.body.appendChild(buildModal(id));
}

// sync.js からの通知で開く
window.addEventListener('recipe:remoteNewer', (ev)=>{
    const id = ev.detail?.id;
    if (id) openConflictFor(id);
});

// タブ復帰時にヒントが残っていれば開く
document.addEventListener('visibilitychange', ()=>{
    if (document.visibilityState === 'visible'){
        const ids = getHintIds();
        if (ids.length) openConflictFor(ids[0]);
    }
});
