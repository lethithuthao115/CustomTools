// ==UserScript==
// @name         Image Downloader
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Thu thập và tải nhanh tất cả ảnh chương (selector: img.chapter). Dùng GM_download / GM_xmlhttpRequest fallback.
// @author       Mika
// @match        *://*/*
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @connect      *
// ==/UserScript==

(function () {
    'use strict';

    const SELECTOR = 'img.chapter'; // chỉnh nếu cần

    // UI panel
    function makePanel() {
        if (document.getElementById('qc-panel')) return;
        const p = document.createElement('div');
        p.id = 'qc-panel';
        p.style = 'position:fixed;right:12px;top:80px;z-index:2147483647;background:rgba(0,0,0,0.78);color:#fff;padding:10px;border-radius:8px;font-family:Arial,sans-serif;font-size:13px;box-shadow:0 4px 14px rgba(0,0,0,0.6)';
        p.innerHTML = `
            <div style="font-weight:600;margin-bottom:6px">Quick Chapter DL</div>
            <div style="margin-bottom:6px">
                <button id="qc-collect">⟳ Thu thập ảnh</button>
                <button id="qc-list" disabled>Danh sách (0)</button>
            </div>
            <div style="margin-bottom:6px">
                <button id="qc-fast" disabled>⚡ Tải nhanh (parallel)</button>
                <button id="qc-seq" disabled>⬇ Tải tuần tự</button>
            </div>
            <div id="qc-status" style="margin-top:6px;color:#ddd;font-size:12px"></div>
        `;
        document.body.appendChild(p);

        document.getElementById('qc-collect').addEventListener('click', collect);
        document.getElementById('qc-fast').addEventListener('click', () => startDownload({mode:'parallel', concurrency:6}));
        document.getElementById('qc-seq').addEventListener('click', () => startDownload({mode:'sequential'}));
        document.getElementById('qc-list').addEventListener('click', showList);
    }

    // utilities
    function setStatus(t){ const s=document.getElementById('qc-status'); if(s) s.textContent=t; console.log('[QC]',t); }
    function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
    function normalize(u){
        if(!u) return u;
        u = u.trim();
        if(u.startsWith('//')) u = location.protocol + u;
        if(u.startsWith('/')) u = location.origin + u;
        if(u.includes(',')) u = u.split(',')[0].trim();
        return u;
    }
    function guessOrderKey(img){
        // cố gắng lấy số trang từ alt: "page N"
        try{
            const alt = img.getAttribute('alt') || '';
            const m = alt.match(/page\s*([0-9]+)/i);
            if(m) return parseInt(m[1],10);
            // lấy từ src filename
            const src = img.getAttribute('src') || img.src || '';
            const mm = src.match(/(\d+)(?:\.(?:jpg|jpeg|png|webp|gif))/i);
            if(mm) return parseInt(mm[1],10);
        }catch(e){}
        return 0;
    }

    // thu thập ảnh
    function collect(){
        setStatus('Đang thu thập ảnh theo selector: ' + SELECTOR);
        const imgs = Array.from(document.querySelectorAll(SELECTOR));
        const found = [];
        const seen = new Set();
        imgs.forEach(img=>{
            let url = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('src') || img.src;
            url = normalize(url);
            if(!url) return;
            if(seen.has(url)) return;
            seen.add(url);
            found.push({url, el: img, order: guessOrderKey(img)});
        });
        // fallback: nếu không tìm thấy, dò tất cả img trên trang có src chứa '/en/' hoặc '/uploads/' hoặc có webp/jpg
        if(found.length === 0){
            const fallback = Array.from(document.querySelectorAll('img'));
            fallback.forEach(img=>{
                let url = img.getAttribute('src') || img.src;
                if(!url) return;
                if(!/(\.jpe?g|\.png|\.webp|\.gif)/i.test(url)) return;
                url = normalize(url);
                if(seen.has(url)) return;
                seen.add(url);
                found.push({url, el: img, order: guessOrderKey(img)});
            });
        }
        // sắp theo order, nếu có
        found.sort((a,b) => (a.order||0) - (b.order||0) || a.url.localeCompare(b.url));
        window._qc_images = found.map(x=>x.url);
        const btnList = document.getElementById('qc-list');
        btnList.disabled = false;
        btnList.textContent = `Danh sách (${window._qc_images.length})`;
        document.getElementById('qc-fast').disabled = window._qc_images.length===0;
        document.getElementById('qc-seq').disabled = window._qc_images.length===0;
        setStatus(`Thu thập xong: ${window._qc_images.length} ảnh.`);
    }

    function showList(){
        const list = window._qc_images||[];
        const w = window.open('', '_blank');
        w.document.title = 'Image List';
        const ol = w.document.createElement('ol');
        list.forEach(u=>{
            const li = w.document.createElement('li');
            const a = w.document.createElement('a');
            a.href = u; a.textContent = u; a.target = '_blank';
            li.appendChild(a);
            ol.appendChild(li);
        });
        w.document.body.appendChild(ol);
    }

    // download helpers
    function gmDownloadPromise(opts){
        return new Promise((resolve,reject)=>{
            try{
                GM_download({
                    url: opts.url,
                    name: opts.name,
                    onload: ()=>resolve(),
                    onerror: (e)=>reject(e),
                    ontimeout: ()=>reject(new Error('timeout'))
                });
            }catch(e){
                reject(e);
            }
        });
    }

    function gmXhrBlob(url){
        return new Promise((resolve,reject)=>{
            try{
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    responseType: 'arraybuffer',
                    onload: function(resp){
                        const ab = resp.response;
                        const blob = new Blob([ab]);
                        resolve(blob);
                    },
                    onerror: function(err){ reject(err); }
                });
            }catch(e){ reject(e); }
        });
    }

    async function fetchBlobFallback(url){
        try{
            const res = await fetch(url, {mode:'cors', credentials:'omit'});
            if(!res.ok) throw new Error('HTTP '+res.status);
            return await res.blob();
        }catch(e){
            // try GM_xmlhttpRequest fallback
            return await gmXhrBlob(url);
        }
    }

    // start download
    async function startDownload({mode='parallel', concurrency=6}={}){
        const list = window._qc_images || [];
        if(!list.length){ alert('Chưa có ảnh, bấm Thu thập ảnh trước!'); return; }

        setStatus('Bắt đầu tải: ' + list.length + ' ảnh (' + mode + ')');
        const prefix = (document.title||'chapter').replace(/\s+/g,'_').slice(0,60);

        if(mode === 'sequential'){
            for(let i=0;i<list.length;i++){
                const url = list[i];
                const ext = (url.split('.').pop().split(/\?|#/)[0] || 'jpg').slice(0,5);
                const name = `${prefix}_${String(i+1).padStart(3,'0')}.${ext}`;
                setStatus(`Tải ${i+1}/${list.length}: ${name}`);
                try{
                    await tryDownload(url, name);
                }catch(e){
                    console.warn('Fail', url, e);
                }
                await sleep(300);
            }
        }else{
            // parallel with limited concurrency
            let idx = 0;
            let active = 0;
            const total = list.length;
            const promises = [];
            return new Promise((resolveMain)=>{
                function next(){
                    if(idx >= total && active === 0){
                        resolveMain();
                        return;
                    }
                    while(active < concurrency && idx < total){
                        const i = idx++;
                        const url = list[i];
                        active++;
                        (async ()=>{
                            const ext = (url.split('.').pop().split(/\?|#/)[0] || 'jpg').slice(0,5);
                            const name = `${prefix}_${String(i+1).padStart(3,'0')}.${ext}`;
                            setStatus(`(P) Tải ${i+1}/${total}: ${name} (active ${active})`);
                            try{
                                await tryDownload(url, name);
                            }catch(e){
                                console.warn('Fail', url, e);
                            }
                            active--;
                            next();
                        })();
                    }
                }
                next();
            });
        }

        setStatus('Hoàn tất tải ảnh.');
        notify('Quick DL', 'Hoàn tất tải ảnh.');
    }

    async function tryDownload(url, name){
        // try GM_download first
        try{
            await gmDownloadPromise({url, name});
            return;
        }catch(e){
            console.warn('GM_download failed, fallback to blob', e);
            // fallback - fetch blob then create objectURL and click
            try{
                const blob = await fetchBlobFallback(url);
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = name;
                document.body.appendChild(a);
                a.click();
                a.remove();
                // free after a little
                setTimeout(()=>URL.revokeObjectURL(blobUrl), 30000);
                return;
            }catch(err){
                console.error('fallback fetch failed', err);
                // ultimate fallback: open in new tab
                window.open(url, '_blank');
                return;
            }
        }
    }

    function notify(title, text){
        try{ GM_notification({title, text, timeout: 3000}); }catch(e){ console.log(title, text); }
    }

    // init
    makePanel();

})();
