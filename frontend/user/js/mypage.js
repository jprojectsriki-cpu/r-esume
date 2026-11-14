/* R-ESUME マイページ（仮）。ログインの確認と、ログアウトだけ */
(function () {
    'use strict';
    var A = window.RAuth, rb = A.rb;
    var s = A.load();
    if (!s || !s.token || !A.ready()) { location.replace('login.html'); return; }

    function ymd(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        var j = new Date(d.getTime() + 9 * 3600 * 1000);   // 日本時間
        return j.getUTCFullYear() + '年' + (j.getUTCMonth() + 1) + '月' + j.getUTCDate() + '日';
    }
    function render(u) {
        var isAdmin = u.role === 'admin';
        document.getElementById('myName').textContent = u.name;
        document.getElementById('myRole').innerHTML = isAdmin ? rb('管理者', 'かんりしゃ') : rb('受講生', 'じゅこうせい');
        var lim = document.getElementById('myLimit');
        if (isAdmin) { lim.innerHTML = rb('管理者', 'かんりしゃ') + 'としてログインしています。' + rb('管理画面', 'かんりがめん') + 'は、' + rb('次', 'つぎ') + 'のステップで' + rb('公開', 'こうかい') + 'します。'; }
        else if (u.expired) { lim.innerHTML = rb('利用', 'りよう') + rb('期限', 'きげん') + 'が' + rb('過', 'す') + 'ぎています（' + ymd(u.validUntil) + 'まで）。'; }
        else { lim.innerHTML = rb('利用', 'りよう') + rb('期限', 'きげん') + '：' + ymd(u.validUntil) + 'まで'; }
        document.getElementById('myBody').hidden = false;
    }

    // ログインの確認が終わり、画面に出すまで、ローディングを消さない
    window.RLoading.hold(A.api({ action: 'me', token: s.token }).then(function (res) {
        if (res && res.ok) { render(res.user); return; }
        A.clear(); A.flash((res && res.message) || 'もう一度ログインしてください。'); location.replace('login.html');
        return new Promise(function () {});
    }).catch(function () {
        document.getElementById('myError').hidden = false;
    }));

    document.getElementById('logoutBtn').addEventListener('click', function () {
        var back = function () { A.clear(); window.RLoading.show('ログアウトしています'); location.href = 'login.html'; };
        window.RLoading.run(function () { return A.api({ action: 'logout', token: s.token }); }, { text: 'ログアウトしています', onSuccess: back, onError: back });
    });
})();
