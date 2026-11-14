/* R-ESUME LP */
(function () {
    'use strict';
    var CONFIG = window.RESUME_CONFIG || {};
    function $(s, r) { return (r || document).querySelector(s); }
    function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
    function apiReady() { return /^https:\/\//.test(CONFIG.API_URL || ''); }

    /* ---- スマホ用メニュー ---- */
    var menuBtn = $('#menuBtn'), menu = $('#mobileMenu');
    function setMenu(open) {
        menu.classList.toggle('is-open', open);
        menuBtn.setAttribute('aria-expanded', String(open));
        var T = window.RI18n ? window.RI18n.t : function (a) { return a; };
        menuBtn.setAttribute('aria-label', open ? T('メニューを閉じる', 'Close the menu') : T('メニューを開く', 'Open the menu'));
        menuBtn.removeAttribute('data-aria-en');
        menuBtn.querySelector('use').setAttribute('href', open ? '#i-close' : '#i-menu');
    }
    menuBtn.addEventListener('click', function () { setMenu(!menu.classList.contains('is-open')); });
    $all('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });

    /* ---- ふりがなの ON / OFF ---- */
    var furiBtn = $('#furiBtn');
    function syncFuri() {
        var off = document.documentElement.classList.contains('furigana-off');
        furiBtn.setAttribute('aria-pressed', String(!off));
        furiBtn.textContent = off ? 'ふりがな OFF' : 'ふりがな ON';
    }
    furiBtn.addEventListener('click', function () {
        var off = document.documentElement.classList.toggle('furigana-off');
        try { localStorage.setItem('resume_furigana', off ? 'off' : 'on'); } catch (e) {}
        syncFuri();
    });
    syncFuri();

    /* ---- ダイアログ ---- */
    $all('[data-open]').forEach(function (b) {
        b.addEventListener('click', function () {
            var d = document.getElementById(b.getAttribute('data-open'));
            if (d && d.showModal) { setMenu(false); d.showModal(); }
        });
    });
    $all('dialog:not(#rLoading)').forEach(function (d) {
        $all('[data-close]', d).forEach(function (c) { c.addEventListener('click', function () { d.close(); }); });
        d.addEventListener('click', function (e) { if (e.target === d) d.close(); }); // 外側をタップで閉じる
    });

    /* ---- ふわっと表示 ---- */
    var reveals = $all('[data-reveal]');
    if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
        }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
        reveals.forEach(function (el) { io.observe(el); });
    } else {
        reveals.forEach(function (el) { el.classList.add('is-in'); });
    }

    /* ---- 申込フォーム ---- */
    var form = $('#applyForm'), btn = $('#applyBtn');
    var I = window.RI18n, rb = I.rb, T = I.t;
    var box = I.msgBox($('#applyMsg'));
    I.onChange(function () { setMenu(menu.classList.contains('is-open')); });
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = form.name.value.trim(), email = form.email.value.trim(), pass = form.password.value;
        if (!name) { box.set('お' + rb('名前', 'なまえ') + 'を' + rb('入力', 'にゅうりょく') + 'してください。', 'Please enter your name.', 'error'); form.name.focus(); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { box.set('メールアドレスの' + rb('形式', 'けいしき') + 'を' + rb('確認', 'かくにん') + 'してください。', 'Please check your email address.', 'error'); form.email.focus(); return; }
        if (pass.length < 8 || pass.length > 64) { box.set('パスワードは8〜64' + rb('文字', 'もじ') + 'で' + rb('入力', 'にゅうりょく') + 'してください。', 'Password must be 8–64 characters.', 'error'); form.password.focus(); return; }
        if (!apiReady()) { box.set('これはデザイン' + rb('確認用', 'かくにんよう') + 'のサンプルです。お' + rb('申', 'もう') + 'し' + rb('込', 'こ') + 'みは、まだできません。', 'This is a design preview. Applications are not open yet.', 'error'); return; }

        btn.disabled = true; box.clear();
        // 処理が終わり、結果を画面に出したあとで、ローディング画面を消す
        // Content-Type を text/plain にすると、ブラウザの事前確認（プリフライト）が不要になり、GASで受け取れる
        var task = function () {
            return fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'apply', name: name, email: email, password: pass, website: form.website.value })
            }).then(function (r) { return r.json(); });
        };
        var done = function () { btn.disabled = false; };
        var opts = {
            text: T(rb('送信', 'そうしん') + 'しています', 'Sending'),
            onSuccess: function (res) {
                if (res && res.ok) {
                    box.set('お' + rb('申', 'もう') + 'し' + rb('込', 'こ') + 'みを' + rb('受', 'う') + 'け' + rb('付', 'つ') + 'けました。メールをご' + rb('確認', 'かくにん') + 'ください。', 'Thank you! Please check your email.', 'ok');
                    form.reset();
                } else if (res && res.message) {
                    box.fromServer(res.message, 'error');
                } else {
                    box.set('お' + rb('申', 'もう') + 'し' + rb('込', 'こ') + 'みできませんでした。', 'We could not accept your application.', 'error');
                }
                done();
            },
            onError: function () { box.set(rb('通信', 'つうしん') + 'できませんでした。' + rb('時間', 'じかん') + 'をおいてもう' + rb('一度', 'いちど') + 'お' + rb('試', 'ため') + 'しください。', 'Network error. Please try again.', 'error'); done(); }
        };
        if (window.RLoading) { window.RLoading.run(task, opts); }
        else { task().then(opts.onSuccess, opts.onError); }
    });

    /* ---- よくある質問のしぼりこみ ---- */
    var chips = $all('.chip'), qas = $all('.qa');
    chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
            var f = chip.getAttribute('data-filter');
            chips.forEach(function (c) { var on = c === chip; c.classList.toggle('is-on', on); c.setAttribute('aria-pressed', String(on)); });
            qas.forEach(function (q) {
                var show = f === 'all' || q.getAttribute('data-cat') === f;
                q.hidden = !show;
                if (show) q.classList.add('is-in');   // 表示のアニメーションを待たずに見せる
            });
        });
    });
})();
