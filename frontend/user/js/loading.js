/* R-ESUME 共通ローディング画面
 *   RLoading.show()                    表示（重ねて呼んでもよい。同じ回数 hide が要る）
 *   RLoading.hide()                    非表示（画面に反映されたあと、最低表示時間を過ぎてから消える）
 *   RLoading.run(task, {onSuccess, onError, text})
 *        task（関数 or Promise）が終わる → onSuccess / onError で画面に反映 → 描画が終わる → 消える
 *   RLoading.hold(promise)             ページの最初の読み込みで、この処理が終わるまで消さない
 * ページを開いたとき自動で表示し、読み込み（フォント含む）と hold が終わり、画面に反映されたあとで消す。
 */
(function () {
    'use strict';
    var MIN_MS = 600, FAILSAFE_MS = 60000;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dlg, cv, ctx, textEl, count = 0, shownAt = 0, raf = 0, failTimer = 0, closing = null;

    /* ---- 色とりどりの正二十面体 ---- */
    var t = (1 + Math.sqrt(5)) / 2;
    function norm(v) { var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
    var V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
    var F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
             [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    var HUES = [212, 198, 172, 48, 28, 336, 266];   // 青・水色・青緑・黄・橙・ピンク・紫
    var L = norm([-0.45, 0.65, 0.75]);
    function draw(time) {
        var W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        var R = Math.min(W, H) * 0.42, cx = W / 2, cy = H / 2;
        var ax = 0.6 + time * 0.0006, ay = time * 0.0011, az = time * 0.0003;
        var sa = Math.sin(ax), ca = Math.cos(ax), sb = Math.sin(ay), cb = Math.cos(ay), sc = Math.sin(az), cc = Math.cos(az);
        var tv = V.map(function (v) {
            var x = v[0], y = v[1], z = v[2], q;
            q = y * ca - z * sa; z = y * sa + z * ca; y = q;
            q = x * cb + z * sb; z = -x * sb + z * cb; x = q;
            q = x * cc - y * sc; y = x * sc + y * cc; x = q;
            return [x, y, z];
        });
        ctx.lineJoin = 'round'; ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        F.forEach(function (f, i) {
            var a = tv[f[0]], b = tv[f[1]], c = tv[f[2]];
            var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
            var n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
            if (n[0] * (a[0] + b[0] + c[0]) + n[1] * (a[1] + b[1] + c[1]) + n[2] * (a[2] + b[2] + c[2]) < 0) n = [-n[0], -n[1], -n[2]];
            var nl = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]); n = [n[0] / nl, n[1] / nl, n[2] / nl];
            if (n[2] <= 0) return;
            var lit = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
            ctx.fillStyle = 'hsl(' + HUES[i % HUES.length] + ',78%,' + (50 + 18 * lit).toFixed(1) + '%)';
            ctx.beginPath();
            [a, b, c].forEach(function (v, k) { var s = 1 + v[2] * 0.12, X = cx + v[0] * R * s, Y = cy - v[1] * R * s; if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
            ctx.closePath(); ctx.fill(); ctx.stroke();
        });
    }
    function loop(now) { draw(now); raf = requestAnimationFrame(loop); }

    /* ---- 画面（dialog を使うので、申込フォームなどのダイアログより前に出る） ---- */
    function build() {
        if (dlg) return;
        dlg = document.createElement('dialog');
        dlg.id = 'rLoading';
        dlg.setAttribute('aria-label', window.RI18n ? window.RI18n.t('読み込み中', 'Loading') : '読み込み中');
        dlg.innerHTML =
            '<div class="rl-box" role="status" aria-live="polite" aria-busy="true">' +
            '<canvas class="rl-canvas" aria-hidden="true"></canvas>' +
            '<div class="rl-logo"><span class="rl-name">R-ESUME</span></div>' +
            '<p class="rl-text"></p></div>';
        document.body.appendChild(dlg);
        cv = dlg.querySelector('canvas'); ctx = cv.getContext('2d'); textEl = dlg.querySelector('.rl-text');
        dlg.addEventListener('cancel', function (e) { e.preventDefault(); });   // Esc では閉じない
    }
    function setText(html) {
        textEl.innerHTML = (html || (window.RI18n && window.RI18n.lang() === 'en' ? 'Loading' : '<ruby>読<rt>よ</rt></ruby>み<ruby>込<rt>こ</rt></ruby>み<ruby>中<rt>ちゅう</rt></ruby>')) +
            '<span class="rl-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
    }
    function painted() {   // 画面に反映（描画）されるまで待つ
        return new Promise(function (res) { requestAnimationFrame(function () { requestAnimationFrame(res); }); });
    }
    function show(html) {
        build();
        count++;
        if (count === 1) {
            setText(html);
            shownAt = Date.now();
            document.documentElement.classList.add('is-loading');
            if (!dlg.open) { try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); } }
            if (reduce) { draw(0); } else { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); }
            clearTimeout(failTimer); failTimer = setTimeout(function () { count = 0; close(); }, FAILSAFE_MS);   // 念のため：永久に消えなくなるのを防ぐ
        }
    }
    function close() {
        clearTimeout(failTimer); cancelAnimationFrame(raf);
        if (dlg && dlg.open) dlg.close();
        document.documentElement.classList.remove('is-loading');
    }
    function hide() {
        if (count === 0) return closing || Promise.resolve();
        count--;
        if (count > 0) return Promise.resolve();
        var wait = Math.max(0, MIN_MS - (Date.now() - shownAt));
        closing = painted().then(function () { return new Promise(function (r) { setTimeout(r, wait); }); }).then(function () { if (count === 0) close(); closing = null; });
        return closing;
    }
    function run(task, h) {
        h = h || {};
        show(h.text);
        var p;
        try { p = Promise.resolve(typeof task === 'function' ? task() : task); } catch (e) { p = Promise.reject(e); }
        return p.then(function (res) {
            // onSuccess が Promise を返したら、それが終わるまで待ってから消す
            var after; try { after = h.onSuccess ? h.onSuccess(res) : null; } catch (e) { console.error(e); }
            return Promise.resolve(after).catch(function (e) { console.error(e); }).then(hide).then(function () { return res; });
        }, function (err) {
            var after; try { after = h.onError ? h.onError(err) : null; } catch (e) { console.error(e); }
            return Promise.resolve(after).catch(function (e) { console.error(e); }).then(hide).then(function () { if (!h.onError) throw err; });
        });
    }

    /* ---- ページを開いたときの自動表示 ---- */
    var pending = [
        new Promise(function (res) { if (document.readyState === 'complete') res(); else window.addEventListener('load', res); }),
        (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve()
    ];
    function hold(p) { pending.push(Promise.resolve(p)); }
    function drain() {
        if (!pending.length) return Promise.resolve();
        var batch = pending.splice(0);
        return Promise.all(batch.map(function (p) { return p.catch(function () {}); })).then(drain);
    }
    window.RLoading = { show: show, hide: hide, run: run, hold: hold };
    if (document.body) {
        show();
        drain().then(function () { return hide(); });
    }
})();
