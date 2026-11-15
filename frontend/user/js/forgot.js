/* R-ESUME パスワードを忘れたとき：再設定のメールを送ってもらう */
(function () {
    'use strict';
    var A = window.RAuth, I = window.RI18n, rb = I.rb, T = I.t;
    var form = document.getElementById('forgotForm'), btn = document.getElementById('forgotBtn');
    var box = I.msgBox(document.getElementById('forgotMsg'));
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = form.email.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { box.set('メールアドレスの' + rb('形式', 'けいしき') + 'を' + rb('確認', 'かくにん') + 'してください。', 'Please check your email address.', 'error'); form.email.focus(); return; }
        if (!A.ready()) { box.set('いまは、メールを' + rb('送', 'おく') + 'れません。', 'We cannot send the email right now.', 'error'); return; }
        btn.disabled = true; box.clear();
        var done = function () { btn.disabled = false; };
        window.RLoading.run(function () { return A.api({ action: 'forgot', email: email }); }, {
            text: T(rb('送信', 'そうしん') + 'しています', 'Sending'),
            onSuccess: function (res) {
                if (res && res.ok) {
                    box.set(rb('登録', 'とうろく') + 'のあるメールアドレスには、メールを' + rb('送', 'おく') + 'りました。' + rb('届', 'とど') + 'かないときは、' + rb('迷惑', 'めいわく') + 'メールのフォルダも' + rb('確認', 'かくにん') + 'してください。',
                        'If this email address is registered, we sent an email. If you do not see it, please also check your spam folder.', 'ok');
                } else if (res && res.message) { box.fromServer(res.message, 'error'); }
                else { box.set(rb('送', 'おく') + 'れませんでした。', 'We could not send the email.', 'error'); }
                done();
            },
            onError: function () { box.set(rb('通信', 'つうしん') + 'できませんでした。' + rb('時間', 'じかん') + 'をおいてもう' + rb('一度', 'いちど') + 'お' + rb('試', 'ため') + 'しください。', 'Network error. Please try again.', 'error'); done(); }
        });
    });
})();
