/* R-ESUME ログインページ */
(function () {
    'use strict';
    var A = window.RAuth, I = window.RI18n, rb = I.rb, T = I.t;
    var form = document.getElementById('loginForm'), btn = document.getElementById('loginBtn');
    var pw = document.getElementById('lgPass'), eye = document.getElementById('pwToggle');
    var box = I.msgBox(document.getElementById('loginMsg'));

    // 別の画面から戻されたときのお知らせ（例：ログインの有効期限が切れました）
    var f = A.takeFlash();
    if (f) box.fromServer(f, 'error');

    // すでにログイン中なら、マイページへ（確認が終わるまで、ローディングを消さない）
    var s = A.load();
    if (s && s.token && A.ready() && window.RLoading) {
        window.RLoading.hold(A.api({ action: 'me', token: s.token }).then(function (res) {
            if (res && res.ok) { location.replace('dashboard.html'); return new Promise(function () {}); }
            A.clear();
        }).catch(function () {}));
    }

    function syncEye() {
        var show = pw.type === 'text';
        eye.innerHTML = T(show ? rb('隠', 'かく') + 'す' : rb('表示', 'ひょうじ'), show ? 'Hide' : 'Show');
    }
    I.onChange(syncEye);
    eye.addEventListener('click', function () {
        var show = pw.type === 'password';
        pw.type = show ? 'text' : 'password';
        eye.setAttribute('aria-pressed', String(show));
        syncEye();
    });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = form.email.value.trim(), pass = form.password.value;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { box.set('メールアドレスの' + rb('形式', 'けいしき') + 'を' + rb('確認', 'かくにん') + 'してください。', 'Please check your email address.', 'error'); form.email.focus(); return; }
        if (!pass) { box.set('パスワードを' + rb('入力', 'にゅうりょく') + 'してください。', 'Please enter your password.', 'error'); pw.focus(); return; }
        if (!A.ready()) { box.set('いまは、ログインできません。', 'Log in is not available now.', 'error'); return; }

        btn.disabled = true; box.clear();
        var done = function () { btn.disabled = false; };
        window.RLoading.run(function () { return A.api({ action: 'login', email: email, password: pass }); }, {
            text: T('ログインしています', 'Logging in'),
            onSuccess: function (res) {
                if (res && res.ok) {
                    A.save(res.token, res.user);
                    form.reset();
                    window.RLoading.show(T('ログインできました', 'Logged in'));   // 次のページが開くまで、ローディングを残す
                    location.href = 'dashboard.html';
                    return;
                }
                if (res && res.message) box.fromServer(res.message, 'error'); else box.set('ログインできませんでした。', 'We could not log you in.', 'error');
                done();
            },
            onError: function () {
                box.set(rb('通信', 'つうしん') + 'できませんでした。' + rb('時間', 'じかん') + 'をおいてもう' + rb('一度', 'いちど') + 'お' + rb('試', 'ため') + 'しください。', 'Network error. Please try again.', 'error');
                done();
            }
        });
    });
})();
