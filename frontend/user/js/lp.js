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
        menuBtn.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
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
    $all('dialog').forEach(function (d) {
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
    var form = $('#applyForm'), msg = $('#applyMsg'), btn = $('#applyBtn');
    function setMsg(text, kind) { msg.textContent = text || ''; msg.className = 'form-msg' + (kind ? ' is-' + kind : ''); }
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = form.name.value.trim(), email = form.email.value.trim(), pass = form.password.value;
        if (!name) { setMsg('お名前を入力してください。 / Please enter your name.', 'error'); form.name.focus(); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setMsg('メールアドレスの形式を確認してください。 / Please check your email address.', 'error'); form.email.focus(); return; }
        if (pass.length < 8 || pass.length > 64) { setMsg('パスワードは8〜64文字で入力してください。 / Password must be 8–64 characters.', 'error'); form.password.focus(); return; }
        if (!apiReady()) { setMsg('これはデザイン確認用のサンプルです。お申し込みは、まだできません。 / This is a design preview. Applications are not open yet.', 'error'); return; }

        btn.disabled = true; setMsg('送信しています… / Sending…');
        // Content-Type を text/plain にすると、ブラウザの事前確認（プリフライト）が不要になり、GASで受け取れる
        fetch(CONFIG.API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'apply', name: name, email: email, password: pass, website: form.website.value })
        }).then(function (r) { return r.json(); }).then(function (res) {
            if (res && res.ok) {
                setMsg('お申し込みを受け付けました。メールをご確認ください。 / Thank you! Please check your email.', 'ok');
                form.reset();
            } else {
                setMsg((res && res.message) || 'お申し込みできませんでした。', 'error');
            }
        }).catch(function () {
            setMsg('通信できませんでした。時間をおいてもう一度お試しください。 / Network error. Please try again.', 'error');
        }).then(function () { btn.disabled = false; });
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
