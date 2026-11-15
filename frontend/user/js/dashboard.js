/* R-ESUME ホーム（Dashboard）。ログインの確認・利用期限・更新の申込・ログアウト */
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
    function $(id) { return document.getElementById(id); }
    var renewBox = I.msgBox($('renewMsg'));
    var user = null, ren = null;

    /* ---- 画面に出す ---- */
    function render() {
        if (!user) return;
        var isAdmin = user.role === 'admin';
        $('myName').textContent = user.name;
        $('myRole').innerHTML = isAdmin ? T(rb('管理者', 'かんりしゃ'), 'Administrator') : T(rb('受講生', 'じゅこうせい'), 'Student');
        $('adminLink').hidden = !isAdmin;
        var lim = $('myLimit');
        var validUntil = ren && ren.validUntil ? ren.validUntil : user.validUntil;
        var expired = ren ? ren.expired : user.expired;
        if (isAdmin) { lim.innerHTML = T(rb('管理者', 'かんりしゃ') + 'としてログインしています。', 'You are logged in as an administrator.'); }
        else if (expired) { lim.innerHTML = T(rb('利用', 'りよう') + rb('期限', 'きげん') + 'が' + rb('過', 'す') + 'ぎています（' + ymd(validUntil) + 'まで）。', 'Your access has expired (it ended on ' + ymd(validUntil) + ').'); }
        else { lim.innerHTML = T(rb('利用', 'りよう') + rb('期限', 'きげん') + '：' + ymd(validUntil) + 'まで', 'Valid until: ' + ymd(validUntil)); }
        renderRenew();
        var ty = $('myType'), top1 = persona && persona.suggest && persona.suggest[0], ind = null;
        if (top1 && window.RPersonality) window.RPersonality.INDUSTRIES.forEach(function (x) { if (x.id === top1) ind = x; });
        ty.hidden = !ind || isAdmin;
        if (ind) ty.innerHTML = T('<span class="my-type-k">おすすめ</span>' + ind.ja.replace(/\{([^|}]+)\|([^}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>') + 'タイプ', 'Recommended: ' + ind.en);
        var pt = $('personaTag'); pt.textContent = persona && persona.top ? '診断ずみ' : '未診断'; pt.hidden = isAdmin;
        var sc = $('stageCount'); sc.textContent = cnt ? cnt + '枚' : ''; sc.hidden = !cnt || isAdmin;
        $('myBody').hidden = false;
    }
    function renderRenew() {
        var box = $('myRenew'), note = $('renewNote'), btn = $('renewBtn');
        if (!ren || ren.role === 'admin') { box.hidden = true; return; }
        var text = '';
        if (ren.open) {
            text = T('更新のお' + rb('申', 'もう') + 'し' + rb('込', 'こ') + 'みを' + rb('受', 'う') + 'け' + rb('付', 'つ') + 'けています（' + rb('申込', 'もうしこみ') + rb('番号', 'ばんごう') + '：' + ren.open.applicationId + '）。' + rb('受付', 'うけつけ') + 'メールの' + rb('口座', 'こうざ') + 'に、¥' + Number(ren.amount).toLocaleString('ja-JP') + 'を、' + ymd(ren.open.expiresAt) + 'までに' + rb('振', 'ふ') + 'り' + rb('込', 'こ') + 'んでください。',
                'We have received your renewal application (No. ' + ren.open.applicationId + '). Please transfer ¥' + Number(ren.amount).toLocaleString('en-US') + ' to the account in the confirmation email by ' + ymd(ren.open.expiresAt) + '.');
        } else if (ren.canRenew && ren.expired) {
            text = T(rb('利用', 'りよう') + rb('期間', 'きかん') + 'が' + rb('終', 'お') + 'わっています。' + rb('履歴書', 'りれきしょ') + 'の' + rb('作成', 'さくせい') + '・' + rb('編集', 'へんしゅう') + '・' + rb('印刷', 'いんさつ') + 'をする' + rb('場合', 'ばあい') + 'は' + rb('更新', 'こうしん') + 'をしてください。',
                'Your period of use has ended. To create, edit or print your resume, please renew.');
        } else if (ren.canRenew) {
            text = T(rb('利用', 'りよう') + rb('期限', 'きげん') + 'が' + rb('近', 'ちか') + 'づいています。いまから' + rb('更新', 'こうしん') + 'できます。',
                'Your period of use ends soon. You can renew now.');
        }
        note.innerHTML = text; note.hidden = !text;
        btn.hidden = !ren.canRenew;
        box.hidden = !text && !ren.canRenew;
    }
    I.onChange(function () { render(); });

    /* ---- 読み込み（確認が終わり、画面に出すまで、ローディングを消さない） ---- */
    function kick(res) { A.clear(); A.flash((res && res.message) || 'もう一度ログインしてください。'); location.replace('login.html'); return new Promise(function () {}); }   // 日本語のまま保存し、ログイン画面で言語に合わせて出す
    function loadRenewal() {
        return A.api({ action: 'myRenewal', token: s.token }).then(function (res) {
            if (res && res.ok) { ren = res; return; }
            if (res && res.reason) return kick(res);
        });
    }
    var cnt = null, persona = null;
    function loadPersona() {
        return A.api({ action: 'personaGet', token: s.token }).then(function (res) { if (res && res.ok) persona = res.persona; }).catch(function () {});
    }
    function loadCount() {
        return A.api({ action: 'resumeList', token: s.token }).then(function (res) {
            if (res && res.ok && res.resumes) cnt = res.resumes.length + '/' + (res.max || 3);
        }).catch(function () {});
    }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function loadNotices() {
        return A.api({ action: 'noticeList', token: s.token }).then(function (res) {
            var box = $('notices');
            if (!res || !res.ok || !res.notices || !res.notices.length) { box.hidden = true; return; }
            box.innerHTML = '<h2 class="notices-h">お知らせ</h2>' + res.notices.map(function (n) {
                return '<article class="notice-card"><p class="notice-date">' + esc(ymd(n.createdAt)) + '</p><h3>' + esc(n.title) + '</h3><p class="notice-body">' + esc(n.body) + '</p></article>';
            }).join('');
            box.hidden = false;
        }).catch(function () {});
    }
    window.RLoading.hold(A.api({ action: 'me', token: s.token }).then(function (res) {
        if (res && res.ok) { user = res.user; return loadRenewal().then(loadCount).then(loadPersona).then(loadNotices).then(render); }
        return kick(res);
    }).catch(function () {
        $('myError').hidden = false;
    }));

    /* ---- 更新の申込（確認 → 申込 → 状態を読み直して画面に出す → ローディングを消す） ---- */
    var dlg = $('dlgRenew');
    $('renewBtn').addEventListener('click', function () { renewBox.clear(); dlg.showModal(); });
    $('renewNo').addEventListener('click', function () { dlg.close(); });
    $('renewForm').addEventListener('submit', function (e) {
        e.preventDefault(); dlg.close();
        window.RLoading.run(function () {
            return A.api({ action: 'renew', token: s.token }).then(function (res) {
                if (res && res.ok === false && res.reason) return kick(res);
                return loadRenewal().then(function () { render(); return res; });
            });
        }, {
            text: T(rb('申込', 'もうしこみ') + 'をしています', 'Applying'),
            onSuccess: function (res) {
                if (res && res.ok) renewBox.set(rb('更新', 'こうしん') + 'のお' + rb('申', 'もう') + 'し' + rb('込', 'こ') + 'みを' + rb('受', 'う') + 'け' + rb('付', 'つ') + 'けました。メールをご' + rb('確認', 'かくにん') + 'ください。', 'We received your renewal application. Please check your email.', 'ok');
                else if (res && res.message) renewBox.fromServer(res.message, 'error');
                else renewBox.set('お' + rb('申', 'もう') + 'し' + rb('込', 'こ') + 'みできませんでした。', 'We could not accept your application.', 'error');
            },
            onError: function () { renewBox.set(rb('通信', 'つうしん') + 'できませんでした。' + rb('時間', 'じかん') + 'をおいてもう' + rb('一度', 'いちど') + 'お' + rb('試', 'ため') + 'しください。', 'Network error. Please try again.', 'error'); }
        });
    });

    $('logoutBtn').addEventListener('click', function () {
        var back = function () { A.clear(); window.RLoading.show(T('ログアウトしています', 'Logging out')); location.href = 'login.html'; };
        window.RLoading.run(function () { return A.api({ action: 'logout', token: s.token }); }, { text: T('ログアウトしています', 'Logging out'), onSuccess: back, onError: back });
    });
})();
