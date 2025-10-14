// ==UserScript==
// @name         Quick Image ZIP Downloader
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Cần phải cuộn xuống cuối trang để lấy hết ảnh
// @author       Mika
// @match        *://*/*
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @connect      *
// @require      https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js
// ==/UserScript==

(function () {
    'use strict';

    const SELECTOR = 'img.chapter'; // chỉnh nếu cần

    // ========== UI ==========
    function makePanel() {
        if (document.getElementById('qc-panel')) return;
        const p = document.createElement('div');
        p.id = 'qc-panel';
        p.style = `
            position:fixed;right:12px;top:80px;z-index:2147483647;
            background:rgba(0,0,0,0.8);color:#fff;padding:10px 14px;
            border-radius:10px;font-family:Arial,sans-serif;font-size:13px;
            box-shadow:0 4px 14px rgba(0,0,0,0.6)
        `;
        p.innerHTML = `
            <div style="font-weight:600;margin-bottom:6px">📘 Quick ZIP DL</div>
            <button id="qc-zip" style="font-weight:bold;padding:4px 8px">⬇️ Tải chương (ZIP)</button>
            <div id="qc-status" style="margin-top:8px;color:#ccc;font-size:12px"></div>
        `;
        document.body.appendChild(p);
        document.getElementById('qc-zip').addEventListener('click', downloadZip);
    }

    const setStatus = (t) => {
        const s = document.getElementById('qc-status');
        if (s) s.textContent = t;
        console.log('[QC]', t);
    };

    function normalize(u) {
        if (!u) return '';
        u = u.trim();
        if (u.startsWith('//')) u = location.protocol + u;
        if (u.startsWith('/')) u = location.origin + u;
        if (u.includes(',')) u = u.split(',')[0].trim();
        return u;
    }

    // ========== CORE ==========
    async function collectImages() {
        const imgs = Array.from(document.querySelectorAll('img'));
        const seen = new Set();
        const found = [];
        for (const img of imgs) {
            const url = normalize(img.dataset.src || img.dataset.original || img.src);
            if (!url) continue;

            // Bỏ qua ảnh banner, logo, avatar, thumbnail, icon, gif nhỏ
            if (/banner|logo|avatar|thumb|icon|small|tiny|ads|loading/i.test(url)) continue;
            if (!/(\.jpe?g|\.png|\.webp)$/i.test(url)) continue;

            if (seen.has(url)) continue;
            seen.add(url);
            found.push(url);
        }
        setStatus(`Tìm thấy ${found.length} ảnh hợp lệ.`);
        return found;
    }

    async function fetchBlob(url) {
        try {
            const res = await fetch(url, { mode: 'cors' });
            if (!res.ok) throw new Error(res.status);
            return await res.blob();
        } catch (e) {
            return await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    responseType: 'arraybuffer',
                    onload: (r) => resolve(new Blob([r.response])),
                    onerror: reject
                });
            });
        }
    }


    async function downloadZip() {
        const list = await collectImages();
        if (!list.length) return alert('Không tìm thấy ảnh!');

        const prefix = (document.title || 'chapter').replace(/[^\w\s-]+/g, '').replace(/\s+/g, '_');
        const zipData = {};
        let i = 0;

        for (const url of list) {
            i++;
            setStatus(`Tải ${i}/${list.length}`);
            try {
                const blob = await fetchBlob(url);
                const arrBuf = await blob.arrayBuffer();
                //const ext = (url.split('.').pop().split(/[?#]/)[0] || 'jpg').slice(0, 5);
                //const name = `${String(i).padStart(3, '0')}.${ext}`;
                //zipData[name] = new Uint8Array(arrBuf);
                let originalName = url.split('/').pop().split(/[?#]/)[0];
                if (!/\.[a-z0-9]+$/i.test(originalName)) originalName += '.jpg';
                zipData[originalName] = new Uint8Array(arrBuf);
            } catch (err) {
                console.warn('Lỗi tải ảnh', url, err);
            }
        }

        setStatus('Đang nén zip...');
        const zipBytes = fflate.zipSync(zipData, { level: 9 });
        const blob = new Blob([zipBytes], { type: 'application/zip' });
        const filename = `${prefix}.zip`;
        const blobUrl = URL.createObjectURL(blob);

        try {
            GM_download({ url: blobUrl, name: filename });
        } catch (e) {
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            a.click();
        }

        setStatus(`✅ Hoàn tất!`);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    }

    makePanel();

})();
