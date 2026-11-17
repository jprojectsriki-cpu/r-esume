/* R-ESUME 背景の3Dオブジェクト（1つ）。外部ライブラリなし。スクロールに合わせて回り、動き、色が変わる */
(function () {
    'use strict';
    var cv = document.getElementById('bg3d');
    if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var W = 0, H = 0, dpr = 1, cur = 0;
    var colorful = cv.getAttribute('data-bg') === 'colorful';
    var yellow = cv.getAttribute('data-bg') === 'yellow';   // LP（黄×黒）：白〜うす黄の面＋黒い線
    var HUES = [212, 198, 172, 48, 28, 336, 266];   // 青・水色・青緑・黄・橙・ピンク・紫（ローディングと同じ）

    // 正二十面体（立方体ではない立体）
    var t = (1 + Math.sqrt(5)) / 2;
    function norm(v) { var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
    var V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
    var F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
             [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    var L = norm([-0.45, 0.65, 0.75]);

    function size() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth; H = window.innerHeight;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        cv.style.width = W + 'px'; cv.style.height = H + 'px';
    }

    function draw(sy, time) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        var span = Math.max(1, document.documentElement.scrollHeight - H);
        var p = Math.min(1, Math.max(0, sy / span));
        var small = W < 768;
        var R = Math.min(W, H) * (small ? 0.36 : 0.40) * (1 + 0.18 * Math.sin(p * Math.PI * 2));
        var cx = W * (small ? 0.5 + 0.32 * Math.sin(p * Math.PI * 3) : 0.72 + 0.2 * Math.sin(p * Math.PI * 3));
        var cy = H * (0.5 + 0.1 * Math.cos(p * Math.PI * 2));
        var ax = 0.5 + sy * 0.0017 + time * 0.00006, ay = sy * 0.0028 + time * 0.00012, az = sy * 0.0009;
        var hue = 208 + 22 * Math.sin(p * Math.PI * 3);   // 青 → 水色 → 青
        var sa = Math.sin(ax), ca = Math.cos(ax), sb = Math.sin(ay), cb = Math.cos(ay), sc = Math.sin(az), cc = Math.cos(az);
        var tv = V.map(function (v) {
            var x = v[0], y = v[1], z = v[2], q;
            q = y * ca - z * sa; z = y * sa + z * ca; y = q;
            q = x * cb + z * sb; z = -x * sb + z * cb; x = q;
            q = x * cc - y * sc; y = x * sc + y * cc; x = q;
            return [x, y, z];
        });
        ctx.lineJoin = 'round'; ctx.lineWidth = yellow ? 2 : 1.5; ctx.strokeStyle = yellow ? 'rgba(17,17,17,0.55)' : 'rgba(255,255,255,0.85)';
        F.forEach(function (f, fi) {
            var a = tv[f[0]], b = tv[f[1]], c = tv[f[2]];
            var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
            var vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
            var n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
            var mx = a[0] + b[0] + c[0], my = a[1] + b[1] + c[1], mz = a[2] + b[2] + c[2];
            if (n[0] * mx + n[1] * my + n[2] * mz < 0) { n = [-n[0], -n[1], -n[2]]; }   // 外向きにそろえる
            var nl = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]); n = [n[0] / nl, n[1] / nl, n[2] / nl];
            if (n[2] <= 0) return;                                                       // 裏面は描かない
            var lit = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
            if (yellow) ctx.fillStyle = 'hsla(54,100%,' + (80 + 18 * lit).toFixed(1) + '%,0.72)';
            else if (colorful) ctx.fillStyle = 'hsla(' + HUES[fi % HUES.length] + ',80%,' + (62 + 18 * lit).toFixed(1) + '%,0.95)';
            else ctx.fillStyle = 'hsla(' + hue.toFixed(1) + ',72%,' + (66 + 26 * lit).toFixed(1) + '%,0.92)';
            ctx.beginPath();
            [a, b, c].forEach(function (v, i) {
                var k = 1 + v[2] * 0.12, X = cx + v[0] * R * k, Y = cy - v[1] * R * k;
                if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
            });
            ctx.closePath(); ctx.fill(); ctx.stroke();
        });
    }

    size();
    if (reduce) {                       // 動きを減らす設定：1回だけ描く
        draw(0, 0);
        window.addEventListener('resize', function () { size(); draw(0, 0); });
        return;
    }
    cur = window.pageYOffset || 0;
    function loop(now) {
        var target = window.pageYOffset || 0;
        cur += (target - cur) * 0.09;   // なめらかに追いかける
        if (!document.hidden) draw(cur, now);
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(size, 120); });
})();
