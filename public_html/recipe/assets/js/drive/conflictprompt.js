/* assets/js/drive/conflictprompt.js
   リモートが新しいときに「どちらを残すか」選択モーダルを表示。
   - events:
     - 'recipe:remoteNewer' ... sync.js が検知したときに発火
   - API:
     - openConflictFor(id) ... 手動で開く（必要なら）
*/
import { LOCAL_KEY } from './config.js';
import { uploadOrUpdateMarkdown } from './sync.js';

const HINT_KEY = 'drive-remote-hints';
const $ = (s, r=document)=>r.querySelector(s);

function getHintIds(){
    try{ const m = JSON.parse(localStorage.getItem(HINT_KEY) || '{}'); return Object.keys(m); }catch{ return []; }
}
function hasHint(id){
    try{ const m = JSON.parse(localStorage.getItem(HINT_KEY) || '{}'); return !!m[id]; }catch{ return false; }
}
function clearHint(id){
    try{
        const m = JSON.parse(localStorage.getItem(HINT_KEY) || '{}');
        if (m[id]) { delete m[id]; localStorage.setItem(HINT_KEY, JSON.stringify(m)); }
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
    el.addEventListener('click', (e)=>{ if(e.target===el) el.remove(); });
    $('#cf-close', el).addEventListener('click', ()=> el.remove());

    // handlers
    $('#cf-keep-remote', el).addEventListener('click', async ()=>{
        // Driveの最新版をローカルへ取り込む（最も新しい値を信じる）
        try{
            // ここではローカルをDriveに合わせる（＝ヒントを消すだけでOK）
            clearHint(id);
            window.dispatchEvent(new CustomEvent('recipe:reloadRequested', { detail:{ id }}));
        }finally{
            el.remove();
        }
    });

    $('#cf-keep-local', el).addEventListener('click', async ()=>{
        try{
            // ローカルの現在値を force でアップロード
            const list = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
            const r = list.find(x => x.id === id);
            if (r) {
                r.updatedAt = new Date().toISOString(); // 念のため今の時刻に
                await uploadOrUpdateMarkdown(r, { forceLocal: true });
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

// 1) sync.js からの通知で即時に出す
window.addEventListener('recipe:remoteNewer', (ev)=>{
    const id = ev.detail?.id;
    if (id) openConflictFor(id);
});

// 2) タブを前面にした時に未処理のヒントがあれば出す
document.addEventListener('visibilitychange', ()=>{
    if (document.visibilityState === 'visible') {
        const ids = getHintIds();
        if (ids.length) openConflictFor(ids[0]); // まとめてではなく1件ずつ
    }
});
