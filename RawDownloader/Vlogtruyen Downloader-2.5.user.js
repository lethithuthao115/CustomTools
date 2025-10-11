// ==UserScript==
// @name         Vlogtruyen Downloader
// @namespace    https://vlogtruyen54.com/
// @version      2.5
// @description  Tải nhanh toàn bộ ảnh truyện hoặc chương khóa thành file ZIP.
// @match        *://*.vlogtruyen54.com/*
// @grant        GM_xmlhttpRequest
// @connect      *
//
// ==/UserScript==

(function() {
  'use strict';

  const SELECTOR = 'img.image-commic, img.chapter, img[oncontextmenu]';
  const CONCURRENCY = 8;

  // === Load fflate ===
  async function loadFFlate() {
    if (window.fflate) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // === UI ===
  function makePanel() {
    if (document.getElementById('vlog-panel')) return;
    const p = document.createElement('div');
    p.id = 'vlog-panel';
    p.style = `
      position:fixed;right:12px;top:80px;z-index:2147483647;
      background:rgba(0,0,0,0.85);color:#000;
      padding:10px 12px;border-radius:8px;font-family:Arial;
      font-size:13px;box-shadow:0 4px 14px rgba(0,0,0,0.6)
    `;
    p.innerHTML = `
      <div style="font-weight:600;color:#fff;margin-bottom:6px">Vlogtruyen Downloader</div>
      <button id="vdl-download">📦 Download chapter</button>
      <div id="vdl-status" style="margin-top:6px;color:#ccc;font-size:12px"></div>
      <progress id="vdl-progress" value="0" max="100" style="width:100%;margin-top:4px;display:none;"></progress>
    `;
    document.body.appendChild(p);
    document.getElementById('vdl-download').addEventListener('click', downloadChapter);
  }

  function setStatus(msg) {
    const s = document.getElementById('vdl-status');
    if (s) s.textContent = msg;
    console.log('[VDL]', msg);
  }

  // === Thu thập ảnh ===
  function collectImages() {
    const imgs = Array.from(document.querySelectorAll(SELECTOR));
    const urls = [];
    const seen = new Set();
    for (const img of imgs) {
      const url = img.getAttribute('data-src') || img.getAttribute('data-original') || img.src;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
    return urls;
  }

  // === Fetch ===
  function fetchArrayBuffer(url) {
    return new Promise((resolve, reject) => {
      fetch(url, { credentials: 'include' })
        .then(res => {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.arrayBuffer();
        })
        .then(ab => resolve(ab))
        .catch(() => {
          try {
            GM_xmlhttpRequest({
              method: 'GET',
              url: url,
              responseType: 'arraybuffer',
              headers: {
                'Referer': 'https://vlogtruyen54.com/',
                'Origin': 'https://vlogtruyen54.com/'
              },
              onload: resp => resolve(resp.response),
              onerror: reject
            });
          } catch (e) {
            reject(e);
          }
        });
    });
  }

  const pad = (n, len) => n.toString().padStart(len, '0');
  const sanitizeFilename = (name) => name.replace(/[\\\/:*?"<>|]/g, '_').slice(0, 120);

  // === ZIP ===
  async function fastZipDownload(urls) {
    await loadFFlate();
    if (!urls.length) return alert('Không tìm thấy ảnh nào.');
    if (!confirm(`Tải ${urls.length} ảnh và nén thành ZIP nhanh?`)) return;

    const progress = document.getElementById('vdl-progress');
    progress.style.display = 'block';
    progress.value = 0;

    const files = {};
    const padLen = urls.length.toString().length;
    let index = 0, done = 0;

    setStatus(`Bắt đầu tải ${urls.length} ảnh...`);

    async function worker() {
      while (index < urls.length) {
        const i = index++;
        const url = urls[i];
        const ext = (url.match(/\.[a-zA-Z0-9]{2,5}(?:\?|$)/)?.[0]) || '.jpg';
        const name = `${pad(i + 1, padLen)}${ext}`;
        try {
          const ab = await fetchArrayBuffer(url);
          files[name] = new Uint8Array(ab);
        } catch (e) {
          console.warn('⚠️ Lỗi tải ảnh', url, e);
          files[`FAILED_${name}.txt`] = new TextEncoder().encode(`Lỗi tải: ${url}`);
        }
        done++;
        const percent = Math.round((done / urls.length) * 100);
        setStatus(`Đang tải: ${done}/${urls.length} (${percent}%)`);
        progress.value = percent;
      }
    }

    await Promise.all(Array(CONCURRENCY).fill(0).map(worker));

    setStatus('Đang nén ảnh...');
    progress.style.display = 'none';

    fflate.zip(files, { level: 1 }, (err, data) => {
      if (err) return alert('Lỗi nén ZIP: ' + err.message);
      const blob = new Blob([data], { type: 'application/zip' });

      const zipName = (document.title || 'chapter').replace(/\s+/g, '_').replace(/[_\s-]*Next[_\s-]*\[[^\]]*\].*$/i, '').slice(0, 60) + '.zip';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = zipName;
      a.click();
      URL.revokeObjectURL(a.href);

      setStatus(`✅ Hoàn tất tải ZIP`);
    });
  }

  async function downloadChapter() {
    const urls = collectImages();
    await fastZipDownload(urls);
  }

  makePanel();
})();
