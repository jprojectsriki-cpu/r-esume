/* R-ESUME マイページ（仮）。ログインの確認と、ログアウトだけ */
(function () {
    'use strict';
    var A = window.RAuth, I = window.RI18n, rb = I.rb, T = I.t;
    var s = A.load();
    if (!s || !s.token || !A.ready()) { location.replace('login.html'); return; }

    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function ymd(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        var j = new Date(d.getTime() + 9 * 3600 * 1000);   // 日本時間
        if (I.lang() === 'en') return MON[j.getUTCMonth()] + ' ' + j.getUTCDate() + ', ' + j.getUTCFullYear();
        return j.getUTCFullYear() + '年' + (j.getUTCMonth() + 1) + '月' + j.getUTCDate() + '日';
    }
    var shown = null;
    function render(u) {
        shown = u;
        var isAdmin = u.role === 'admin';
        document.getElementById('myName').textContent = u.name;
        document.getElementById('myRole').innerHTML = isAdmin ? T(rb('管理者', 'かんりしゃ'), 'Administrator') : T(rb('受講生', 'じゅこうせい'), 'Student');
        var lim = document.getElementById('myLimit');
        document.getElementById('adminLink').hidden = !isAdmin;
        document.getElementById('mySoon').hidden = isAdmin;
        if (isAdmin) { lim.innerHTML = T(rb('管理者', 'かんりしゃ') + 'としてログインしています。', 'You are logged in as an administrator.'); }
        else if (u.expired) { lim.innerHTML = T(rb('利用', 'りよう') + rb('期限', 'きげん') + 'が' + rb('過', 'す') + 'ぎています（' + ymd(u.validUntil) + 'まで）。', 'Your access has expired (it ended on ' + ymd(u.validUntil) + ').'); }
        else { lim.innerHTML = T(rb('利用', 'りよう') + rb('期限', 'きげん') + '：' + ymd(u.validUntil) + 'まで', 'Valid until: ' + ymd(u.validUntil)); }
        document.getElementById('myBody').hidden = false;
    }
    I.onChange(function () { if (shown) render(shown); });

    // ログインの確認が終わり、画面に出すまで、ローディングを消さない
    window.RLoading.hold(A.api({ action: 'me', token: s.token }).then(function (res) {
        if (res && res.ok) { render(res.user); return; }
        A.clear(); A.flash((res && res.message) || 'もう一度ログインしてください。');   // 日本語のまま保存し、ログイン画面で言語に合わせて出す location.replace('login.html');
        return new Promise(function () {});
    }).catch(function () {
        document.getElementById('myError').hidden = false;
    }));

    document.getElementById('logoutBtn').addEventListener('click', function () {
        var back = function () { A.clear(); window.RLoading.show(T('ログアウトしています', 'Logging out')); location.href = 'login.html'; };
        window.RLoading.run(function () { return A.api({ action: 'logout', token: s.token }); }, { text: T('ログアウトしています', 'Logging out'), onSuccess: back, onError: back });
    });
})();
