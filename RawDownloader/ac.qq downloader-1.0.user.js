// ==UserScript==
// @name         ac.qq downloader
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Aboba
// @author       Ultra Magnus
// @homepage     https://greasyfork.org/
// @match        https://ac.qq.com/ComicView/index/id/*/cid/*
// @require      https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js
// @grant        GM_xmlhttpRequest
// @connect      manhua.acimg.cn
// @connect      gtimgcdn.ac.qq.com
// @license MIT
// @downloadURL https://update.greasyfork.org/scripts/540313/acqq%20downloader.user.js
// @updateURL https://update.greasyfork.org/scripts/540313/acqq%20downloader.meta.js
// ==/UserScript==

/* global fflate */

(function() {
    'use strict';
    function fetchAsArrayBuffer(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                onload: (response) => {
                    if (response.status === 200) {
                        resolve(new Uint8Array(response.response));
                    } else {
                        reject(new Error(`Request failed: ${response.status} for ${url}`));
                    }
                },
                onerror: (error) => reject(new Error(`Network error for ${url}: ${error.statusText}`)),
                ontimeout: () => reject(new Error(`Timeout for ${url}`))
            });
        });
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    function sanitize(name) {
        return name.replace(/[\\/:*?"<>|]/g, '_').trim();
    }

    async function downloadChapter(button) {
        button.disabled = true;
        button.textContent = 'Preparating...';

        try {
            const imageListItems = document.querySelectorAll('#comicContain > li:not(.main_ad_top)');
            for (const li of imageListItems) {
                li.scrollIntoView({ block: 'center' });
                await sleep(100);
            }
            window.scrollTo(0, 0);
            await sleep(500);

            const imageUrls = Array.from(document.querySelectorAll('#comicContain > li > img'))
                .map(img => img.src.startsWith('//') ? 'https:' + img.src : img.src)
                .filter(src => src && !src.includes('pixel.gif') && !src.includes('adTop'));

            if (imageUrls.length === 0) throw new Error('Could not find any images.');

            button.textContent = `Downloading... (0/${imageUrls.length})`;
            let downloadedCount = 0;

            const downloadPromises = imageUrls.map(url =>
                fetchAsArrayBuffer(url).then(data => {
                    downloadedCount++;
                    button.textContent = `Downloading... (${downloadedCount}/${imageUrls.length})`;
                    return data;
                })
            );
            const results = await Promise.allSettled(downloadPromises);

            button.textContent = 'Archiving...';
            const zipData = {};
            
            results.forEach((result, i) => {
                if (result.status === 'fulfilled') {
                    const pageNum = String(i + 1).padStart(3, '0');
                    const extension = imageUrls[i].split('.').pop().split('/')[0].split('?')[0] || 'jpg';
                    const filename = `${pageNum}.${extension}`;
                    zipData[filename] = [result.value, { level: 0 }];
                } else {
                    console.warn(`Failed to download image ${i + 1}:`, result.reason);
                }
            });

            const zipBytes = await new Promise((resolve, reject) => {
                fflate.zip(zipData, (err, data) => {
                    if (err) reject(err);
                    else resolve(data);
                });
            });

            const mangaTitle = sanitize(document.querySelector('.title-comic-name')?.textContent.trim() || 'manga');
            const chapterElement = document.querySelector('.title-chapter-name') || document.querySelector('.title-comicHeading');
            const chapterTitle = sanitize(chapterElement?.textContent.trim() || 'chapter');
            const safeFileName = `${mangaTitle} - ${chapterTitle}.zip`;
            
            const zipBlob = new Blob([zipBytes], { type: 'application/zip' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipBlob);
            link.download = safeFileName;
            link.click();
            URL.revokeObjectURL(link.href);

            button.textContent = 'Done!';

        } catch (error) {
            console.error('Critical error:', error);
            button.textContent = 'Error!';
            alert(`An error occurred: ${error.message}`);
        } finally {
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Download chapter';
            }, 5000);
        }
    }

    function createDownloadButton() {
        const button = document.createElement('button');
        button.textContent = 'Download chapter';
        Object.assign(button.style, {
            position: 'fixed', top: '100px', right: '20px', zIndex: '9999', padding: '10px 15px',
            backgroundColor: '#6f42c1', color: 'white', border: 'none', borderRadius: '5px',
            cursor: 'pointer', fontSize: '14px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
        });

        button.addEventListener('click', () => downloadChapter(button));
        document.body.appendChild(button);
    }

    window.addEventListener('load', createDownloadButton, false);

})();