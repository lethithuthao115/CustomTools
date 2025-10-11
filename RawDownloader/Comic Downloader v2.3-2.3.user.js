// ==UserScript==
// @name         Comic Downloader v2.3
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Download comic chapters with short ZIP name but keep original image names inside ZIP (CORS-safe)
// @author       Mika
// @match        https://comick.art/*
// @connect      *
// @grant        GM.xmlHttpRequest
// @require      https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const REFERER_MAP = { 'comick': 'https://comick.art/' };

    function getRefererFor(url) {
        try {
            const host = new URL(url).hostname;
            for (const key in REFERER_MAP)
                if (host.includes(key)) return REFERER_MAP[key];
        } catch {}
        return location.origin + '/';
    }

    function sanitizeFilename(name) {
        return name.replace(/[\\/:*?"<>|]/g, '_').trim();
    }

    function getChapterFromUrl() {
        const url = window.location.href;
        const match = url.match(/(?:chapter)[-/]?([0-9.]+)/i);
        return match ? match[1] : null;
    }

    function fetchArrayBufferWithHeaders(url, attempt = 1) {
        const ref = getRefererFor(url);
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                method: 'GET',
                url,
                responseType: 'arraybuffer',
                headers: {
                    'Referer': ref,
                    'Origin': new URL(ref).origin,
                    'User-Agent': navigator.userAgent,
                    'Accept': 'image/*,*/*;q=0.8'
                },
                onload: res => {
                    if (res.status === 200) resolve(new Uint8Array(res.response));
                    else if (attempt < 3)
                        setTimeout(() => fetchArrayBufferWithHeaders(url, attempt + 1).then(resolve).catch(reject), 400);
                    else reject(new Error(`HTTP ${res.status}`));
                },
                onerror: err => {
                    if (attempt < 3)
                        setTimeout(() => fetchArrayBufferWithHeaders(url, attempt + 1).then(resolve).catch(reject), 400);
                    else reject(err);
                }
            });
        });
    }

    // --- Nút download ---
    const btn = document.createElement('button');
    btn.textContent = '📥 Download';
    Object.assign(btn.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 999999,
        padding: '8px 12px',
        background: '#2b2b2b',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '13px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.25)'
    });
    document.body.appendChild(btn);
    btn.addEventListener('click', onClickDownload);

    async function onClickDownload() {
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = '⏳ Preparing...';

        try {
            const imgEls = Array.from(document.querySelectorAll('img[src], img[data-src]'));
            const urls = imgEls.map(img => img.dataset?.src || img.src)
                .filter(u => !!u && /\.(jpg|jpeg|png|webp|avif)/i.test(u));

            const seen = new Set(), finalUrls = [];
            for (const u of urls) {
                const url = u.startsWith('//') ? location.protocol + u : u;
                if (!seen.has(url)) { seen.add(url); finalUrls.push(url); }
            }

            if (!finalUrls.length) {
                alert('❌ Không tìm thấy ảnh!');
                btn.disabled = false;
                btn.textContent = originalText;
                return;
            }

            // --- ZIP name: chỉ lấy số chap ---
            const chapterEl = document.querySelector('.title-chapter-name') ||
                              document.querySelector('.title-comicHeading');
            let chapterTitle = sanitizeFilename((chapterEl?.textContent || '').trim()) || getChapterFromUrl() || 'chapter';
            const match = chapterTitle.match(/ch[^0-9]*\s*([0-9]+(\.[0-9]+)?)/i);
            if (match) chapterTitle = `Chapter ${match[1]}`;
            const zipName = `${chapterTitle}.zip`;

            const concurrency = 4;
            const results = new Array(finalUrls.length);
            let idxPtr = 0, doneCount = 0;
            btn.textContent = `⏳ Downloading (0/${finalUrls.length})`;

            async function worker() {
                while (true) {
                    const idx = idxPtr++;
                    if (idx >= finalUrls.length) break;
                    const url = finalUrls[idx];
                    try {
                        const data = await fetchArrayBufferWithHeaders(url);
                        const filename = url.split('/').pop().split('?')[0];
                        results[idx] = [filename, data];
                    } catch (err) {
                        console.warn(`❌ Failed: ${url}`, err);
                        results[idx] = null;
                    }
                    doneCount++;
                    btn.textContent = `⏳ Downloading (${doneCount}/${finalUrls.length})`;
                }
            }

            await Promise.all(Array.from({ length: concurrency }, () => worker()));

            const zipEntries = results.filter(Boolean);
            if (!zipEntries.length) throw new Error('Không tải được ảnh nào.');

            btn.textContent = '📦 Zipping...';
            const zipObj = Object.fromEntries(zipEntries);
            const zipBytes = await new Promise((resolve, reject) => {
                fflate.zip(zipObj, { level: 0 }, (err, data) => {
                    if (err) reject(err); else resolve(data);
                });
            });

            saveAs(new Blob([zipBytes], { type: 'application/zip' }), zipName);
            btn.textContent = '✅ Done!';
            console.log(`Saved ${zipEntries.length} images as ${zipName}`);

        } catch (err) {
            console.error(err);
            alert('Error: ' + err.message);
            btn.textContent = '❌ Error';
        } finally {
            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = '📥 Download';
            }, 3000);
        }
    }
})();
