/* R-ESUME 共通（ログイン・マイページなどで使う） */
(function () {
    'use strict';
    var C = window.RESUME_CONFIG || {};
    var KEY = 'resume_session', FLASH = 'resume_flash';
    function rb(k, y) { return '<ruby>' + k + '<rt>' + y + '</rt></ruby>'; }
    window.RAuth = {
        rb: rb,
        ready: function () { return /^https:\/\//.test(C.API_URL || ''); },
        // Content-Type を text/plain にすると、ブラウザの事前確認（プリフライト）が不要になり、GASで受け取れる
        api: function (body) {
            return fetch(C.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
                .then(function (r) { return r.json(); });
        },
        save: function (token, user) { try { localStorage.setItem(KEY, JSON.stringify({ token: token, user: user })); } catch (e) {} },
        load: function () { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
        clear: function () { try { localStorage.removeItem(KEY); } catch (e) {} },
        flash: function (text) { try { sessionStorage.setItem(FLASH, text); } catch (e) {} },
        takeFlash: function () { var t = ''; try { t = sessionStorage.getItem(FLASH) || ''; sessionStorage.removeItem(FLASH); } catch (e) {} return t; }
    };

    // 戻るボタンで、ローディングが出たまま戻ってくるのを防ぐ
    window.addEventListener('pageshow', function (e) { if (e.persisted) location.reload(); });

    // ふりがなの ON / OFF（トップページと同じ設定を使う）
    var btn = document.getElementById('furiBtn');
    if (btn) {
        var sync = function () {
            var off = document.documentElement.classList.contains('furigana-off');
            btn.setAttribute('aria-pressed', String(!off));
            btn.textContent = off ? 'ふりがな OFF' : 'ふりがな ON';
        };
        btn.addEventListener('click', function () {
            var off = document.documentElement.classList.toggle('furigana-off');
            try { localStorage.setItem('resume_furigana', off ? 'off' : 'on'); } catch (e) {}
            sync();
        });
        sync();
    }
})();
