// ==UserScript==
// @name         Zip Image Downloader
// @namespace    https://mika.darkmode/
// @version      1.3
// @description  Thu thập ảnh, bỏ thumbnail, nén thành ZIP theo tên chapter (giữ tên gốc, tải đủ ảnh)
// @author       Mika
// @match        *://*/*
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js
// ==/UserScript==

(function () {
  'use strict';

  // === Tạo nút tải ZIP ===
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

  // === Lấy tên chapter ===
  function getChapterName() {
    let title = document.title || 'chapter';
    title = title.replace(/[\\/:*?"<>|]+/g, '');

    const urlMatch = window.location.href.match(/(chap(?:ter)?[-_ ]?\d+|ep\d+)/i);
    if (urlMatch) title = urlMatch[0];

    return title.trim() || 'chapter';
  }

  // === Lọc thumbnail (theo kích thước hiển thị) ===
  function collectImageUrls() {
    const imgs = [...document.querySelectorAll('img')]
      .filter(img => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        return w >= 400 && h >= 400; // bỏ ảnh nhỏ, banner, thumbnail
      })
      .map(i => i.src)
      .filter(Boolean)
      .filter(src => !src.startsWith('data:'));

    return [...new Set(imgs)];
  }

  // === Giữ tên gốc, lấy phần số.đuôi cuối ===
  function cleanFileName(url, index) {
    try {
      const filePart = url.split('/').pop().split('?')[0];
      const match = filePart.match(/(\d+\.[a-zA-Z0-9]+)$/);
      if (match) return match[1];
      return filePart || `${String(index).padStart(3, '0')}.jpg`;
    } catch {
      return `${String(index).padStart(3, '0')}.jpg`;
    }
  }

  // === Tải dữ liệu (song song) ===
  async function fetchAsBuffer(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Lỗi tải ${url}`);
    const blob = await res.blob();
    return new Uint8Array(await blob.arrayBuffer());
  }

  // === Nén ZIP và tải về ===
  async function downloadAsZip() {
    const urls = collectImageUrls();
    if (urls.length === 0) {
      alert('Không tìm thấy ảnh nào!');
      return;
    }

    btn.textContent = `⏳ Đang tải (${urls.length})...`;

    const chapterName = getChapterName();
    const files = {};

    // Giới hạn song song (đỡ nghẽn mạng)
    const concurrency = 6;
    let index = 0;

    async function processNext() {
      const i = index++;
      if (i >= urls.length) return;
      const url = urls[i];
      try {
        const buffer = await fetchAsBuffer(url);
        const name = cleanFileName(url, i + 1);
        files[name] = buffer;
        btn.textContent = `⏳ ${i + 1}/${urls.length}`;
      } catch (err) {
        console.warn('❌ Lỗi tải:', url, err);
      }
      return processNext();
    }

    // Chạy song song
    await Promise.all(new Array(concurrency).fill(0).map(processNext));

    const zipped = fflate.zipSync(files, { level: 9 });
    const blob = new Blob([zipped], { type: 'application/zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${chapterName}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);

    btn.textContent = '📦 Tải ZIP';
  }

  btn.addEventListener('click', downloadAsZip);
})();
