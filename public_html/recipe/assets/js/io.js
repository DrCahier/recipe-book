/* io.js - Import/Export for Recipe App (現状連携版) */
(function(){
    'use strict';

    // === あなたの現状に合わせた設定 ===
    const STORAGE_KEY = 'recipes-cache-v1'; // app.js と同じ
    const EXPORT_TYPE = 'RecipeAppExport';
    const EXPORT_VERSION = 1;

    // === 小道具 ===
    const $id = (id)=> document.getElementById(id);
    const nowISO = ()=> new Date().toISOString();
    const ts = ()=> { const d=new Date(); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };

    const readData = ()=> { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } };
    const writeData = (list)=> { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); return true; } catch { return false; } };

    const norm = s => (s??'').toString().trim().toLowerCase();
    const fpRecipe = r => `${norm(r.title||r.name)}##${Array.isArray(r.ingredients)? r.ingredients.map(norm).sort().join('|') : norm(r.ingredients)}`;

    function mergeRecipes(base, incoming){
        const byId = new Map();
        const byFp = new Map();
        for (const r of base){ if(r.id) byId.set(String(r.id), r); byFp.set(fpRecipe(r), r); }

        let added=0, updated=0, skipped=0;
        for (const it of incoming){
            const idKey = it.id ? String(it.id) : null;
            const fp = fpRecipe(it);
            if (idKey && byId.has(idKey)){
                const cur = byId.get(idKey);
                const curT = Date.parse(cur.updatedAt||cur.createdAt||0);
                const inT  = Date.parse(it.updatedAt||it.createdAt||0);
                if (inT && (!curT || inT > curT)) { Object.assign(cur, it); updated++; } else { skipped++; }
                continue;
            }
            if (byFp.has(fp)){
                const cur = byFp.get(fp);
                const curT = Date.parse(cur.updatedAt||cur.createdAt||0);
                const inT  = Date.parse(it.updatedAt||it.createdAt||0);
                if (inT && (!curT || inT > curT)) { Object.assign(cur, it); updated++; } else { skipped++; }
                continue;
            }
            // 新規
            if (!it.id) it.id = genId();
            if (!it.createdAt) it.createdAt = nowISO();
            base.push(it);
            added++;
            if (it.id) byId.set(String(it.id), it);
            byFp.set(fpRecipe(it), it);
        }
        return { added, updated, skipped };
    }

    function genId(){
        const chars='abcdefghijklmnopqrstuvwxyz0123456789';
        const arr = new Uint8Array(12); (self.crypto||window.crypto).getRandomValues(arr);
        return Array.from(arr, n=> chars[n%chars.length]).join('');
    }

    // === Export ===
    function doExport(){
        const items = readData();
        const payload = { type: EXPORT_TYPE, version: EXPORT_VERSION, exportedAt: nowISO(), app:{ name:'Recipe App' }, items };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `recipes-${ts()}.json`;
        document.body.appendChild(a); a.click();
        setTimeout(()=> { URL.revokeObjectURL(url); a.remove(); }, 0);
        showMsg('JSONを書き出しました。');
    }

    // === Import ===
    async function handleFile(file){
        const text = await file.text();
        let data; try { data = JSON.parse(text); } catch { return showMsg('JSONの解析に失敗しました。', true); }
        if (!data || data.type !== EXPORT_TYPE || !Array.isArray(data.items)) return showMsg('対応していないJSON形式です。', true);

        const current = readData();
        const { added, updated, skipped } = mergeRecipes(current, data.items);
        if (!writeData(current)) return showMsg('保存に失敗しました（容量不足の可能性）', true);

        // 画面を更新（app.js の関数があれば使い、無ければリロード）
        try {
            if (typeof window.handleRoute === 'function') window.handleRoute(true);
            else location.reload();
        } catch { location.reload(); }

        showMsg(`読み込み完了：追加 ${added} / 更新 ${updated} / 既存 ${skipped}（合計 ${current.length}）`);
    }

    function showMsg(msg, err=false){ const el=$id('io-result'); if(!el) return alert(msg); el.textContent=msg; el.style.color= err? '#c00':'#0a6'; }

    function bind(){
        const ex = $id('export-json'); const im = $id('import-json'); const fi = $id('import-file');
        if (ex) ex.addEventListener('click', doExport);
        if (im && fi){ im.addEventListener('click', ()=> fi.click()); fi.addEventListener('change', ()=> { const f=fi.files?.[0]; if (f) handleFile(f); fi.value=''; }); }

        // ドロップでもOK
        const sec = $id('io-section');
        if (sec){
            sec.addEventListener('dragover', e=>{ e.preventDefault(); sec.style.outline='2px dashed #999'; });
            sec.addEventListener('dragleave', ()=>{ sec.style.outline=''; });
            sec.addEventListener('drop', e=>{ e.preventDefault(); sec.style.outline=''; const f=e.dataTransfer?.files?.[0]; if (f && f.type==='application/json') handleFile(f); });
        }
    }

    document.addEventListener('DOMContentLoaded', bind);
})();
