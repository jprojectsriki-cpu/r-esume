/* R-ESUME 新しいパスワードを決める（メールのリンクから開く） */
(function () {
    'use strict';
    var A = window.RAuth, I = window.RI18n, rb = I.rb, T = I.t;
    var form = document.getElementById('resetForm'), btn = document.getElementById('resetBtn');
    var pw = document.getElementById('rsPass'), pw2 = document.getElementById('rsPass2'), eye = document.getElementById('pwToggle');
    var box = I.msgBox(document.getElementById('resetMsg'));
    var token = '';
    try { token = new URLSearchParams(location.search).get('token') || ''; } catch (e) {}
    try { if (window.history && history.replaceState) history.replaceState(null, '', location.pathname); } catch (e) {}   // アドレスからトークンを消す

    function noLink() {
        form.hidden = true;
        box.set('このリンクは' + rb('使', 'つか') + 'えません。もう' + rb('一度', 'いちど') + '、メールを' + rb('送', 'おく') + 'ってください。', 'This link cannot be used. Please send the email again.', 'error');
    }
    if (!token) { noLink(); }
    else if (A.ready()) {
        // 画面を開いたとき、リンクがまだ使えるか確かめる（確かめが終わるまで、ローディングを消さない）
        window.RLoading.hold(A.api({ action: 'resetCheck', token: token }).then(function (res) {
            if (res && res.ok === false) {
                form.hidden = true;
                document.getElementById('resetBack').hidden = false;
                box.fromServer(res.message || '', 'error');
            }
        }).catch(function () {}));
    }

    function syncEye() {
        var show = pw.type === 'text';
        eye.innerHTML = T(show ? rb('隠', 'かく') + 'す' : rb('表示', 'ひょうじ'), show ? 'Hide' : 'Show');
    }
    I.onChange(syncEye);
    eye.addEventListener('click', function () {
        var show = pw.type === 'password';
        pw.type = show ? 'text' : 'password'; pw2.type = pw.type;
        eye.setAttribute('aria-pressed', String(show));
        syncEye();
    });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var p = pw.value, q = pw2.value;
        if (p.length < 8 || p.length > 64) { box.set('パスワードは8〜64' + rb('文字', 'もじ') + 'で' + rb('入力', 'にゅうりょく') + 'してください。', 'Password must be 8–64 characters.', 'error'); pw.focus(); return; }
        if (p !== q) { box.set('2つのパスワードが' + rb('同', 'おな') + 'じではありません。', 'The two passwords do not match.', 'error'); pw2.focus(); return; }
        if (!A.ready()) { box.set('いまは、パスワードを' + rb('変', 'か') + 'えられません。', 'We cannot change the password right now.', 'error'); return; }
        btn.disabled = true; box.clear();
        var done = function () { btn.disabled = false; };
        // パスワードが変わり、結果を画面に出したあとで、ローディングを消す
        window.RLoading.run(function () { return A.api({ action: 'reset', token: token, password: p }); }, {
            text: T(rb('変更', 'へんこう') + 'しています', 'Changing'),
            onSuccess: function (res) {
                if (res && res.ok) {
                    A.clear();   // この端末のログイン情報も消す
                    form.reset(); form.hidden = true; box.clear();
                    document.getElementById('resetDone').hidden = false;
                    document.getElementById('resetBack').hidden = true;
                    return;
                }
                if (res && res.message) box.fromServer(res.message, 'error'); else box.set(rb('変', 'か') + 'えられませんでした。', 'We could not change the password.', 'error');
                done();
            },
            onError: function () { box.set(rb('通信', 'つうしん') + 'できませんでした。' + rb('時間', 'じかん') + 'をおいてもう' + rb('一度', 'いちど') + 'お' + rb('試', 'ため') + 'しください。', 'Network error. Please try again.', 'error'); done(); }
        });
    });
})();
