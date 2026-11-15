/* R-ESUME 言語切り替え（日本語 / English）
 * - <head> で読み込み、画面が出る前に言語を決める
 * - 画面の文章は <span data-l="ja">…</span><span data-l="en">…</span> の2つを持ち、CSSで切り替える
 * - ふりがな（<ruby>）は日本語のときだけ使う */
(function () {
    'use strict';
    var KEY = 'resume_lang', root = document.documentElement, subs = [];
    function read() { try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'ja'; } catch (e) { return 'ja'; } }
    var cur = read();
    root.setAttribute('data-lang', cur);
    root.setAttribute('lang', cur);

    function lang() { return cur; }
    function t(ja, en) { return cur === 'en' ? en : ja; }
    function rb(k, y) { return '<ruby>' + k + '<rt>' + y + '</rt></ruby>'; }

    // サーバーからの日本語メッセージの英訳（ない場合は、日本語のまま出す）
    var SERVER = {
        'お名前を50文字以内で入力してください。': 'Please enter your name in 50 characters or fewer.',
        'メールアドレスの形式を確認してください。': 'Please check your email address.',
        'パスワードは8〜64文字で入力してください。': 'Password must be 8–64 characters.',
        'ただいまお申し込みが集中しています。しばらくしてからもう一度お試しください。': 'We are receiving many applications right now. Please try again in a little while.',
        'このメールアドレスはすでに登録されています。利用期限の更新は、ログイン後のマイページからお申し込みください。': 'This email address is already registered. To renew, please apply from My page after you log in.',
        'メールアドレスとパスワードを入力してください。': 'Please enter your email address and password.',
        'ログインの失敗が続いたため、15分ほど時間をおいてからお試しください。': 'There were too many failed log-in attempts. Please wait about 15 minutes and try again.',
        'メールアドレスまたはパスワードが正しくありません。': 'The email address or password is not correct.',
        'アカウントはまだ発行されていません。お支払いの確認後、メールでお知らせします。': 'Your account has not been issued yet. We will email you after we confirm your payment.',
        'このアカウントは現在ご利用いただけません。': 'This account cannot be used right now.',
        'ログインの有効期限が切れました。もう一度ログインしてください。': 'Your log-in has expired. Please log in again.',
        '別の端末でログインされたため、ログアウトしました。': 'You were logged out because you logged in on another device.',
        'リクエストの形式が正しくありません。': 'The request format is not correct.',
        '不明な操作です。': 'Unknown operation.',
        'サーバーでエラーが発生しました。時間をおいてもう一度お試しください。': 'A server error occurred. Please try again in a little while.',
        'もう一度ログインしてください。': 'Please log in again.',
        'このリンクは、期限が切れているか、すでに使われています。もう一度、パスワード再設定のメールを送ってください。': 'This link has expired or has already been used. Please send the password reset email again.',
        'ただいまメールの送信が集中しています。しばらくしてからもう一度お試しください。': 'We are sending many emails right now. Please try again in a little while.',
        'ただいま混み合っています。少し待ってから、もう一度お試しください。': 'It is busy right now. Please wait a little and try again.',
        'アカウントが見つかりません。': 'Your account was not found.',
        'このアカウントは、更新のお申し込みができません。': 'This account cannot apply for renewal.',
        'いまは、更新のお申し込みはできません。利用期限の30日前から、お申し込みできます。': 'You cannot apply for renewal right now. You can apply from 30 days before your expiry date.'
    };
    function server(text) {
        if (!text) return '';
        if (SERVER[text]) return SERVER[text];
        var r = /^すでに更新のお申し込み（(.+)）があります。/.exec(text);
        if (r) return 'You already have a renewal application (' + r[1] + '). Please pay by the deadline written in the confirmation email.';
        var m = /^このメールアドレスでは、お支払い待ちのお申し込み（(.+)）があります。/.exec(text);
        if (m) return 'This email address already has an application waiting for payment (' + m[1] + '). Please pay by the deadline written in the confirmation email.';
        return text;
    }
    // 画面に出す日本語／英語のメッセージ欄（言語を切り替えたら、その場で書き換える）
    function msgBox(el) {
        var state = null;
        function draw() {
            if (!state) { el.textContent = ''; el.className = 'form-msg'; return; }
            var v = cur === 'en' ? state.en : state.ja;
            if (state.plain) el.textContent = v; else el.innerHTML = v;
            el.className = 'form-msg' + (state.kind ? ' is-' + state.kind : '');
        }
        subs.push(draw);
        return {
            set: function (ja, en, kind) { state = { ja: ja, en: en, kind: kind, plain: false }; draw(); },
            // サーバーのメッセージ（日本語の文章のまま受け取る）
            fromServer: function (text, kind) { state = { ja: text, en: server(text), kind: kind, plain: true }; draw(); },
            clear: function () { state = null; draw(); }
        };
    }

    // <title> と aria-label の切り替え
    var titleEl = null, titleJa = '';
    function apply() {
        root.setAttribute('data-lang', cur);
        root.setAttribute('lang', cur);
        if (titleEl) { var en = titleEl.getAttribute('data-en'); document.title = (cur === 'en' && en) ? en : titleJa; }
        var els = document.querySelectorAll('[data-aria-en]');
        for (var i = 0; i < els.length; i++) {
            var e = els[i];
            if (!e.hasAttribute('data-aria-ja')) e.setAttribute('data-aria-ja', e.getAttribute('aria-label') || '');
            e.setAttribute('aria-label', cur === 'en' ? e.getAttribute('data-aria-en') : e.getAttribute('data-aria-ja'));
        }
        var bs = document.querySelectorAll('[data-set-lang]');
        for (var j = 0; j < bs.length; j++) bs[j].setAttribute('aria-pressed', String(bs[j].getAttribute('data-set-lang') === cur));
    }
    function set(l) {
        cur = l === 'en' ? 'en' : 'ja';
        try { localStorage.setItem(KEY, cur); } catch (e) {}
        apply();
        for (var i = 0; i < subs.length; i++) { try { subs[i](cur); } catch (e) {} }
    }
    function onChange(fn) { subs.push(fn); }

    window.RI18n = { lang: lang, t: t, rb: rb, set: set, onChange: onChange, server: server, msgBox: msgBox, refresh: apply };

    function init() {
        titleEl = document.querySelector('title');
        if (titleEl) titleJa = titleEl.getAttribute('data-ja') || titleEl.textContent;
        document.addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('[data-set-lang]') : null;
            if (b) set(b.getAttribute('data-set-lang'));
        });
        apply();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
