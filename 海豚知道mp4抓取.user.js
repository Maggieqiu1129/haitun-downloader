// ==UserScript==
// @name         海豚知道 mp4 批量抓取
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  抓取海豚知道系列课全部视频 mp4 地址，导出下载列表
// @author       邱芬达
// @match        https://learn.htknow.com/*
// @match        https://www.htknow.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';
    const API = 'https://saas.clientapi.htknow.com';
    const BASE_KEY = 'UkzX1D33BS6ap92t0+in7clE2f7ScWypTPr4HPHeCwk=';

    function b64ToBytes(b64) {
        b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }

    // 用 base_KEY 解密 Laravel 加密的 product_token（AES-256-CBC + PKCS7），得到 mp4 地址
    async function decryptByAES(token, keyB64) {
        const payload = JSON.parse(new TextDecoder().decode(b64ToBytes(token)));
        const key = b64ToBytes(keyB64);
        const iv = b64ToBytes(payload.iv);
        const ciphertext = b64ToBytes(payload.value);
        const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['decrypt']);
        const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv }, cryptoKey, ciphertext);
        return new TextDecoder().decode(plain);
    }

    function api(path, data) {
        const token = localStorage.getItem('token') || '';
        const htAuthToken = localStorage.getItem('htAuthToken') || '';
        let user_id = 0;
        try {
            const u = JSON.parse(localStorage.getItem('user') || '{}');
            if (u && u.id) user_id = u.id;
        } catch (e) {}
        // 全局注入字段（axios 拦截器会加这些，手动请求必须补上）
        const body = Object.assign({
            app_name: 'pc_view',
            version: 'v1',
            custom_id: localStorage.getItem('custom_id') || '',
            user_id: user_id,
            product_version: 'v1',
            pc: false
        }, data);
        return fetch(API + path, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'HtAuthToken': htAuthToken,
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(body)
        }).then(r => r.json());
    }

    function getQuery() {
        const p = new URLSearchParams(location.search);
        return {
            series_id: p.get('series_id') || '',
            bind_order_id: p.get('bind_order_id') || '',
            mainId: p.get('mainId') || '0',
            product_type: p.get('product_type') || '4'
        };
    }

    function buildPanel() {
        let panel = document.getElementById('ht-grab-panel');
        if (panel) return panel;
        panel = document.createElement('div');
        panel.id = 'ht-grab-panel';
        panel.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;background:#1e1e2e;color:#cdd6f4;border:2px solid #a6e3a1;border-radius:10px;padding:14px;width:520px;max-height:84vh;overflow:auto;font:12px/1.5 Consolas,monospace;box-shadow:0 8px 24px rgba(0,0,0,.5)';
        document.documentElement.appendChild(panel);
        return panel;
    }

    function render(html) {
        buildPanel().innerHTML = html;
    }

    function showInit() {
        const q = getQuery();
        render(
            '<div style="font-weight:bold;color:#a6e3a1;font-size:15px;margin-bottom:8px">海豚知道 mp4 批量抓取 v3.0</div>' +
            '<div style="margin-bottom:8px">series_id <input id="ht-series" value="' + q.series_id + '" style="width:90px;background:#181825;color:#fff;border:1px solid #45475a;border-radius:4px;padding:2px 4px"> ' +
            'order_id <input id="ht-order" value="' + q.bind_order_id + '" style="width:90px;background:#181825;color:#fff;border:1px solid #45475a;border-radius:4px;padding:2px 4px"> ' +
            'mainId <input id="ht-main" value="' + q.mainId + '" style="width:50px;background:#181825;color:#fff;border:1px solid #45475a;border-radius:4px;padding:2px 4px"></div>' +
            '<button id="ht-start" style="padding:6px 14px;cursor:pointer;background:#a6e3a1;color:#1e1e2e;border:none;border-radius:6px;font-weight:bold">开始抓取全部地址</button>' +
            '<div id="ht-status" style="margin-top:10px;color:#f9e2af"></div>' +
            '<div id="ht-list" style="margin-top:10px"></div>'
        );
        document.getElementById('ht-start').addEventListener('click', start);
    }

    function start() {
        const series_id = document.getElementById('ht-series').value.trim();
        const order_id = document.getElementById('ht-order').value.trim();
        const mainId = document.getElementById('ht-main').value.trim();
        const status = document.getElementById('ht-status');
        if (!series_id) { status.textContent = '请先填写 series_id'; return; }

        status.textContent = '正在获取课程列表...';
        api('/pc_view/course/column_course_list', {
            product_id: series_id,
            order_id: order_id,
            order_sort: 1
        }).then(res => {
            if (res.code !== 200) { status.textContent = '获取列表失败: ' + JSON.stringify(res); return; }
            const list = (res.result && res.result.list) || [];
            list.sort((a, b) => (a.new_sort || 0) - (b.new_sort || 0));
            status.textContent = '共 ' + list.length + ' 讲，开始逐讲抓取地址...';
            runAll(list, { series_id, order_id, mainId });
        }).catch(e => {
            status.textContent = '请求出错: ' + e.message;
        });
    }

    async function runAll(list, cfg) {
        const status = document.getElementById('ht-status');
        const listEl = document.getElementById('ht-list');
        const results = [];
        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            const n = i + 1;
            status.textContent = '正在抓取 ' + n + '/' + list.length + ' : ' + item.title;
            try {
                const res = await api('/pc_view/course/column_play_details', {
                    column_id: cfg.series_id,
                    product_type: Number(cfg.product_type || 4),
                    product_id: item.id,
                    big_series_id: 0,
                    order_id: cfg.order_id,
                    main_product_id: cfg.mainId
                });
                const article = (res.result && res.result.article_detail) || {};
                let url = article.v_vedio_url || '';
                if (!url && article.product_token_status == 1 && article.product_token) {
                    url = await decryptByAES(article.product_token, BASE_KEY);
                }
                results.push({ n: item.new_sort || n, title: item.title, id: item.id, url: url });
            } catch (e) {
                results.push({ n: item.new_sort || n, title: item.title, id: item.id, url: '', err: e.message });
            }
        }
        status.textContent = '完成！共抓到 ' + results.filter(r => r.url).length + ' 个地址';

        let rows = '';
        results.forEach(r => {
            const color = r.url ? '#a6e3a1' : '#f38ba8';
            rows += '<div style="margin:4px 0;color:' + color + ';word-break:break-all">' + r.n + '. ' + r.title + (r.url ? ' <span style="color:#89b4fa">[有]</span>' : ' <span style="color:#f38ba8">[无视频]</span>') + '</div>';
        });
        listEl.innerHTML = rows +
            '<button id="ht-export" style="margin-top:10px;padding:6px 14px;cursor:pointer;background:#89b4fa;color:#1e1e2e;border:none;border-radius:6px;font-weight:bold">导出下载列表(txt)</button> ' +
            '<button id="ht-copy" style="margin-top:10px;padding:6px 14px;cursor:pointer;background:#f9e2af;color:#1e1e2e;border:none;border-radius:6px">复制全部URL</button>';

        document.getElementById('ht-export').addEventListener('click', () => exportTxt(results));
        document.getElementById('ht-copy').addEventListener('click', () => {
            const txt = results.filter(r => r.url).map(r => r.n + '\t' + r.title + '\t' + r.url).join('\n');
            navigator.clipboard.writeText(txt).then(() => alert('已复制 ' + results.filter(r => r.url).length + ' 条'));
        });
    }

    function exportTxt(results) {
        const lines = results.map(r => r.n + '\t' + r.title + '\t' + r.url).join('\n');
        const blob = new Blob([lines], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '海豚知道_mp4列表.txt';
        a.click();
    }

    showInit();
})();
