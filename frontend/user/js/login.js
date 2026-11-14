/* R-ESUME ログインページ */
(function () {
    'use strict';
    var A = window.RAuth, rb = A.rb;
    var form = document.getElementById('loginForm'), msg = document.getElementById('loginMsg'), btn = document.getElementById('loginBtn');
    var pw = document.getElementById('lgPass'), eye = document.getElementById('pwToggle');
    function setMsg(text, kind, plain) {
        if (plain) msg.textContent = text || ''; else msg.innerHTML = text || '';
        msg.className = 'form-msg' + (kind ? ' is-' + kind : '');
    }

    // 別の画面から戻されたときのお知らせ（例：ログインの有効期限が切れました）
    var f = A.takeFlash();
    if (f) setMsg(f, 'error', true);

    // すでにログイン中なら、マイページへ（確認が終わるまで、ローディングを消さない）
    var s = A.load();
    if (s && s.token && A.ready() && window.RLoading) {
        window.RLoading.hold(A.api({ action: 'me', token: s.token }).then(function (res) {
            if (res && res.ok) { location.replace('mypage.html'); return new Promise(function () {}); }
            A.clear();
        }).catch(function () {}));
    }

    eye.addEventListener('click', function () {
        var show = pw.type === 'password';
        pw.type = show ? 'text' : 'password';
        eye.setAttribute('aria-pressed', String(show));
        eye.innerHTML = show ? rb('隠', 'かく') + 'す' : rb('表示', 'ひょうじ');
    });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = form.email.value.trim(), pass = form.password.value;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setMsg('メールアドレスの' + rb('形式', 'けいしき') + 'を' + rb('確認', 'かくにん') + 'してください。 / Please check your email address.', 'error'); form.email.focus(); return; }
        if (!pass) { setMsg('パスワードを' + rb('入力', 'にゅうりょく') + 'してください。 / Please enter your password.', 'error'); pw.focus(); return; }
        if (!A.ready()) { setMsg('いまは、ログインできません。 / Log in is not available now.', 'error'); return; }

        btn.disabled = true; setMsg('');
        var done = function () { btn.disabled = false; };
        window.RLoading.run(function () { return A.api({ action: 'login', email: email, password: pass }); }, {
            text: 'ログインしています',
            onSuccess: function (res) {
                if (res && res.ok) {
                    A.save(res.token, res.user);
                    form.reset();
                    window.RLoading.show('ログインできました');   // 次のページが開くまで、ローディングを残す
                    location.href = 'mypage.html';
                    return;
                }
                setMsg((res && res.message) || 'ログインできませんでした。', 'error', true);
                done();
            },
            onError: function () {
                setMsg(rb('通信', 'つうしん') + 'できませんでした。' + rb('時間', 'じかん') + 'をおいてもう' + rb('一度', 'いちど') + 'お' + rb('試', 'ため') + 'しください。 / Network error. Please try again.', 'error');
                done();
            }
        });
    });
})();
