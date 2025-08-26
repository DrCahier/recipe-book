/* assets/js/savebadge.js
   画面に小さなステータスバッジを出す：
   - 保存中… / 保存済み / オフライン
   - editui.js が投げる 'recipe:localSaved' を受け取って状態更新
   - #drive-result（同期ログ）が「同期完了…」になったら保存済みに切り替え
*/
(function () {
    'use strict';

    const BADGE_ID = 'recipe-save-badge';

    function ensureBadge() {
        let b = document.getElementById(BADGE_ID);
        if (b) return b;
        b = document.createElement('div');
        b.id = BADGE_ID;
        b.style.cssText = `
      position: fixed; right: 12px; bottom: 12px;
      padding: 6px 10px; border-radius: 999px;
      background: #eef6ff; color: #1958a6; font: 12px/1.2 system-ui, -apple-system, Segoe UI, sans-serif;
      box-shadow: 0 2px 10px rgba(0,0,0,.08); z-index: 9999;
      transition: opacity .2s ease, transform .2s ease; opacity: .9;
      pointer-events: none;
    `;
        b.textContent = '—';
        document.body.appendChild(b);
        return b;
    }

    function setBadge(text, color) {
        const b = ensureBadge();
        if (color === 'green') {
            b.style.background = '#e7faf0'; b.style.color = '#127a3a';
        } else if (color === 'red') {
            b.style.background = '#fde7e7'; b.style.color = '#a61d24';
        } else if (color === 'gray') {
            b.style.background = '#f0f0f0'; b.style.color = '#555';
        } else {
            b.style.background = '#eef6ff'; b.style.color = '#1958a6';
        }
        b.textContent = text;
    }

    // オンライン/オフライン監視
    function updateOnlineState() {
        if (!navigator.onLine) {
            setBadge('オフライン', 'gray');
        }
    }

    // 同期ログ(#drive-result)に「同期完了」が出たら保存済みに
    function observeSyncLog() {
        const target = document.querySelector('#drive-result');
        if (!target) return;
        const mo = new MutationObserver(() => {
            const t = target.textContent || '';
            if (t.includes('同期完了') || t.includes('取り込み完了')) {
                setBadge('保存済み', 'green');
            }
        });
        mo.observe(target, { childList: true, subtree: true, characterData: true });
    }

    // 保存イベントを受けたら「保存中…」にして、数秒後に「保存済み」へ（自動同期を想定）
    let saveTimer;
    function onLocalSaved() {
        setBadge('保存中…', 'blue');
        clearTimeout(saveTimer);
        // 3秒後に Saved（autosync/Δキューが反映する想定）
        saveTimer = setTimeout(() => {
            if (navigator.onLine) setBadge('保存済み', 'green');
            else setBadge('オフライン（ローカル保存）', 'gray');
        }, 3000);
    }

    document.addEventListener('DOMContentLoaded', () => {
        ensureBadge();
        updateOnlineState();
        observeSyncLog();

        window.addEventListener('online',  () => setBadge('オンライン', 'blue'));
        window.addEventListener('offline', () => setBadge('オフライン', 'gray'));
        window.addEventListener('recipe:localSaved', onLocalSaved);
    });
})();
