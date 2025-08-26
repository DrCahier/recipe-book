/* assets/js/editui.js
   既存UIに依存せず動く“クイック編集”パネル。
   - ヘッダーに「編集」ボタンを追加 → モーダルでレシピ選択＆編集
   - 入力は700msデバウンス＆blurで即保存（updatedAt更新）
   - 保存先: localStorage("recipes-cache-v1") → 既存のΔキューがDriveへ反映
*/
(function(){
    'use strict';

    const LS_KEY = 'recipes-cache-v1';
    const $ = (sel, root=document) => root.querySelector(sel);

    // ---------- 便利関数 ----------
    const debounce = (fn, wait=700) => {
        let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); };
    };
    const readAll = () => JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    const writeAll = (list) => localStorage.setItem(LS_KEY, JSON.stringify(list));

    // ---------- UI 構築 ----------
    function injectButton() {
        const header = document.querySelector('.l-header') || document.body;
        if (!header || $('#quickEditBtn')) return;

        const btn = document.createElement('button');
        btn.id = 'quickEditBtn';
        btn.className = 'btn -ghost';
        btn.style.marginLeft = '0.5rem';
        btn.textContent = '編集';
        btn.addEventListener('click', openModal);
        header.appendChild(btn);
    }

    function openModal() {
        if ($('#qe-modal')) return;
        const el = document.createElement('div');
        el.id = 'qe-modal';
        el.setAttribute('role','dialog');
        el.setAttribute('aria-modal','true');
        el.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:9999;
      display:flex; align-items:center; justify-content:center; padding:16px;
    `;
        el.innerHTML = `
      <div style="background:#fff; max-width:720px; width:100%; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.2);">
        <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid #eee;">
          <strong>クイック編集</strong>
          <button id="qe-close" class="btn -ghost" aria-label="閉じる">✕</button>
        </div>
        <div style="padding:16px; display:grid; gap:12px;">
          <label>レシピを選択
            <select id="qe-select" style="width:100%; padding:8px;"></select>
          </label>
          <label>タイトル
            <input id="qe-title" type="text" style="width:100%; padding:8px;">
          </label>
          <label>時間（例: 15分）
            <input id="qe-time" type="text" style="width:100%; padding:8px;">
          </label>
          <label>タグ（カンマ区切り）
            <input id="qe-tags" type="text" style="width:100%; padding:8px;">
          </label>
          <label>材料（1行1項目）
            <textarea id="qe-ings" rows="5" style="width:100%; padding:8px; font-family:inherit;"></textarea>
          </label>
          <label>手順（1行1ステップ）
            <textarea id="qe-steps" rows="6" style="width:100%; padding:8px; font-family:inherit;"></textarea>
          </label>
          <div id="qe-status" style="font-size:.9rem; color:#666;"></div>
        </div>
      </div>
    `;
        document.body.appendChild(el);
        $('#qe-close').addEventListener('click', () => el.remove());
        populateList();
    }

    function populateList() {
        const list = readAll();
        const sel = $('#qe-select'); sel.innerHTML = '';
        for (const r of list) {
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = `${r.title || '(無題)'} [${r.id}]`;
            sel.appendChild(opt);
        }
        if (list.length) {
            sel.value = list[0].id;
            loadRecipe(sel.value);
        }
        sel.addEventListener('change', () => loadRecipe(sel.value));
    }

    // ---------- 読み込み＆保存 ----------
    function loadRecipe(id) {
        const list = readAll();
        const r = list.find(x => x.id === id);
        if (!r) return;
        $('#qe-title').value = r.title || '';
        $('#qe-time').value  = r.time || '';
        $('#qe-tags').value  = Array.isArray(r.tags) ? r.tags.join(', ') : '';
        $('#qe-ings').value  = (r.ingredients || []).join('\n');
        $('#qe-steps').value = (r.steps || []).join('\n');

        const saveNow = () => saveFromInputs(id, /*immediate*/ true);
        const saveDebounced = debounce(() => saveFromInputs(id), 700);

        // 入力でデバウンス保存／blurで即保存
        for (const sel of ['#qe-title','#qe-time','#qe-tags','#qe-ings','#qe-steps']) {
            const el = $(sel);
            el.oninput = saveDebounced;
            el.onblur  = saveNow;
        }
    }

    function saveFromInputs(id, immediate=false) {
        const hints = JSON.parse(localStorage.getItem('drive-remote-hints') || '{}');
        if (hints[id]) { window.dispatchEvent(new CustomEvent('recipe:remoteNewer', { detail:{ id } })); return; }
        const list = readAll();
        const i = list.findIndex(x => x.id === id);
        if (i === -1) return;

        const vTitle = $('#qe-title').value.trim();
        const vTime  = $('#qe-time').value.trim();
        const vTags  = $('#qe-tags').value.split(',').map(s=>s.trim()).filter(Boolean);
        const vIngs  = $('#qe-ings').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
        const vSteps = $('#qe-steps').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);

        const r = { ...list[i],
            title: vTitle,
            time: vTime,
            tags: vTags,
            ingredients: vIngs,
            steps: vSteps,
            updatedAt: new Date().toISOString()
        };
        list[i] = r;
        writeAll(list);
        window.dispatchEvent(new CustomEvent('recipe:localSaved', { detail: { id } }));


        const st = $('#qe-status');
        st.textContent = immediate ? '保存しました（ローカル）…Driveへ反映中' : '入力を検知→自動保存（ローカル）…Driveへ反映中';

        // もし「Driveと同期」ボタンがあれば手動トリガーも可能（任意）
        // document.querySelector('#drive-sync')?.click();
    }

    // ---------- 起動 ----------
    document.addEventListener('DOMContentLoaded', () => {
        injectButton();

        // Ctrl+S / Cmd+S ショートカットで即保存
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                const sel = document.querySelector('#qe-select');
                if (sel?.value) {
                    saveFromInputs(sel.value, /*immediate*/ true);
                    console.log("ショートカット保存:", sel.value);
                }
            }
        });
    });
})();