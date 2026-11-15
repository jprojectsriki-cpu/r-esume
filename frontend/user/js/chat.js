/* R-ESUME 会話で作る履歴書（R-9c）
 * 黒猫のレジュメルが質問し、答えを吹き出しで積み上げる。答えは、入力画面（resume.js）と同じ形で保存する。
 * 流れ：しごと・性格 → 基本 → 連絡先 → 留学生 → 学歴・職歴・資格 → 志望動機 → 完成（確認・修正の画面へ） */
(function () {
    'use strict';
    var A = window.RAuth, I = window.RI18n, T = I.t, P = window.RPersonality;
    var s = A.load();
    var rid = (location.hash || '').replace('#', '');
    if (!s || !s.token || !A.ready()) { location.replace('login.html'); return; }
    if (!rid) { location.replace('resume.html'); return; }

    function $(id) { return document.getElementById(id); }
    function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function fu(x) { return x.replace(/\{([^|}]+)\|([^}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>'); }
    function plain(x) { return x.replace(/\{([^|}]+)\|([^}]+)\}/g, '$1').replace(/<[^>]+>/g, ''); }
    function L(ja, en) { return T(fu(ja), esc(en)); }

    var LIM = { rows: 19, lic: 6, mot: 500, wish: 150 };
    var PMODE = rid === 'persona';   // 性格診断の画面（chat.html#persona）。履歴書とは別に、ユーザーごとに1つ保存する
    var STAGES = PMODE ? 1 : 6;
    var STATUS_LIST = ['留学', '家族滞在', '技術・人文知識・国際業務', '特定技能', '特定活動', '永住者', '日本人の配偶者等', '永住者の配偶者等', '定住者'];

    var D = null, tmp = {}, trail = [], nid = '', curG = [], dirty = false, timer = null, saving = Promise.resolve(), softKey = '', first = true, title = '';
    var box = I.msgBox($('cMsg'));
    var sayTexts = [];

    /* ---------- データ ---------- */
    function getPath(o, path) { var p = path.split('.'); for (var i = 0; i < p.length; i++) { if (o == null) return undefined; o = o[p[i]]; } return o; }
    function setPath(o, path, val) {
        var p = path.split('.');
        for (var i = 0; i < p.length - 1; i++) { if (o[p[i]] == null) o[p[i]] = {}; o = o[p[i]]; }
        o[p[p.length - 1]] = val;
    }
    function fixData(d) {
        d = d && typeof d === 'object' ? d : {};
        if (!d.era) d.era = 'seireki';
        if (d.showForeign == null) d.showForeign = true;
        ['edu', 'work', 'lic'].forEach(function (k) { if (!Array.isArray(d[k])) d[k] = []; });
        return d;
    }
    function K(key) { return { get: function () { return getPath(D, key) || ''; }, set: function (v) { setPath(D, key, v); } }; }
    function Tm(key) { return { get: function () { return tmp[key] || ''; }, set: function (v) { tmp[key] = v; } }; }
    function sortRows(rows) {
        var idx = rows.map(function (r, i) { return { r: r, i: i }; });
        idx.sort(function (a, b) {
            var ka = (+a.r.y || 99999) * 100 + (+a.r.m || 0), kb = (+b.r.y || 99999) * 100 + (+b.r.m || 0);
            return ka - kb || a.i - b.i;
        });
        return idx.map(function (x) { return x.r; });
    }
    function rowsFree(key) { return key === 'lic' ? LIM.lic - D.lic.length : LIM.rows - D.edu.length - D.work.length; }
    function rowsFull(key) { return rowsFree(key) <= 0; }
    function addRows(key, rows) {
        var ok = rowsFree(key) >= rows.length;
        if (ok) { rows.forEach(function (r) { D[key].push(r); }); D[key] = sortRows(D[key]); }
        // 1行ぶんを入れ終えたら、次の入力に前の答えが残らないように、一時の入力を消す
        ['iy', 'im', 'oy', 'om', 'school', 'company', 'state', 'lname'].forEach(function (k) { delete tmp[k]; });
        return ok;
    }
    function zen2han(v) { return String(v).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/[‐－―−ー]/g, '-'); }
    function normOf(v, kind) {
        if (kind === 'num') return zen2han(v).replace(/[^0-9]/g, '');
        if (kind === 'tel') return zen2han(v).replace(/[^0-9+\-]/g, '');
        if (kind === 'zip') return zen2han(v).replace(/[^0-9\-]/g, '');
        return v;
    }

    /* ---------- 通信・保存 ---------- */
    function kick(res) { A.clear(); A.flash((res && res.message) || 'もう一度ログインしてください。'); location.replace('login.html'); return new Promise(function () {}); }
    var quals = [];
    function qualById(id) { return quals.filter(function (q) { return q.qualId === id; })[0]; }
    function qualGroups() {
        var gs = [], ix = {};
        quals.forEach(function (q) { if (ix[q.label] == null) { ix[q.label] = gs.length; gs.push({ label: q.label, items: [] }); } gs[ix[q.label]].items.push(q); });
        gs.forEach(function (g) { g.items = g.items.map(function (q, i) { return { q: q, i: i }; }).sort(function (a, b) { return ((b.q.rank == null ? -1 : b.q.rank) - (a.q.rank == null ? -1 : a.q.rank)) || (a.i - b.i); }).map(function (x) { return x.q; }); });
        return gs;
    }
    // 同じラベルの中で複数に✔したら、順位が高いほうだけ有効（低いほうは、高いほうの名前を返す）
    function pickOff(ids) {
        var top = {}, off = {};
        ids.forEach(function (id) { var q = qualById(id); if (q && q.rank != null && (!top[q.label] || q.rank > top[q.label].rank)) top[q.label] = q; });
        ids.forEach(function (id) { var q = qualById(id); if (q && q.rank != null && top[q.label].rank > q.rank) off[id] = top[q.label].name; });
        return off;
    }
    function validPick(ids) { var off = pickOff(ids); return ids.filter(function (id) { return !off[id]; }); }
    function licAdded(q) { return D.lic.some(function (r) { return r.t === q.name; }); }
    function esc1(t) { return String(t).replace(/[{}|]/g, ''); }
    function nextLic() {
        var q = tmp.queue || [];
        if (rowsFull('lic')) { if (q.length) tmp.full = true; tmp.queue = []; return 'licMore'; }
        var id = q.shift(); tmp.queue = q;
        if (id === 'other') { tmp.lname = ''; return 'licName'; }
        var c = qualById(id); tmp.lname = c ? c.name : '';
        return 'licIn';
    }
    function api(body) { body.token = s.token; return A.api(body); }
    function fail(res) {
        if (res && res.reason) return kick(res);
        if (res && res.message) box.fromServer(res.message, 'error');
        else box.set('うまくいきませんでした。', 'Something went wrong.', 'error');
    }
    function netFail() { box.set('通信できませんでした。時間をおいてもう一度お試しください。', 'Network error. Please try again.', 'error'); }
    function saveNow() {
        var p = saving.catch(function () {}).then(function () {
            if (!dirty || !D) return { ok: true };
            dirty = false;
            var req = PMODE ? { action: 'personaSave', persona: D.persona } : { action: 'resumeSave', resumeId: rid, title: title, data: D };
            if (PMODE && !D.persona) return { ok: true };
            return api(req).then(function (res) {
                if (res && res.ok) { box.clear(); return res; }
                dirty = true; fail(res); return res;
            }, function (e) { dirty = true; netFail(); throw e; });
        });
        saving = p.catch(function () {});
        return p;
    }
    function schedule() { dirty = true; clearTimeout(timer); timer = setTimeout(function () { saveNow().catch(function () {}); }, 900); }
    function flush() { clearTimeout(timer); return saveNow(); }
    function leave(url) {
        window.RLoading.run(function () { return flush(); }, {
            text: T('保存しています', 'Saving'),
            onSuccess: function (res) { if (res && res.ok === false) return fail(res); dirty = false; location.href = url; },
            onError: netFail
        });
    }

    /* ---------- 吹き出しの部品 ---------- */
    function B(ja, en, say, spj, spe) { return { ja: ja, en: en, say: !!say, key: say ? nid : '', sj: spj, se: spe, keys: null }; }
    var CAT = '<svg width="76" height="92" viewBox="0 0 80 96" aria-hidden="true"><g stroke="#EAF2FB" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M20 96Q20 72 40 70Q60 72 60 96Z" fill="#111827"/><path d="M13 36L17 5L39 21Z" fill="#111827"/><path d="M67 36L63 5L41 21Z" fill="#111827"/><ellipse cx="40" cy="45" rx="30" ry="26" fill="#111827"/><path d="M40 72L25 65V81Z" fill="#D7263D"/><path d="M40 72L55 65V81Z" fill="#D7263D"/><rect x="36" y="68" width="8" height="8" rx="2" fill="#FFD43B"/><path d="M58 15L73 2L78 8L63 21Z" fill="#FFD43B" stroke="#14243A"/><path d="M58 15L63 21L56 22Z" fill="#14243A" stroke="#14243A" stroke-width="1"/></g><path d="M20 12L24 22L32 17Z" fill="#FFD43B"/><path d="M60 12L56 22L48 17Z" fill="#FFD43B"/><ellipse cx="27" cy="43" rx="8" ry="10" fill="#FFD43B"/><ellipse cx="53" cy="43" rx="8" ry="10" fill="#FFD43B"/><ellipse cx="27" cy="43" rx="2.6" ry="8" fill="#111827"/><ellipse cx="53" cy="43" rx="2.6" ry="8" fill="#111827"/><circle cx="30" cy="38" r="2" fill="#fff"/><circle cx="56" cy="38" r="2" fill="#fff"/><path d="M36 54H44L40 59Z" fill="#FFD43B"/><g stroke="#EAF2FB" stroke-width="2" stroke-linecap="round" fill="none"><path d="M40 59Q35 65 30 62M40 59Q45 65 50 62"/><path d="M15 52L2 49M15 58L2 61M65 52L78 49M65 58L78 61"/></g></svg>';
    var SPK = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#14243A" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
    var BACK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

    function guideHtml(items, fresh) {
        var h = '', n = 0;
        items.forEach(function (it) {
            var fr = fresh ? ' fresh' : '';
            if (it.banner) { h += '<div class="ban' + fr + '"><div class="bani">' + L(it.banner.ja, it.banner.en) + '</div></div>'; return; }
            if (it.card) { h += '<div class="card' + fr + '">' + T(fu(it.card.ja), it.card.en) + '</div>'; return; }
            if (it.hint) { h += '<p class="hint' + fr + '">' + L(it.hint.ja, it.hint.en) + '</p>'; return; }
            var say = '';
            if (it.say) { sayTexts.push({ text: T(plain(it.sj || it.ja), it.se || it.en), key: it.key, keys: it.keys }); say = '<button type="button" class="say" data-say="' + (sayTexts.length - 1) + '" aria-label="' + T('読み上げ', 'Read aloud') + '">' + SPK + '</button>'; }
            h += '<div class="grow' + (n ? ' cont' : '') + fr + '"><div class="chr">' + CAT + '</div><div class="gcol"><span class="nm">レジュメル</span><div class="gw"><div class="gb">' + L(it.ja, it.en) + say + '</div></div></div></div>';
            n++;
        });
        return h;
    }
    function userHtml(a) { return '<div class="ub"><div class="ubi">' + T(esc(a.ja), esc(a.en)) + '</div></div>'; }

    /* ---------- 入力のチェック ---------- */
    var ERR_EMPTY = { ja: '{入力|にゅうりょく}してください。', en: 'Please enter it.' };
    function chkYM(v) {
        var nowY = new Date().getFullYear();
        if (!v.y) return { ja: '{年|ねん}を{入力|にゅうりょく}してください。', en: 'Please enter the year.' };
        if (+v.y < 1900 || +v.y > nowY + 6) return { ja: '{年|ねん}（' + v.y + '）がおかしいようです。{西暦|せいれき}4{桁|けた}で{入力|にゅうりょく}してください。', en: 'The year (' + v.y + ') looks wrong. Enter 4 digits.' };
        if (v.m && (+v.m < 1 || +v.m > 12)) return { ja: '{月|つき}（' + v.m + '）がおかしいようです。1〜12で{入力|にゅうりょく}してください。', en: 'The month (' + v.m + ') looks wrong. Enter 1–12.' };
        if (!v.m) return { soft: true, ja: '{月|つき}が{空|あ}いています。このまま{送|おく}ってもいいです。', en: 'The month is empty. You can send it as it is.' };
        return null;
    }
    function validDate(y, m, d) {
        y = +y; m = +m; d = +d;
        if (!(y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
        var dt = new Date(y, m - 1, d); return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
    }
    function fmtYM(v) { return { ja: v.y + '年' + (v.m ? (+v.m) + '月' : ''), en: v.y + (v.m ? '-' + (v.m.length < 2 ? '0' : '') + (+v.m) : '') }; }

    /* ---------- 会話の台本 ---------- */
    var N = {};
    function startEdu() { return D.edu.length ? 'eduHave' : 'eduName'; }
    function startWork() { return D.work.length ? 'workHave' : 'workAsk'; }
    function startLic() { return D.lic.length ? 'licHave' : 'licAsk'; }

    // しごと・性格
    N.work = { stage: 1, kind: 'choice',
        g: function () {
            var g = [];
            if (!trail.length) g.push(B('はじめまして！わたしは{案内役|あんないやく}のレジュメル。あなたの{履歴書|りれきしょ}づくりを、いっしょに{進|すす}めます。', 'Nice to meet you! I am Rejumeru, your guide. Let us make your resume together.'));
            g.push(B('どんな{仕事|しごと}で{働|はたら}きたいですか？', 'What kind of work do you want to do?', 1));
            return g;
        },
        opts: function () { return [
            { k: 'yes', ja: '{決|き}まっている', en: 'I have decided', sj: '{業種|ぎょうしゅ}を{選|えら}ぶ', se: 'Choose the industry' },
            { k: 'no', ja: 'まだ{決|き}まっていない', en: 'Not decided yet', sj: '{性格|せいかく}の{質問|しつもん}に{答|こた}えて、{探|さが}す', se: 'Answer questions to find out' }]; },
        go: function (k) {
            D.persona = D.persona || {};
            tmp.afterInd = 'name';
            if (k === 'yes') return 'industry';
            return D.persona.top && D.persona.top.length ? 'suggest' : 'noDiag';
        } };
    // 性格診断の結果があるときは、合いそうな仕事から選ぶ
    N.suggest = { stage: 1, kind: 'choice',
        g: function () { return [B('{診断|しんだん}の{結果|けっか}から、{合|あ}いそうな{仕事|しごと}はこの3つ！どれにする？（これは{目安|めやす}です）', 'From your diagnosis, these three may suit you! Which one? (This is only a guide.)', 1)]; },
        opts: function () {
            var o = (D.persona.suggest || []).slice(0, 3).map(function (id, i) { var x = indById(id); return x ? { k: id, ja: x.ja, en: x.en, rank: String(i + 1) } : null; }).filter(Boolean);
            o.push({ k: 'other', ja: 'ほかの{仕事|しごと}から{選|えら}ぶ', en: 'Choose another industry' });
            return o;
        },
        go: function (k) {
            if (k === 'other') { tmp.afterInd = 'name'; return 'industry'; }
            D.persona.industry = k; return 'name';
        } };
    // まだ性格診断をしていないとき
    N.noDiag = { stage: 1, kind: 'choice',
        g: function () { return [B('まだ{決|き}まっていないなら、{性格診断|せいかくしんだん}がおすすめ！{合|あ}いそうな{仕事|しごと}が{分|わ}かるよ。', 'If you have not decided, try the personality diagnosis. It shows what may suit you.', 1)]; },
        opts: function () { return [
            { k: 'go', ja: '{性格診断|せいかくしんだん}をする', en: 'Take the diagnosis', sj: '{終|お}わったら、ここに{戻|もど}れます', se: 'You can come back here afterwards' },
            { k: 'pick', ja: '{自分|じぶん}で{業種|ぎょうしゅ}を{選|えら}ぶ', en: 'Choose an industry myself' }]; },
        go: function (k) { if (k === 'go') return { nav: 'chat.html#persona' }; tmp.afterInd = 'name'; return 'industry'; } };
    // 診断の結果と選んだ業種が合わないときの、ひとこと
    N.advice = { stage: 1, kind: 'choice',
        g: function () {
            var sg = (D.persona.suggest || []).slice(0, 3).map(function (id) { var x = indById(id); return x ? x.ja.replace(/\{([^|}]+)\|([^}]+)\}/g, '$1') : ''; }).filter(Boolean).join('・');
            var me = indById(D.persona.industry), t = topNames();
            return [B('{診断|しんだん}では、「' + esc1(sg) + '」が{合|あ}いそうでした。', 'The diagnosis suggested: ' + sg + '.'),
                B('「' + esc1(me ? me.ja.replace(/\{([^|}]+)\|([^}]+)\}/g, '$1') : '') + '」も{大丈夫|だいじょうぶ}！' + (t ? '{志望動機|しぼうどうき}では、あなたの{強|つよ}み（' + esc1(t.ja) + '）が、その{仕事|しごと}でどう{活|い}きるかを{伝|つた}えよう。' : ''), 'It is fine to choose it!', 1)];
        },
        opts: function () { return [{ k: 'next', ja: 'つぎへ', en: 'Next' }]; },
        go: function () { return 'name'; } };
    N.industry = { stage: 1, kind: 'choice',
        g: function () { return [B('どの{業種|ぎょうしゅ}ですか？', 'Which industry?', 1)]; },
        opts: function () {
            var o = P.INDUSTRIES.map(function (x) { return { k: x.id, ja: x.ja, en: x.en }; });
            o.push({ k: 'other', ja: 'ほかの{業種|ぎょうしゅ}', en: 'Another industry' });
            return o;
        },
        go: function (k) {
            D.persona = D.persona || {}; D.persona.industry = k;
            var sg = D.persona.suggest || [];
            if (k !== 'other' && sg.length && sg.indexOf(k) < 0) return 'advice';   // 診断と合わないとき
            return 'name';
        } };
    function indById(id) { return P.INDUSTRIES.filter(function (x) { return x.id === id; })[0]; }
    var SCALE_JA = { 5: 'そう思う', 4: 'ややそう思う', 3: 'どちらでもない', 2: 'あまり思わない', 1: 'そう思わない' };
    var SCALE_EN = { 5: 'Agree', 4: 'Somewhat agree', 3: 'Neutral', 2: 'Not really', 1: 'Disagree' };
    N.q = { stage: 1, kind: 'scale',
        g: function () {
            var qs = P.questions(D.persona.mode), i = tmp.qi || 0, q = qs[i], g = [];
            if (i === 0) g.push(B('{直感|ちょっかん}で{答|こた}えてね。いちばん{近|ちか}いものを{選|えら}んで！', 'Answer by instinct. Pick the one closest to you.'));
            var qb = B('<b>Q' + (i + 1) + '/' + qs.length + '</b>　' + q.ja, 'Q' + (i + 1) + '/' + qs.length + '  ' + q.en, 1, q.ja, q.en);
            qb.key = 'q' + q.id; g.push(qb);
            return g;
        },
        go: function (v) {
            var qs = P.questions(D.persona.mode), i = tmp.qi || 0;
            D.persona.answers[qs[i].id] = +v; tmp.qi = i + 1;
            return nextQ(qs);
        } };
    function nextQ(qs) { return tmp.qi < qs.length ? (qs[tmp.qi].pair ? 'qc' : 'q') : 'pResult'; }
    // 「どちらが近い？」の2択（かならず強みに差が出る）
    N.qc = { stage: 1, kind: 'choice',
        g: function () {
            var qs = P.questions(D.persona.mode), i = tmp.qi || 0, q = qs[i];
            var qb = B('<b>Q' + (i + 1) + '/' + qs.length + '</b>　' + q.ja, 'Q' + (i + 1) + '/' + qs.length + '  ' + q.en, 1, q.ja, q.en);
            qb.key = 'qpair'; return [qb];          // 「どちらが…」は1つの音声を共通で使う
        },
        opts: function () {
            var qs = P.questions(D.persona.mode), q = qs[tmp.qi || 0];
            return q.pair.map(function (o) { return { k: o.axis, ja: o.ja, en: o.en }; });
        },
        go: function (k) {
            var qs = P.questions(D.persona.mode), i = tmp.qi || 0;
            D.persona.answers[qs[i].id] = k; tmp.qi = i + 1;
            return nextQ(qs);
        } };
    function strengthCard(r) {
        function mk(en) {
            return '<div class="cardi"><h3>' + (en ? 'Your top 3 strengths' : 'あなたの{強|つよ}み TOP3') + '</h3>' + r.topAxes.map(function (a) {
                var n = Math.max(1, Math.round(a.pct / 20)), segs = '';
                for (var i = 0; i < 5; i++) segs += '<i' + (i < n ? ' class="on"' : '') + '></i>';
                return '<div class="row"><span class="n">' + esc(en ? a.en : a.ja) + '</span><span class="m">' + segs + '</span></div>';
            }).join('') + '</div>';
        }
        return { ja: mk(false), en: mk(true) };
    }
    // 性格診断（別の画面）：はじめ → 質問 → 結果
    N.pStart = { stage: 1, kind: 'choice',
        g: function () { return [B('はじめまして！わたしは{案内役|あんないやく}のレジュメル。あなたの{強|つよ}みと、{合|あ}いそうな{仕事|しごと}を{探|さが}そう！', 'Nice to meet you! I am Rejumeru. Let us find your strengths and the jobs that may suit you!'), B('24{個|こ}の{質問|しつもん}に、{直感|ちょっかん}で{答|こた}えてね。', 'Answer 24 questions by instinct. It takes about 5 minutes.', 1)]; },
        opts: function () { return [{ k: 'start', ja: 'はじめる', en: 'Start' }]; },
        go: function () { D.persona = { mode: 'full', answers: {} }; tmp.qi = 0; return 'q'; } };
    N.pResult = { stage: 1, kind: 'choice',
        g: function () {
            var r = P.score(D.persona.answers, D.persona.mode);
            if (r.flat) {   // 答えに差が出なかった：おすすめは出さず、保存もしない
                tmp.res = r; D.persona = { mode: D.persona.mode, answers: {} };
                return [B('あれ？{答|こた}えに{差|さ}が{出|で}なかったよ。どれも{同|おな}じくらいの{強|つよ}さになってしまったので、おすすめを{出|だ}せません。', 'Your answers showed no difference, so I cannot give a recommendation.'),
                    B('{直感|ちょっかん}で、「そう{思|おも}う」と「{思|おも}わない」を{使|つか}い{分|わ}けてみてね。もう{一度|いちど}やってみよう！', 'Try using both Agree and Disagree. Let us try again!', 1)];
            }
            D.persona.axes = r.axes;
            D.persona.top = r.topAxes.map(function (a) { return a.key; });
            D.persona.suggest = r.topIndustries.map(function (x) { return x.id; });
            tmp.res = r;
            var names = r.topIndustries.map(function (x) { return x.ja.replace(/\{([^|}]+)\|([^}]+)\}/g, '$1'); }).join('・');
            return [{ banner: { ja: '{診断|しんだん}クリア！', en: 'Done!' } }, { card: strengthCard(r) },
                (function () {
                    var b = B('{合|あ}いそうな{仕事|しごと}は、「' + esc1(names) + '」！（これは{目安|めやす}です）{履歴書|りれきしょ}づくりで、{業種|ぎょうしゅ}を{選|えら}ぶときに{使|つか}われます。', 'These jobs may suit you. This is only a guide, and it is used when you choose an industry for your resume.', 1);
                    // 音声は「前半＋業種名×3＋後半」の部品をつないで流す（業種名は ind_<id>.mp3）
                    b.keys = ['pResultA'].concat(r.topIndustries.map(function (x) { return 'ind_' + x.id; }), ['pResultB']);
                    return b;
                })()];
        },
        opts: function () {
            var again = { k: 'again', ja: 'もう{一度|いちど}{診断|しんだん}する', en: 'Take it again' }, home = { k: 'home', ja: 'ホームへ', en: 'Back to home' };
            return tmp.res && tmp.res.flat ? [again, home] : [home, again];
        },
        go: function (k) {
            if (k === 'again') { D.persona = { mode: 'full', answers: {} }; tmp.qi = 0; return 'q'; }
            return { nav: 'dashboard.html' };
        } };

    // 基本
    N.name = { stage: 2, kind: 'text', req: 1, max: 60, ac: 'name', val: K('name'),
        g: function () { return [B('あなたの{名前|なまえ}を{教|おし}えて！', 'Tell me your name!', 1), { hint: { ja: 'パスポートと{同|おな}じ、ローマ{字|じ}かカタカナで{書|か}いてください。{例|れい}：RAM BAHADUR THAPA', en: 'Write it in Roman letters or katakana, as in your passport. Example: RAM BAHADUR THAPA' } }]; },
        go: function () { return 'nameFuri'; } };
    N.nameFuri = { stage: 2, kind: 'text', req: 1, max: 60, val: K('nameFuri'),
        g: function () { return [B('{名前|なまえ}の{読|よ}みかた（ふりがな）を、カタカナで{教|おし}えて！', 'How do you read your name? Write the reading in katakana.', 1), { hint: { ja: '{例|れい}：ラム バハドゥル タパ', en: 'Example: ラム バハドゥル タパ' } }]; },
        go: function () { return 'gender'; } };
    N.gender = { stage: 2, kind: 'choice',
        g: function () { return [B('{性別|せいべつ}を{教|おし}えて！（{選|えら}ばなくても{大丈夫|だいじょうぶ}です）', 'What is your gender? (You can leave it blank.)', 1)]; },
        opts: function () { return [{ k: '男', ja: '{男|おとこ}', en: 'Male' }, { k: '女', ja: '{女|おんな}', en: 'Female' }, { k: '', ja: '{選|えら}ばない', en: 'Leave blank' }]; },
        go: function (k) { D.gender = k; return 'birth'; } };
    N.birth = { stage: 2, kind: 'date3', req: 1,
        val: { get: function () { return { y: D.bY || '', m: D.bM || '', d: D.bD || '' }; }, set: function (v) { D.bY = v.y; D.bM = v.m; D.bD = v.d; } },
        g: function () { return [B('{生年月日|せいねんがっぴ}を{教|おし}えて！（{西暦|せいれき}）', 'What is your date of birth? (Western calendar)', 1)]; },
        check: function (v) {
            if (!validDate(v.y, v.m, v.d)) return { ja: '{日付|ひづけ}がおかしいようです。{年|ねん}・{月|つき}・{日|ひ}を{確認|かくにん}してください。', en: 'The date looks wrong. Please check the year, month and day.' };
            var a = new Date().getFullYear() - +v.y;
            if (a < 14 || a > 80) return { soft: true, ja: '{年|ねん}を{確認|かくにん}してください。このまま{送|おく}ってもいいです。', en: 'Please check the year. You can send it as it is.' };
            return null;
        },
        go: function () { return 'zip'; } };

    // 連絡先
    N.zip = { stage: 3, kind: 'text', opt: 1, max: 8, norm: 'zip', im: 'numeric', ph: '902-0062', ac: 'postal-code', val: K('zip'),
        g: function () { return [B('{郵便番号|ゆうびんばんごう}は？（わからなければ、スキップ）', 'What is your postal code? (Skip if you do not know.)', 1)]; },
        check: function (v) { return v && v.replace(/\D/g, '').length !== 7 ? { soft: true, ja: '7{桁|けた}の{数字|すうじ}です。このまま{送|おく}ってもいいです。', en: 'It has 7 digits. You can send it as it is.' } : null; },
        go: function () { return 'addr'; } };
    N.addr = { stage: 3, kind: 'text', req: 1, max: 120, ac: 'street-address', val: K('addr'),
        g: function () { return [B('{今|いま}{住|す}んでいる{住所|じゅうしょ}を{教|おし}えて！', 'What is your current address?', 1)]; },
        go: function () { return 'addrFuri'; } };
    N.addrFuri = { stage: 3, kind: 'text', opt: 1, max: 120, val: K('addrFuri'),
        g: function () { return [B('{住所|じゅうしょ}の{読|よ}みかた（ふりがな）も{教|おし}えて！', 'How do you read the address? (furigana)', 1)]; },
        go: function () { return 'phone'; } };
    N.phone = { stage: 3, kind: 'text', req: 1, max: 20, norm: 'tel', im: 'tel', ac: 'tel', val: K('phone'),
        g: function () { return [B('{電話番号|でんわばんごう}は？', 'What is your phone number?', 1)]; },
        check: function (v) { return v && v.replace(/\D/g, '').length < 9 ? { soft: true, ja: '{数字|すうじ}が{少|すく}ないようです。このまま{送|おく}ってもいいです。', en: 'There seem to be too few digits. You can send it as it is.' } : null; },
        go: function () { return 'email'; } };
    N.email = { stage: 3, kind: 'text', req: 1, max: 100, ac: 'email', im: 'email', val: K('email'),
        g: function () { return [B('メールアドレスは？', 'What is your email address?', 1)]; },
        check: function (v) { return v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? { soft: true, ja: 'メールアドレスの{形|かたち}を{確認|かくにん}してください。このまま{送|おく}ってもいいです。', en: 'Please check the email address. You can send it as it is.' } : null; },
        go: function () { return 'altOn'; } };
    N.altOn = { stage: 3, kind: 'choice',
        g: function () { return [B('{連絡|れんらく}をとる{場所|ばしょ}は、{住所|じゅうしょ}と{同|おな}じですか？', 'Is the place we contact you the same as your address?', 1)]; },
        opts: function () { return [{ k: 'same', ja: '{同|おな}じ', en: 'The same' }, { k: 'diff', ja: '{違|ちが}う', en: 'Different' }]; },
        go: function (k) { D.altOn = (k === 'diff'); return k === 'diff' ? 'altZip' : 'nationality'; } };
    N.altZip = { stage: 3, kind: 'text', opt: 1, max: 8, norm: 'zip', im: 'numeric', val: K('altZip'),
        g: function () { return [B('{連絡先|れんらくさき}の{郵便番号|ゆうびんばんごう}は？', 'Postal code of your contact address?', 1)]; }, go: function () { return 'altAddr'; } };
    N.altAddr = { stage: 3, kind: 'text', req: 1, max: 120, val: K('altAddr'),
        g: function () { return [B('{連絡先|れんらくさき}の{住所|じゅうしょ}は？', 'What is the contact address?', 1)]; }, go: function () { return 'altPhone'; } };
    N.altPhone = { stage: 3, kind: 'text', opt: 1, max: 20, norm: 'tel', im: 'tel', val: K('altPhone'),
        g: function () { return [B('{連絡先|れんらくさき}の{電話番号|でんわばんごう}は？', 'Phone number of the contact address?', 1)]; }, go: function () { return 'altEmail'; } };
    N.altEmail = { stage: 3, kind: 'text', opt: 1, max: 100, im: 'email', val: K('altEmail'),
        g: function () { return [B('{連絡先|れんらくさき}のメールアドレスは？', 'Email address of the contact address?', 1)]; }, go: function () { return 'nationality'; } };

    // 留学生
    N.nationality = { stage: 4, kind: 'text', opt: 1, max: 40, ph: 'ネパール', val: K('nationality'),
        g: function () { return [B('ここからは、{留学生|りゅうがくせい}のための{質問|しつもん}です。{国籍|こくせき}は？', 'Now some questions for international students. What is your nationality?', 1)]; },
        go: function () { return 'status'; } };
    N.status = { stage: 4, kind: 'choice',
        g: function () { return [B('{在留資格|ざいりゅうしかく}は？', 'What is your status of residence?', 1)]; },
        opts: function () {
            var o = STATUS_LIST.map(function (x) { return { k: x, ja: x, en: x }; });
            o.push({ k: '__other', ja: 'ほかの{資格|しかく}', en: 'Another status' }); o.push({ k: '', ja: '{書|か}かない', en: 'Leave blank' });
            return o;
        },
        go: function (k) { if (k === '__other') return 'statusOther'; D.status = k; return 'workPermit'; } };
    N.statusOther = { stage: 4, kind: 'text', req: 1, max: 40, val: K('status'),
        g: function () { return [B('{在留資格|ざいりゅうしかく}の{名前|なまえ}を{入力|にゅうりょく}してください。', 'Please type the name of your status.', 1)]; }, go: function () { return 'workPermit'; } };
    N.workPermit = { stage: 4, kind: 'choice',
        g: function () { return [B('{資格外活動許可|しかくがいかつどうきょか}は、ありますか？（アルバイトに{応募|おうぼ}するとき、よく{聞|き}かれます）', 'Do you have permission to engage in other activities? (Often asked when applying for part-time jobs.)', 1)]; },
        opts: function () { return [{ k: 'あり', ja: 'あり', en: 'Yes' }, { k: 'なし', ja: 'なし', en: 'No' }, { k: '', ja: '{書|か}かない', en: 'Leave blank' }]; },
        go: function (k) { D.workPermit = k; return 'statusExp'; } };
    N.statusExp = { stage: 4, kind: 'date3', opt: 1,
        val: { get: function () { var p = String(D.statusExp || '').split('-'); return { y: p[0] || '', m: p[1] ? String(+p[1]) : '', d: p[2] ? String(+p[2]) : '' }; },
            set: function (v) { D.statusExp = v.y ? v.y + '-' + (v.m.length < 2 ? '0' : '') + v.m + '-' + (v.d.length < 2 ? '0' : '') + v.d : ''; } },
        g: function () { return [B('{在留期限|ざいりゅうきげん}は？（{在留|ざいりゅう}カードに{書|か}いてあります）', 'When does your stay expire? (It is on your residence card.)', 1)]; },
        check: function (v) { return validDate(v.y, v.m, v.d) ? null : { ja: '{日付|ひづけ}がおかしいようです。{年|ねん}・{月|つき}・{日|ひ}を{確認|かくにん}してください。', en: 'The date looks wrong. Please check the year, month and day.' }; },
        go: function () { return 'jlpt'; } };
    N.jlpt = { stage: 4, kind: 'choice',
        g: function () { return [B('{日本語|にほんご}の{試験|しけん}（JLPT）は、どのレベルですか？', 'Which level of the Japanese test (JLPT) do you have?', 1)]; },
        opts: function () { return [{ k: 'N1', ja: 'N1', en: 'N1' }, { k: 'N2', ja: 'N2', en: 'N2' }, { k: 'N3', ja: 'N3', en: 'N3' }, { k: 'N4', ja: 'N4', en: 'N4' }, { k: 'N5', ja: 'N5', en: 'N5' }, { k: '受験予定', ja: '{受験予定|じゅけんよてい}', en: 'Planning to take it' }, { k: '', ja: '{書|か}かない', en: 'Leave blank' }]; },
        go: function (k) { D.jlpt = k; return 'showForeign'; } };
    N.showForeign = { stage: 4, kind: 'choice',
        g: function () { return [B('ここまでの{留学生|りゅうがくせい}の{情報|じょうほう}を、{履歴書|りれきしょ}に{載|の}せますか？', 'Do you want to print this student information on your resume?', 1)]; },
        opts: function () { return [{ k: 'yes', ja: '{載|の}せる', en: 'Print it' }, { k: 'no', ja: '{載|の}せない', en: 'Do not print it' }]; },
        go: function (k) { D.showForeign = (k === 'yes'); return startEdu(); } };

    // 学歴・職歴・資格
    function haveNode(key, addId, nextFn, jaWhat, enWhat) {
        return { stage: 5, kind: 'choice',
            g: function () {
                var n = D[key].length;
                return [B(jaWhat + 'は、もう' + n + '{行|ぎょう}{入|はい}っています。', enWhat + ' already has ' + n + ' row(s).'), B('どうしますか？', 'What would you like to do?', 1)];
            },
            opts: function () {
                var o = [{ k: 'keep', ja: 'このままでよい', en: 'Keep as it is' }];
                if (!rowsFull(key)) o.push({ k: 'add', ja: '{足|た}す', en: 'Add more' });
                return o;
            },
            go: function (k) { return k === 'add' ? addId : nextFn(); } };
    }
    function moreNode(key, addId, nextFn, qJa, qEn, yesJa, yesEn, noJa, noEn) {
        return { stage: 5, kind: 'choice',
            g: function () {
                var g = [tmp.full ? B('{行|ぎょう}がいっぱいで、{追加|ついか}できませんでした。', 'The rows are full, so I could not add it.') : B('{入力|にゅうりょく}しました！', 'Added!')];
                if (!rowsFull(key)) g.push(B(qJa, qEn, 1));
                return g;
            },
            opts: function () {
                var o = [];
                if (!rowsFull(key)) o.push({ k: 'y', ja: yesJa, en: yesEn });
                o.push({ k: 'n', ja: noJa, en: noEn });
                return o;
            },
            go: function (k) { tmp.full = false; return k === 'y' ? addId : nextFn(); } };
    }
    function ymNode(stage, jaQ, enQ, kY, kM, fn) {
        return { stage: stage, kind: 'ym', req: 1,
            val: { get: function () { return { y: tmp[kY] || '', m: tmp[kM] || '' }; }, set: function (v) { tmp[kY] = v.y; tmp[kM] = v.m; } },
            g: function () { return [typeof jaQ === 'function' ? jaQ() : B(jaQ, enQ, 1)]; },
            check: function (v) { return chkYM(v); },
            go: function (v) { return fn(v); } };
    }
    function textNode(stage, jaQ, enQ, key, ph, nextId) {
        return { stage: stage, kind: 'text', req: 1, max: 30, ph: ph || '', val: Tm(key),
            g: function () { return [B(jaQ, enQ, 1), { hint: { ja: '30{字|じ}までです。', en: 'Up to 30 characters.' } }]; },
            go: function () { return nextId; } };
    }
    // 学歴
    N.eduHave = haveNode('edu', 'eduName', startWork, '{学歴|がくれき}', 'Education');
    N.eduName = textNode(5, '{学校|がっこう}の{名前|なまえ}と{学部|がくぶ}を{教|おし}えて！{高校|こうこう}から{順|じゅん}に{入力|にゅうりょく}します。', 'Tell me the school and department, starting from high school.', 'school', '東京ABC大学 経営学部', 'eduIn');
    N.eduIn = ymNode(5, '{入学|にゅうがく}した{年月|ねんげつ}は？', 'When did you enter the school?', 'iy', 'im', function () { return 'eduState'; });
    N.eduState = { stage: 5, kind: 'choice',
        g: function () { return [B('いまの{状況|じょうきょう}は？', 'What is the situation now?', 1)]; },
        opts: function () { return [{ k: '卒業', ja: '{卒業|そつぎょう}した', en: 'Graduated' }, { k: '卒業見込', ja: '{卒業|そつぎょう}する{予定|よてい}', en: 'Will graduate' }, { k: '', ja: '{通|かよ}っている', en: 'Still attending' }, { k: '中途退学', ja: '{途中|とちゅう}でやめた', en: 'Left before graduating' }]; },
        go: function (k) {
            tmp.state = k;
            if (k) return 'eduOut';
            tmp.full = !addRows('edu', [{ y: tmp.iy, m: tmp.im, t: tmp.school, k: '入学' }]);
            return 'eduMore';
        } };
    N.eduOut = ymNode(5, function () {
        var st = tmp.state;
        var eb = B(st === '卒業見込' ? '{卒業|そつぎょう}する{予定|よてい}の{年月|ねんげつ}は？' : (st === '卒業' ? '{卒業|そつぎょう}した{年月|ねんげつ}は？' : 'やめた{年月|ねんげつ}は？'),
            st === '卒業見込' ? 'When will you graduate?' : (st === '卒業' ? 'When did you graduate?' : 'When did you leave?'), 1);
        eb.key = 'eduOut_' + (st === '卒業見込' ? 'plan' : (st === '卒業' ? 'grad' : 'left'));
        return eb;
    }, '', 'oy', 'om', function () {
        tmp.full = !addRows('edu', [{ y: tmp.iy, m: tmp.im, t: tmp.school, k: '入学' }, { y: tmp.oy, m: tmp.om, t: tmp.school, k: tmp.state }]);
        return 'eduMore';
    });
    N.eduMore = moreNode('edu', 'eduName', startWork, 'ほかの{学校|がっこう}もありますか？', 'Is there another school?', 'ある（もう{1|ひと}つ{入力|にゅうりょく}）', 'Yes (add another)', 'ない（{職歴|しょくれき}へ）', 'No (go to work history)');
    // 職歴
    N.workHave = haveNode('work', 'workName', startLic, '{職歴|しょくれき}', 'Work history');
    N.workAsk = { stage: 5, kind: 'choice',
        g: function () { return [B('アルバイトや{仕事|しごと}の{経験|けいけん}は、ありますか？（アルバイトも{書|か}けます）', 'Do you have any work experience, including part-time jobs?', 1)]; },
        opts: function () { return [{ k: 'y', ja: 'ある', en: 'Yes' }, { k: 'n', ja: 'ない（{資格|しかく}へ）', en: 'No (go to qualifications)' }]; },
        go: function (k) { return k === 'y' ? 'workName' : startLic(); } };
    N.workName = textNode(5, '{会社|かいしゃ}の{名前|なまえ}と{仕事|しごと}を{教|おし}えて！', 'Tell me the company and your job.', 'company', 'ABC 販売スタッフ（アルバイト）', 'workIn');
    N.workIn = ymNode(5, '{入社|にゅうしゃ}した{年月|ねんげつ}は？', 'When did you join?', 'iy', 'im', function () { return 'workState'; });
    N.workState = { stage: 5, kind: 'choice',
        g: function () { return [B('いまも{働|はたら}いていますか？', 'Do you still work there?', 1)]; },
        opts: function () { return [{ k: 'now', ja: 'いまも{働|はたら}いている', en: 'Yes, I still work there' }, { k: 'left', ja: 'やめた', en: 'No, I left' }]; },
        go: function (k) {
            if (k === 'left') return 'workOut';
            tmp.full = !addRows('work', [{ y: tmp.iy, m: tmp.im, t: tmp.company, k: '入社' }, { y: '', m: '', t: '', k: '現在に至る' }]);
            return 'workMore';
        } };
    N.workOut = ymNode(5, '{退社|たいしゃ}した{年月|ねんげつ}は？', 'When did you leave?', 'oy', 'om', function () {
        tmp.full = !addRows('work', [{ y: tmp.iy, m: tmp.im, t: tmp.company, k: '入社' }, { y: tmp.oy, m: tmp.om, t: tmp.company, k: '退社' }]);
        return 'workMore';
    });
    N.workMore = moreNode('work', 'workName', startLic, 'ほかにもありますか？', 'Is there another one?', 'ある（もう{1|ひと}つ{入力|にゅうりょく}）', 'Yes (add another)', 'ない（{資格|しかく}へ）', 'No (go to qualifications)');
    // 資格
    N.licHave = haveNode('lic', 'licPick', function () { return 'motive'; }, '{免許|めんきょ}・{資格|しかく}', 'Qualifications');
    N.licAsk = { stage: 5, kind: 'choice',
        g: function () { return [B('{持|も}っている{資格|しかく}や{免許|めんきょ}は、ありますか？（JLPTなど）', 'Do you have any qualifications or licenses (such as the JLPT)?', 1)]; },
        opts: function () { return [{ k: 'y', ja: 'ある', en: 'Yes' }, { k: 'n', ja: 'ない（{志望動機|しぼうどうき}へ）', en: 'No (go to motivation)' }]; },
        go: function (k) { return k === 'y' ? 'licPick' : 'motive'; } };
    N.licPick = { stage: 5, kind: 'pick',
        val: { get: function () { return tmp.picked || []; }, set: function (v) { tmp.picked = v; } },
        g: function () { return [B('{持|も}っている{資格|しかく}や{免許|めんきょ}を、✔で{選|えら}んでね。いくつでも{大丈夫|だいじょうぶ}！', 'Tick the qualifications and licenses you have. You can choose as many as you like.', 1), { hint: { ja: '{同|おな}じ{種類|しゅるい}で{複数|ふくすう}✔したら、{高|たか}いほうだけが{有効|ゆうこう}になります。{一覧|いちらん}にないときは「その{他|ほか}」へ。', en: 'If you tick several in the same group, only the highest one counts. Use "Other" if it is not on the list.' } }]; },
        go: function (v) { v = v || []; tmp.picked = []; if (!v.length) return 'motive'; tmp.queue = v.slice(); return nextLic(); } };
    N.licName = textNode(5, '{資格|しかく}や{免許|めんきょ}の{名前|なまえ}は？', 'What is the name of the qualification or license?', 'lname', '日本語能力試験 N2 合格', 'licIn');
    N.licIn = ymNode(5, '{取|と}った{年月|ねんげつ}は？', 'When did you get it?', 'iy', 'im', function () {
        tmp.full = !addRows('lic', [{ y: tmp.iy, m: tmp.im, t: tmp.lname }]);
        return (tmp.queue && tmp.queue.length) ? nextLic() : 'licMore';
    });
    N.licIn.g = function () { return [B('「' + esc1(tmp.lname) + '」', '"' + esc1(tmp.lname) + '"'), B('{取|と}った{年月|ねんげつ}は？', 'When did you get it?', 1)]; };
    N.licMore = moreNode('lic', 'licPick', function () { return 'motive'; }, 'ほかにもありますか？', 'Is there another one?', 'ある（もう{1|ひと}つ{入力|にゅうりょく}）', 'Yes (add another)', 'ない（{志望動機|しぼうどうき}へ）', 'No (go to motivation)');

    // 志望動機など
    function topNames() {
        var p = D.persona; if (!p || !p.top || !p.top.length) return null;
        return { ja: p.top.map(function (k) { return P.AXES[k].ja; }).join('、'), en: p.top.map(function (k) { return P.AXES[k].en; }).join(', ') };
    }
    N.motive = { stage: 6, kind: 'long', opt: 1, val: K('motive'),
        maxFn: function () { return Math.max(0, LIM.mot - String(D.special || '').length); },
        g: function () {
            var g = [B('{志望|しぼう}の{動機|どうき}を{書|か}こう！{自分|じぶん}の{言葉|ことば}で{大丈夫|だいじょうぶ}です。', 'Let us write your reason for applying. Your own words are fine.', 1)];
            var t = topNames();
            g.push({ hint: { ja: '{志望動機|しぼうどうき}と{特技|とくぎ}は{合計|ごうけい}' + LIM.mot + '{字|じ}までです。' + (t ? 'あなたの{強|つよ}み：' + t.ja : ''), en: 'Reason and skills: up to ' + LIM.mot + ' characters in total.' + (t ? ' Your strengths: ' + t.en : '') } });
            return g;
        },
        go: function () { return 'special'; } };
    N.special = { stage: 6, kind: 'long', opt: 1, val: K('special'),
        maxFn: function () { return Math.max(0, LIM.mot - String(D.motive || '').length); },
        g: function () { return [B('{特技|とくぎ}や{好|す}きな{学科|がっか}、アピールポイントを{書|か}こう！', 'Write your skills, favorite subjects and strengths.', 1)]; },
        go: function () { return 'wish'; } };
    N.wish = { stage: 6, kind: 'long', opt: 1, val: K('wish'), maxFn: function () { return LIM.wish; },
        g: function () { return [B('{会社|かいしゃ}に{伝|つた}えたい{希望|きぼう}は、ありますか？（なければ、スキップ）', 'Is there anything you want to tell the company? (Skip if not.)', 1), { hint: { ja: LIM.wish + '{字|じ}までです。{空|から}のときは「{貴社|きしゃ}の{規定|きてい}に{従|したが}います」と{印刷|いんさつ}します。', en: 'Up to ' + LIM.wish + ' characters. If empty, a standard sentence is printed.' } }]; },
        go: function () { return 'done'; } };
    N.done = { stage: 6, kind: 'choice',
        g: function () { return [{ banner: { ja: '{完成|かんせい}！', en: 'Complete!' } }, B('できました！{履歴書|りれきしょ}のもとが{完成|かんせい}しました。{確認|かくにん}・{修正|しゅうせい}の{画面|がめん}で、{内容|ないよう}を{見|み}てね。', 'It is ready! Your resume draft is complete. Check and edit it on the next screen.', 1)]; },
        opts: function () { return [{ k: 'edit', ja: '{確認|かくにん}・{修正|しゅうせい}の{画面|がめん}へ', en: 'Check and edit' }, { k: 'list', ja: '{履歴書|りれきしょ}の{一覧|いちらん}へ', en: 'Back to the list' }]; },
        go: function (k) { return { nav: k === 'edit' ? 'resume.html#' + rid : 'resume.html' }; } };

    /* ---------- 画面 ---------- */
    function snap() { return JSON.stringify({ d: D, t: tmp }); }
    function restore(str) { var o = JSON.parse(str); D = o.d; tmp = o.t; }
    function labelOf(n, val, o) {
        if (o) return { ja: o.ja.replace(/\{([^|}]+)\|([^}]+)\}/g, '$1'), en: o.en };
        if (n.kind === 'scale') return { ja: val + '（' + SCALE_JA[val] + '）', en: val + ' (' + SCALE_EN[val] + ')' };
        if (n.kind === 'pick') { var nm = (val || []).map(function (id) { var c = qualById(id); return id === 'other' ? 'その他' : (c ? c.name : ''); }).join('、'); return nm ? { ja: nm, en: nm } : { ja: 'なし', en: 'None' }; }
        if (n.kind === 'ym') return val.y ? fmtYM(val) : { ja: 'スキップ', en: 'Skip' };
        if (n.kind === 'date3') return val.y ? { ja: val.y + '年' + (+val.m) + '月' + (+val.d) + '日', en: val.y + '-' + val.m + '-' + val.d } : { ja: 'スキップ', en: 'Skip' };
        var v = String(val || '');
        if (!v) return { ja: 'スキップ', en: 'Skip' };
        if (v.length > 80) v = v.slice(0, 80) + '…';
        return { ja: v, en: v };
    }
    function enter(id) {
        nid = id; softKey = '';
        if (!PMODE) {
            D.chatAt = id;                               // 続きから作れるように、いまの質問の場所を残す
            var keep = {}; Object.keys(tmp).forEach(function (k) { if (k !== 'res') keep[k] = tmp[k]; });
            D.chatTmp = keep;
        }
        curG = N[id].g();
        render();
    }
    function dockHtml() {
        var n = N[nid], h = '<p class="err" id="cErr" role="alert"></p>';
        var q = plain(curG.filter(function (x) { return x.say; }).map(function (x) { return T(x.ja, x.en); })[0] || '');
        if (n.kind === 'choice') {
            n.opts().forEach(function (o, i) {
                h += '<div class="cw' + (i % 2 ? ' o' : '') + '"><button type="button" class="ch" data-i="' + i + '">' + (o.rank ? '<span class="rk">' + o.rank + '</span>' : '<span class="ar"></span>') +
                    '<span class="tx"><span class="t">' + L(o.ja, o.en) + '</span>' + (o.sj ? '<span class="s">' + L(o.sj, o.se) + '</span>' : '') + '</span></button></div>';
            });
        } else if (n.kind === 'scale') {
            h += '<div class="sc">';
            [5, 4, 3, 2, 1].forEach(function (v) { h += '<button type="button" data-v="' + v + '"' + (v === 5 ? ' class="a"' : (v === 4 ? ' class="b"' : '')) + ' aria-label="' + v + ' ' + T(SCALE_JA[v], SCALE_EN[v]) + '">' + v + '</button>'; });
            h += '</div><div class="scl"><span>' + L('そう{思|おも}う', 'Agree') + '</span><span>' + L('そう{思|おも}わない', 'Disagree') + '</span></div>';
        } else if (n.kind === 'pick') {
            var pk = tmp.picked || [], off = pickOff(pk);
            h += '<div class="pk" id="cPick">';
            qualGroups().forEach(function (g) {
                h += '<p class="pkh">' + esc(g.label) + '</p>';
                g.items.forEach(function (q) {
                    var added = licAdded(q), on = pk.indexOf(q.qualId) >= 0 && !added, o = off[q.qualId];
                    h += '<label class="pki' + (o && on ? ' off' : '') + (added ? ' dis' : '') + '"><input type="checkbox" data-q="' + esc(q.qualId) + '"' + (on ? ' checked' : '') + (added ? ' disabled' : '') + '><span class="pkt">' + esc(q.name) + '</span>' +
                        (added ? '<em>入力済み</em>' : (o && on ? '<em>' + esc(o) + 'が有効です</em>' : '')) + '</label>';
                });
            });
            h += '<p class="pkh">その他</p><label class="pki"><input type="checkbox" data-q="other"' + (pk.indexOf('other') >= 0 ? ' checked' : '') + '><span class="pkt">その他（自分で入力）</span></label></div>' +
                '<div class="inp"><button type="button" class="go" data-act="send" style="flex:1">' + T('送る', 'Send') + '</button></div>';
        } else {
            var v0 = n.val.get(), go = '<button type="button" class="go" data-act="send">' + T('送る', 'Send') + '</button>';
            if (n.kind === 'text') h += '<div class="inp"><label class="f"><span class="sr">' + esc(q) + '</span><input id="cIn" type="text" maxlength="' + (n.max || 100) + '"' + (n.im ? ' inputmode="' + n.im + '"' : '') + (n.ac ? ' autocomplete="' + n.ac + '"' : ' autocomplete="off"') + (n.ph ? ' placeholder="' + esc(n.ph) + '"' : '') + ' value="' + esc(v0) + '"' + (n.norm ? ' data-norm="' + n.norm + '"' : '') + '></label>' + go + '</div>';
            else if (n.kind === 'long') { var mx = n.maxFn(); h += '<div class="f long"><span class="sr">' + esc(q) + '</span><textarea id="cIn" rows="4" maxlength="' + mx + '">' + esc(v0) + '</textarea></div><p class="cnt2" id="cCnt2"></p><div class="inp">' + go + '</div>'; }
            else if (n.kind === 'ym') h += '<div class="inp"><div class="f ym"><input id="cY" aria-label="' + T('年', 'Year') + '" inputmode="numeric" maxlength="4" placeholder="2020" data-norm="num" value="' + esc(v0.y) + '"><span>' + T('年', '/') + '</span><input id="cM" class="s2" aria-label="' + T('月', 'Month') + '" inputmode="numeric" maxlength="2" placeholder="4" data-norm="num" value="' + esc(v0.m) + '"><span>' + T('月', '') + '</span></div>' + go + '</div>';
            else if (n.kind === 'date3') h += '<div class="inp"><div class="f d3"><input id="cY" aria-label="' + T('年', 'Year') + '" inputmode="numeric" maxlength="4" placeholder="2000" data-norm="num" value="' + esc(v0.y) + '"><span>' + T('年', '/') + '</span><input id="cM" class="s2" aria-label="' + T('月', 'Month') + '" inputmode="numeric" maxlength="2" placeholder="4" data-norm="num" value="' + esc(v0.m) + '"><span>' + T('月', '/') + '</span><input id="cD" class="s2" aria-label="' + T('日', 'Day') + '" inputmode="numeric" maxlength="2" placeholder="1" data-norm="num" value="' + esc(v0.d) + '"><span>' + T('日', '') + '</span></div>' + go + '</div>';
        }
        h += '<div class="sub">' + (trail.length ? '<button type="button" class="lk" data-act="back">' + BACK + T('戻る', 'Back') + '</button>' : '<span></span>') +
            (n.opt && n.kind !== 'choice' && n.kind !== 'scale' ? '<button type="button" class="lk" data-act="skip">' + T('スキップ', 'Skip') + '</button>' : '') +
            '<button type="button" class="lk" data-act="exit">' + (PMODE ? T('ホームへ', 'Home') : T('一覧へ', 'List')) + '</button></div>';
        return h;
    }
    function render() {
        sayTexts = [];
        var h = '';
        trail.forEach(function (e) { h += guideHtml(e.g, false) + userHtml(e.a); });
        h += guideHtml(curG, true);
        $('cChat').innerHTML = h;
        $('cDock').innerHTML = dockHtml();
        var st = N[nid].stage;
        $('cStg').textContent = 'STAGE ' + st;
        $('cCnt').textContent = st + '/' + STAGES;
        var sg = ''; for (var i = 1; i <= STAGES; i++) sg += '<i' + (i <= st ? ' class="on"' : '') + '></i>';
        $('cSeg').innerHTML = sg;
        var c = $('cChat'); c.scrollTop = c.scrollHeight;
        var inp = $('cIn') || $('cY');
        if (inp && !first) { try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); } }
        first = false;
        updCount();
    }
    function updCount() {
        var el = $('cCnt2'), n = N[nid]; if (!el || n.kind !== 'long') return;
        el.textContent = T('あと', 'Left: ') + (n.maxFn() - $('cIn').value.length) + T('字', '');
    }
    function showErr(bad) { var el = $('cErr'); if (el) el.innerHTML = L(bad.ja, bad.en); }
    function collect() {
        var n = N[nid];
        if (n.kind === 'text' || n.kind === 'long') return $('cIn').value.trim();
        if (n.kind === 'pick') return validPick(tmp.picked || []);
        if (n.kind === 'ym') return { y: $('cY').value.trim(), m: $('cM').value.trim() };
        if (n.kind === 'date3') return { y: $('cY').value.trim(), m: $('cM').value.trim(), d: $('cD').value.trim() };
        return '';
    }
    function isEmpty(v) { return typeof v === 'object' ? !v.y : !v; }
    function submit(val, label, skip) {
        var n = N[nid];
        if (!skip && n.kind !== 'choice' && n.kind !== 'scale') {
            var bad = n.check && !isEmpty(val) ? n.check(val) : null;
            if (!bad && n.req && isEmpty(val)) bad = ERR_EMPTY;
            if (bad) {
                var key = nid + '|' + JSON.stringify(val);
                if (bad.soft && softKey === key) bad = null; else { softKey = bad.soft ? key : ''; showErr(bad); return; }
            }
        }
        softKey = '';
        var entry = { id: nid, snap: snap(), g: curG, a: label };
        if (n.val && n.kind !== 'choice' && n.kind !== 'scale') n.val.set(val);
        var nx = n.go(val);
        trail.push(entry); schedule();
        if (nx && nx.nav) { leave(nx.nav); return; }
        enter(nx);
    }
    function back() {
        if (!trail.length) return;
        var e = trail.pop(); restore(e.snap); schedule(); enter(e.id);
    }
    // 読み上げ：用意した音声ファイル（audio/ja/キー.mp3・audio/en/キー.mp3）があればそれを再生し、なければ端末の音声で読む
    var audio = null;
    function stopSpeech() {
        try { if (audio) { audio.pause(); audio = null; } if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
    }
    function synth(text) {
        if (!window.speechSynthesis) return;
        try {
            var u = new SpeechSynthesisUtterance(text);
            u.lang = I.lang() === 'en' ? 'en-US' : 'ja-JP';
            window.speechSynthesis.speak(u);
        } catch (e) {}
    }
    function speak(item) {
        if (!item) return;
        stopSpeech();
        if (typeof Audio === 'undefined' || !item.key) { synth(item.text); return; }
        var lang = I.lang() === 'en' ? 'en' : 'ja', list = item.keys && item.keys.length ? item.keys : [item.key], pos = 0, dead = false;
        function next() {
            if (dead) return;
            if (pos >= list.length) { audio = null; return; }
            var a = new Audio('audio/' + lang + '/' + list[pos++] + '.mp3');
            audio = a;
            // 1つでも音声ファイルが無ければ、文章まるごとを端末の音声で読む
            a.addEventListener('error', function () { if (audio === a && !dead) { dead = true; audio = null; synth(item.text); } });
            a.addEventListener('ended', function () { if (audio === a) next(); });
            var p = a.play(); if (p && p.catch) p.catch(function () {});
        }
        next();
    }

    /* ---------- イベント ---------- */
    $('cChat').addEventListener('click', function (e) {
        var b = e.target.closest('button.say'); if (!b) return;
        speak(sayTexts[+b.getAttribute('data-say')]);
    });
    $('cDock').addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        var n = N[nid];
        if (b.hasAttribute('data-i')) { var o = n.opts()[+b.getAttribute('data-i')]; return submit(o.k, labelOf(n, o.k, o)); }
        if (b.hasAttribute('data-v')) { var v = +b.getAttribute('data-v'); return submit(v, labelOf(n, v)); }
        var act = b.getAttribute('data-act');
        if (act === 'send') { var val = collect(); return submit(val, labelOf(n, val)); }
        if (act === 'skip') { var empty = n.kind === 'ym' ? { y: '', m: '' } : (n.kind === 'date3' ? { y: '', m: '', d: '' } : ''); return submit(empty, labelOf(n, empty), true); }
        if (act === 'back') return back();
        if (act === 'exit') return leave(PMODE ? 'dashboard.html' : 'resume.html');
    });
    $('cDock').addEventListener('input', function (e) {
        var el = e.target, nm = el.getAttribute && el.getAttribute('data-norm');
        if (nm) { var nv = normOf(el.value, nm); if (nv !== el.value) el.value = nv; }
        if (el.id === 'cIn') updCount();
    });
    $('cDock').addEventListener('change', function (e) {
        var el = e.target; if (!el.getAttribute || !el.hasAttribute('data-q')) return;
        var ids = []; Array.prototype.forEach.call($('cDock').querySelectorAll('input[data-q]:checked'), function (x) { ids.push(x.getAttribute('data-q')); });
        tmp.picked = ids;
        var pk = $('cPick'), sc = pk ? pk.scrollTop : 0;
        $('cDock').innerHTML = dockHtml();
        var p2 = $('cPick'); if (p2) p2.scrollTop = sc;
    });
    $('cDock').addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || e.isComposing || e.target.tagName !== 'INPUT') return;
        e.preventDefault();
        var g = $('cDock').querySelector('[data-act="send"]'); if (g) g.click();
    });
    I.onChange(function () { if (D) { var keep = $('cIn') ? $('cIn').value : null; render(); if (keep != null && $('cIn')) { $('cIn').value = keep; updCount(); } } });
    window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && dirty) saveNow().catch(function () {}); });

    /* ---------- 最初の読み込み ---------- */
    if (PMODE) {
        window.RLoading.hold(api({ action: 'personaGet' }).then(function (res) {
            if (!res) return;
            if (res.ok === false) return fail(res);
            D = fixData({}); D.persona = res.persona && res.persona.top ? res.persona : null;
            enter(D.persona ? 'pResult' : 'pStart');
        }).catch(function () { netFail(); }));
        return;
    }
    window.RLoading.hold(api({ action: 'resumeGet', resumeId: rid }).then(function (res) {
        if (!res) return;
        if (res.ok === false) return fail(res);
        if (res.expired) { location.replace('resume.html#' + rid); return; }
        title = res.resume.title; D = fixData(res.resume.data);
        tmp = (D.chatTmp && typeof D.chatTmp === 'object') ? D.chatTmp : {};
        // 性格診断の結果（ユーザーごとに1つ）を、この履歴書の会話にも使う
        return Promise.all([
            api({ action: 'personaGet' }).catch(function () { return null; }),
            api({ action: 'qualList' }).catch(function () { return null; })
        ]).then(function (rs) {
            var pr = rs[0], q = rs[1];
            quals = q && q.ok && q.quals ? q.quals : [];
            if (pr && pr.ok && pr.persona && pr.persona.top) {
                var ind = D.persona && D.persona.industry;
                D.persona = JSON.parse(JSON.stringify(pr.persona)); if (ind) D.persona.industry = ind;
            }
            var at = D.chatAt && N[D.chatAt] ? D.chatAt : 'work';
            if (at === 'noDiag' && D.persona && D.persona.top) at = 'suggest';
            if (at === 'q' || at === 'result') at = 'work';
            enter(at);
        });
    }).catch(function () { netFail(); }));
})();
