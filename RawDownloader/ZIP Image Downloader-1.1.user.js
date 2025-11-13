// ==UserScript==
// @name         ZIP Image Downloader
// @namespace    https://mika.darkmode/
// @version      1.1
// @description  Thu thập tất cả ảnh trên trang và tải về dạng ZIP
// @author       Mika
// @match        *://*/*
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js
// ==/UserScript==

(function () {
  'use strict';

  // === Tạo nút tải ZIP duy nhất ===
  const btn = document.createElement('button');
  btn.textContent = '📦 Tải ZIP';
  Object.assign(btn.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: 9999,
    background: '#2b2b2b',
    color: 'white',
    padding: '10px 16px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
  });
  document.body.appendChild(btn);

  // === Lấy danh sách URL ảnh ===
  function collectImageUrls() {
    const imgs = [...document.querySelectorAll('img')]
      .map(i => i.src)
      .filter(Boolean)
      .filter(src => !src.startsWith('data:'));
    return [...new Set(imgs)];
  }

  // === Tải dữ liệu từ URL ===
  async function fetchAsBlob(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Lỗi tải ${url}`);
    return await res.blob();
  }

  // === Nén ZIP và tải về ===
  async function downloadAsZip() {
    const urls = collectImageUrls();
    if (urls.length === 0) {
      alert('Không tìm thấy ảnh nào!');
      return;
    }

    btn.textContent = '⏳ Đang tải...';
    const files = {};
    let count = 0;

    for (const url of urls) {
      try {
        const blob = await fetchAsBlob(url);
        const buffer = new Uint8Array(await blob.arrayBuffer());
        const name = `${String(++count).padStart(3, '0')}.${url.split('.').pop().split('?')[0]}`;
        files[name] = buffer;
      } catch (err) {
        console.error(err);
      }
    }

    const zipped = fflate.zipSync(files, { level: 9 });
    const blob = new Blob([zipped], { type: 'application/zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'images.zip';
    a.click();
    URL.revokeObjectURL(a.href);

    btn.textContent = '📦 Tải ZIP';
  }

  // === Sự kiện bấm nút ===
  btn.addEventListener('click', downloadAsZip);
})();
