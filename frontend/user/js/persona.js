/* R-ESUME STAGE 1 性格診断（persona.html・2026-11-17 作り直し）
 * レジュメルが「どっちが好きか、答えてね。」→ 2択のボタン（A・B。左右はランダム）で答える（14問）→ 結果（タイプ・強み上位3・合う業種上位3＋ひとこと・目安）。
 * 結果はユーザーごとに1つ（personaSave で上書き）。途中の答えは、この端末に一時保存して続きから再開できる。
 * 音声（案B）：🔊を押したときだけ流す。せりふは p_start・p_ask（全問で同じ）・p_result の3つ（audio/ja/キー.mp3）。ファイルがないせりふは🔊を出さない。
 *   端末の読み上げには切りかえない。音が止まっても、文字とボタンで進める。
 * persona.html?back=<履歴書ID> で開いたときは、結果の画面に「履歴書の会話にもどる」を出す。 */
(function () {
    'use strict';
    var A = window.RAuth, P = window.RPersonality;
    var s = A.load();
    if (!s || !s.token || !A.ready()) { location.replace('login.html'); return; }

    function $(id) { return document.getElementById(id); }
    function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function fu(x) { return esc(x).replace(/\{([^|}]+)\|([^}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>'); }   // {漢字|よみ} → ふりがな
    var back = (location.search.match(/[?&]back=([A-Za-z0-9_-]+)/) || [])[1] || '';
    var backFix = /[?&]fix=work(&|$)/.test(location.search);   // 確認の画面の「直す」から来たとき：もどったら業種の質問だけ答え直す
    var WIP = 'resume_persona_wip3';   // 3版（2択）。前の版の途中データは使わない
    var N = P.QUESTIONS.length;
    var LINES = {
        start: { key: 'p_start', ja: 'ぼくはレジュメル！{14|じゅうよん}の{質問|しつもん}に{答|こた}えると、あなたに{合|あ}いそうな{仕事|しごと}が{分|わ}かるよ。{直感|ちょっかん}で{答|こた}えてね。' },
        ask: { key: 'p_ask', ja: 'どっちが{好|す}きか、{答|こた}えてね。' },
        flat: { key: '', ja: 'どれも{同|おな}じくらい{好|す}きみたい！もう{一度|いちど}、{直感|ちょっかん}で{選|えら}んでみてね。' },
        again: { key: '', ja: 'おかえり！{前回|ぜんかい}の{結果|けっか}だよ。{何度|なんど}でもやり{直|なお}せるよ。' },
        result: { key: 'p_result', ja: '{診断|しんだん}クリア！あなたに{合|あ}いそうな{仕事|しごと}は、これだよ。' }
    };

    var answers = {}, flip = {}, qi = 0, persona = null, msg = $('pzMsg');
    function showMsg(t) { msg.textContent = t || ''; msg.className = 'form-msg' + (t ? ' is-error' : ''); }

    /* ---------- 途中の答え（この端末だけ） ---------- */
    function saveWip() { try { localStorage.setItem(WIP, JSON.stringify({ a: answers, f: flip, i: qi })); } catch (e) {} }
    function loadWip() { try { var w = JSON.parse(localStorage.getItem(WIP) || 'null'); return w && w.a ? w : null; } catch (e) { return null; } }
    function clearWip() { try { localStorage.removeItem(WIP); } catch (e) {} }

    /* ---------- 音声（案B） ---------- */
    var audio = null;
    function stopAudio() { try { if (audio) { audio.pause(); audio.currentTime = 0; } } catch (e) {} }
    // 🔊ボタンは、音声ファイルが読めたときだけ出す
    function prepareSay(btn, key) {
        if (!key || typeof Audio === 'undefined') return;
        var a = new Audio();
        a.preload = 'metadata';
        a.addEventListener('loadedmetadata', function () { btn.hidden = false; }, { once: true });
        a.addEventListener('error', function () { btn.hidden = true; }, { once: true });
        a.src = 'audio/ja/' + key + '.mp3';
        btn.addEventListener('click', function () {
            stopAudio();
            audio = a;
            btn.classList.add('is-on');
            a.onended = a.onpause = function () { btn.classList.remove('is-on'); };
            var p; try { p = a.play(); } catch (e) { p = null; }
            if (p && p.catch) p.catch(function () { btn.classList.remove('is-on'); showMsg('音が出ないときは、文字を読んで進めてください。'); });
        });
    }

    /* ---------- 吹き出し ---------- */
    function say(line) {
        stopAudio();
        $('pzBubble').innerHTML = '<p class="pz-say">' + fu(line.ja) + '</p>' +
            (line.key ? '<button type="button" class="pz-voice" hidden aria-label="読み上げる">🔊</button>' : '');
        var b = $('pzBubble').querySelector('.pz-voice');
        if (b) prepareSay(b, line.key);
    }
    function hud(on) {
        $('pzHud').hidden = !on;
        if (!on) return;
        $('pzCount').textContent = 'Q ' + (qi + 1) + ' / ' + N;
        var h = '';
        for (var i = 0; i < N; i++) h += '<i class="' + (i < qi ? 'done' : i === qi ? 'cur' : '') + '"></i>';
        $('pzBar').innerHTML = h;
    }

    /* ---------- 画面 ---------- */
    function showStart() {
        hud(false); showMsg('');
        say(LINES.start);
        $('pzBody').innerHTML = '<button type="button" class="btn btn-lg btn-block" id="pzGo">はじめる</button>';
        $('pzGo').addEventListener('click', function () { newRound(); showQ(); });
    }
    function newRound() { answers = {}; flip = {}; P.PAIRS.forEach(function (q) { flip[q.id] = Math.random() < 0.5; }); qi = 0; saveWip(); }
    function showQ() {
        var q = P.PAIRS[qi];
        hud(true); showMsg('');
        say(LINES.ask);
        var cur = answers[q.id], opts = flip[q.id] ? [q.b, q.a] : [q.a, q.b];
        $('pzBody').innerHTML = '<div class="pz-choices" role="group" aria-label="答え">' +
            opts.map(function (o, i) {
                return '<button type="button" class="pz-choice' + (cur === o.axis ? ' is-picked' : '') + '" data-v="' + o.axis + '"><span class="pz-mark" aria-hidden="true">' + (i ? 'B' : 'A') + '</span><span>' + fu(o.ja) + '</span></button>';
            }).join('') + '</div>' +
            '<button type="button" class="pz-back" id="pzBack">← もどる</button>';
        $('pzBody').querySelector('.pz-choices').addEventListener('click', function (e) {
            var b = e.target.closest('button[data-v]'); if (!b) return;
            answers[q.id] = b.getAttribute('data-v');
            qi++; saveWip();
            if (qi >= N) finish(); else showQ();
        });
        $('pzBack').addEventListener('click', function () {
            if (qi === 0) { showStart(); return; }
            qi--; saveWip(); showQ();
        });
    }
    function finish() {
        var r = P.score(answers);
        if (r.flat) {   // どの強みも同じ：結果を出さずに、もう一度
            hud(false); say(LINES.flat);
            $('pzBody').innerHTML = '<button type="button" class="btn btn-lg btn-block" id="pzGo">もう' + fu('{一度|いちど}') + 'やる</button>';
            $('pzGo').addEventListener('click', function () { newRound(); showQ(); });
            return;
        }
        var p = {
            v: 3, mode: 'pair', answers: answers, axes: r.axes,
            top: r.topAxes.map(function (a) { return a.key; }),
            suggest: r.topIndustries.map(function (x) { return x.id; }),
            at: new Date().toISOString()
        };
        hud(false);
        window.RLoading.run(function () { return A.api({ action: 'personaSave', token: s.token, persona: p }); }, {
            onSuccess: function (res) {
                if (!res || res.ok === false) { return failSave(res); }
                persona = p; clearWip(); showResult(true);
            },
            onError: function () { failSave(null); }
        });
    }
    function failSave(res) {
        if (res && res.reason) return kick(res);
        showMsg((res && res.message) || '保存できませんでした。通信を確かめて、もう一度押してください。');
        $('pzBody').innerHTML = '<button type="button" class="btn btn-lg btn-block" id="pzRetry">もう一度保存する</button>';
        $('pzRetry').addEventListener('click', finish);
    }
    function showResult(fresh) {
        hud(false); showMsg('');
        say(fresh ? LINES.result : LINES.again);
        var p = persona, axes = p.axes || {};
        var t0 = p.top && p.top[0] && P.AXES[p.top[0]];
        var rank = ['1st', '2nd', '3rd'];
        var h = '<div class="pz-clear"><span class="pz-clear-en">STAGE 1 CLEAR</span><span class="pz-clear-ja">{診断|しんだん}クリア！</span></div>';
        if (t0) h += '<section class="pz-card pz-type"><p class="pz-h">あなたのタイプ</p><p class="pz-type-name">' + fu(t0.type) + 'タイプ</p></section>';
        h += '<section class="pz-card"><p class="pz-h">{強|つよ}み<span class="pz-h-en">TOP 3</span></p><ol class="pz-str">' +
            (p.top || []).slice(0, 3).map(function (k) {
                var v = axes[k] || 50;
                return '<li><span class="pz-str-name">' + fu(P.AXIS_RUBY[k] || P.AXES[k].ja) + '</span><span class="pz-meter" aria-hidden="true"><i style="width:' + Math.max(8, Math.min(100, v)) + '%"></i></span></li>';
            }).join('') + '</ol></section>';
        h += '<section class="pz-card"><p class="pz-h">{合|あ}いそうな{仕事|しごと}<span class="pz-h-en">TOP 3</span></p><ol class="pz-jobs">' +
            (p.suggest || []).slice(0, 3).map(function (id, i) {
                var ind = P.indById(id); if (!ind) return '';
                return '<li class="pz-job"><span class="pz-rank">' + rank[i] + '</span><div class="pz-job-body"><p class="pz-job-name">' + fu(ind.ja) + '</p>' +
                    '<p class="pz-job-ex"><span class="pz-tag">たとえば</span>' + fu(ind.ex) + '</p>' +
                    '<p class="pz-job-why">' + fu(P.reason(id, axes)) + '</p></div></li>';
            }).join('') + '</ol></section>';
        h += '<p class="pz-note">これは{目安|めやす}です。{本当|ほんとう}に{向|む}いているかは、{働|はたら}いてみて{分|わ}かることもあります。{気|き}になる{仕事|しごと}を{自由|じゆう}に{選|えら}んでください。</p>';
        h += '<div class="pz-acts">' +
            (back ? '<a class="btn btn-lg btn-block" href="chat.html' + (backFix ? '?fix=work' : '') + '#' + esc(back) + '">{履歴書|りれきしょ}の{会話|かいわ}にもどる</a>' : '') +
            '<a class="btn btn-lg btn-block' + (back ? ' btn-secondary' : '') + '" href="dashboard.html">ホームへ</a>' +
            '<button type="button" class="btn btn-lg btn-block btn-secondary" id="pzAgain">もう{一度|いちど}やる</button></div>';
        $('pzBody').innerHTML = h.replace(/\{([^|}]+)\|([^}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>');
        $('pzAgain').addEventListener('click', function () { newRound(); showQ(); window.scrollTo(0, 0); });
    }

    function kick(res) { A.clear(); A.flash((res && res.message) || 'もう一度ログインしてください。'); location.replace('login.html'); }

    /* ---------- 最初の読み込み ---------- */
    window.RLoading.hold(A.api({ action: 'personaGet', token: s.token }).then(function (res) {
        if (!res || res.ok === false) { if (res && res.reason) return kick(res); showMsg((res && res.message) || '読み込めませんでした。'); return; }
        var w = loadWip();
        if (w && w.i > 0 && w.i < N && w.f) { answers = w.a; flip = w.f; qi = w.i; showQ(); return; }   // 途中から
        persona = res.persona && res.persona.top && res.persona.top.length ? res.persona : null;
        if (persona) showResult(false); else showStart();
    }).catch(function () {
        showMsg('通信できませんでした。時間をおいて、もう一度開いてください。');
    }));
})();
