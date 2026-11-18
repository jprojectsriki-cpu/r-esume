/* R-ESUME 履歴書の一覧と確認の画面（STAGE 2・2026-11-18 作り直し）
 * 一覧：作りかけ＝「続きから作る」（会話の続き）、完成＝「確認する」（確認の画面）。コピー・削除。3通まで。
 * 確認の画面（resume.html#<履歴書ID>）：PART ごとに答えを一覧で見せ、項目ごとに「直す」（会話でその質問だけ答え直す）。
 *   学歴・職歴・資格は行ごとに「直す」「消す」と「＋ 足す」。まちがい・もれのお知らせ、提出前のチェック、「完成する」。
 *   「完成する」に必要：名前・生年月日・住所・電話・メール・学歴（1行以上）・資格（1行以上、または「ない」）。
 *   前の「入力画面で確認・修正」（8ステップ）は 2026-11-18 に廃止。利用期間が終わっているときは、見るだけ。 */
(function () {
    'use strict';
    var A = window.RAuth, I = window.RI18n, T = I.t, P = window.RPersonality;
    var s = A.load();
    if (!s || !s.token || !A.ready()) { location.replace('login.html'); return; }

    function $(id) { return document.getElementById(id); }
    function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function fu(x) { return x.replace(/\{([^|}]+)\|([^}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>'); }
    function L(ja, en) { return T(fu(ja), esc(en)); }               // 画面の文章（HTML）
    function BL(en, ja, row) { return '<span class="bl' + (row ? ' bl-row' : '') + '"><span class="bl-en" aria-hidden="true">' + en + '</span><span class="bl-ja">' + fu(ja) + '</span></span>'; }   // ボタンの文字：英語と日本語の2段（2026-11-18）

    var box = I.msgBox($('rsMsg'));
    var list = [], max = 3, expired = false;
    var cur = null, dirty = false, timer = null, saving = Promise.resolve(), lastSaved = null;
    var LIM = { rows: 19, lic: 6, motSpecial: 500, wish: 150 };

    /* ---------- 共通 ---------- */
    function kick(res) { A.clear(); A.flash((res && res.message) || 'もう一度ログインしてください。'); location.replace('login.html'); return new Promise(function () {}); }
    function api(body) { body.token = s.token; return A.api(body); }
    function fail(res) {
        if (res && res.reason) return kick(res);
        if (res && res.message) box.fromServer(res.message, 'error');
        else box.set('うまくいきませんでした。', 'Something went wrong.', 'error');
    }
    function netFail() { box.set(fu('{通信|つうしん}できませんでした。{時間|じかん}をおいてもう{一度|いちど}お{試|ため}しください。'), 'Network error. Please try again.', 'error'); }
    function when(iso) {
        if (!iso) return '';
        var j = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
        var p = function (n) { return (n < 10 ? '0' : '') + n; };
        return j.getUTCFullYear() + '年' + (j.getUTCMonth() + 1) + '月' + j.getUTCDate() + '日 ' + p(j.getUTCHours()) + ':' + p(j.getUTCMinutes());
    }
    var expiredNote = function () {
        return '<p class="rs-warn">' + L('{利用|りよう}{期間|きかん}が{終|お}わっています。{履歴書|りれきしょ}の{作成|さくせい}・{編集|へんしゅう}・{印刷|いんさつ}をする{場合|ばあい}は{更新|こうしん}をしてください。', 'Your period of use has ended.') +
            ' <a href="dashboard.html">' + L('ホームで{更新|こうしん}する', 'Renew on Home') + '</a></p>';
    };
    function fixData(d) {
        d = d && typeof d === 'object' ? d : {};
        if (!d.era) d.era = 'seireki';
        if (d.showForeign == null) d.showForeign = true;
        ['edu', 'work', 'lic'].forEach(function (k) { if (!Array.isArray(d[k])) d[k] = []; });
        return d;
    }
    function setPath(o, path, val) {
        var p = path.split('.');
        for (var i = 0; i < p.length - 1; i++) { if (o[p[i]] == null) o[p[i]] = isNaN(p[i + 1]) ? {} : []; o = o[p[i]]; }
        o[p[p.length - 1]] = val;
    }

    /* ---------- 和暦・年齢 ---------- */
    function eraYear(y, m, era) {
        y = +y; if (!y) return '';
        if (era !== 'wareki') return y + '年';
        var n;
        if (y === 2019 && m && +m <= 4) return '平成31年';
        if (y >= 2019) { n = y - 2018; return '令和' + (n === 1 ? '元' : n) + '年'; }
        if (y >= 1989) { n = y - 1988; return '平成' + (n === 1 ? '元' : n) + '年'; }
        if (y >= 1926) { n = y - 1925; return '昭和' + (n === 1 ? '元' : n) + '年'; }
        return y + '年';
    }
    function ageOf(d) {
        var y = +d.bY, m = +d.bM, dd = +d.bD, now = new Date();
        if (!(y >= 1900 && y <= now.getFullYear() && m >= 1 && m <= 12 && dd >= 1 && dd <= 31)) return null;
        var a = now.getFullYear() - y;
        if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < dd)) a--;
        return a >= 0 ? a : null;
    }

    /* ---------- 必要な項目・お知らせ ---------- */
    function hasRows(k) { return cur.data[k].some(function (r) { return String(r.t || '').trim(); }); }
    function missing() {
        var d = cur.data, m = [];
        if (!String(d.name || '').trim()) m.push(['{名前|なまえ}', 'name']);
        if (!(d.bY && d.bM && d.bD)) m.push(['{生年月日|せいねんがっぴ}', 'birth']);
        if (!String(d.addr || '').trim()) m.push(['{住所|じゅうしょ}', 'addr']);
        if (!String(d.phone || '').trim()) m.push(['{電話番号|でんわばんごう}', 'phone']);
        if (!String(d.email || '').trim()) m.push(['メールアドレス', 'email']);
        if (!hasRows('edu')) m.push(['{学歴|がくれき}', 'eduName']);
        if (!hasRows('lic') && !d.licNone) m.push(['{資格|しかく}', 'licPick']);
        return m;
    }
    function warns() {
        var d = cur.data, w = [], nowY = new Date().getFullYear();
        var names = { edu: '学歴', work: '職歴', lic: '資格' };
        ['edu', 'work', 'lic'].forEach(function (k) {
            d[k].forEach(function (r, i) {
                var pos = names[k] + 'の' + (i + 1) + '行目';
                if (!r.y && r.k !== '現在に至る') w.push(pos + '：年が入っていません。');
                if (r.y && (+r.y < 1900 || +r.y > nowY + 6)) w.push(pos + '：年（' + r.y + '）がおかしいようです。');
                if (!(r.t || '').trim() && r.k !== '現在に至る') w.push(pos + '：内容が入っていません。');
            });
        });
        if (d.edu.length + d.work.length > LIM.rows) w.push('学歴と職歴が、合わせて' + LIM.rows + '行より多くなっています（印刷に入りません）。');
        if (d.lic.length > LIM.lic) w.push('資格が' + LIM.lic + '行より多くなっています（印刷に入りません）。');
        if (String(d.motive || '').length + String(d.special || '').length > LIM.motSpecial) w.push('志望動機と特技が、合わせて' + LIM.motSpecial + '字より多くなっています。');
        var by = +d.bY, first = 0;
        d.edu.forEach(function (r) { if (r.k === '入学' && +r.y && (!first || +r.y < first)) first = +r.y; });
        if (by && first && first - by < 5) w.push('生年月日と、学歴の年が合っていないようです。');
        if (d.statusExp && new Date(d.statusExp).getTime() < Date.now() - 86400000) w.push('在留期限が、過ぎています。');
        return w;
    }
    var CHECKS = [
        ['{名前|なまえ}・{住所|じゅうしょ}・{電話|でんわ}・メールが、まちがっていない', 'My name, address, phone and email are correct'],
        ['{学歴|がくれき}・{職歴|しょくれき}の{年月|ねんげつ}が、まちがっていない', 'The dates of my education and work are correct'],
        ['{志望動機|しぼうどうき}を、{声|こえ}に{出|だ}して{読|よ}んだ', 'I read my motivation aloud'],
        ['{証明写真|しょうめいしゃしん}を{用意|ようい}した（{写真|しゃしん}の{機能|きのう}は、もうすぐ{使|つか}えます）', 'I have an ID photo ready']
    ];

    /* ---------- 一覧の画面 ---------- */
    function renderList() {
        $('viewEdit').hidden = true;
        var v = $('viewList'), h = '';
        h += '<h1><span>' + L('{履歴書|りれきしょ}', 'Resumes') + '</span></h1>';
        if (expired) h += expiredNote();
        h += '<p class="rs-count">' + T('いま ' + list.length + '通 ／ ' + max + '通まで', list.length + ' of ' + max + ' resumes') + '</p>';
        if (!list.length) h += '<p class="rs-empty">' + L('まだ{履歴書|りれきしょ}がありません。{下|した}のボタンから{作|つく}ります。', 'You have no resumes yet.') + '</p>';
        h += '<ul class="rs-list">';
        list.forEach(function (r) {
            var main = expired ? '<button type="button" class="btn" data-act="view" data-id="' + esc(r.resumeId) + '">' + BL('VIEW', '{見|み}る') + '</button>'
                : (r.done ? '<button type="button" class="btn" data-act="view" data-id="' + esc(r.resumeId) + '">' + BL('CHECK', '{確認|かくにん}する') + '</button>'
                    : '<a class="btn" href="chat.html#' + esc(r.resumeId) + '">' + BL('CONTINUE', '{続|つづ}きから{作|つく}る') + '</a>');
            h += '<li class="rs-item"><div class="rs-item-main"><strong>' + esc(r.title) + '</strong>' +
                '<span class="rs-badge' + (r.done ? ' is-done' : '') + '">' + (r.done ? BL('DONE', '{完成|かんせい}', 1) : BL('IN PROGRESS', '{作|つく}りかけ', 1)) + '</span>' +
                '<small>' + L('{更新|こうしん}', 'Updated') + '：' + esc(when(r.updatedAt)) + '</small></div><div class="rs-acts">' + main +
                (expired ? '' : '<button type="button" class="btn btn-secondary" data-act="copy" data-id="' + esc(r.resumeId) + '"' + (list.length >= max ? ' disabled' : '') + '>' + BL('COPY', 'コピー') + '</button>' +
                    '<button type="button" class="btn btn-secondary" data-act="del" data-id="' + esc(r.resumeId) + '">' + BL('DELETE', '{削除|さくじょ}') + '</button>') + '</div></li>';
        });
        h += '</ul>';
        if (!expired) h += '<button type="button" class="btn btn-lg btn-block" id="rsNew"' + (list.length >= max ? ' disabled' : '') + '>' + BL('＋ NEW', '{新|あたら}しい{履歴書|りれきしょ}を{作|つく}る') + '</button>' +
            (list.length >= max ? '<p class="rs-hint">' + L('{履歴書|りれきしょ}は' + max + '{通|つう}までです。{削除|さくじょ}すると、また{作|つく}れます。', 'You can have up to ' + max + ' resumes.') + '</p>' : '');
        h += '<a class="btn btn-secondary btn-block rs-back" href="dashboard.html">' + BL('HOME', 'ホームへ{戻|もど}る') + '</a>';
        v.innerHTML = h; v.hidden = false;
    }
    function reloadList() {
        return api({ action: 'resumeList' }).then(function (res) {
            if (res && res.ok) { list = res.resumes; max = res.max; expired = res.expired; return res; }
            return fail(res);
        });
    }

    /* ---------- 確認の画面 ---------- */
    function fixBtn(id, label) {
        if (expired) return '';
        return '<button type="button" class="cf-btn" data-fix="' + esc(id) + '" aria-label="' + esc(label) + 'を直す">' + BL('EDIT', '{直|なお}す') + '</button>';
    }
    function val(v, required) {
        v = String(v == null ? '' : v).trim();
        if (v) return esc(v);
        return required ? '<span class="cf-empty">' + L('まだ{入力|にゅうりょく}していません', 'Not entered yet') + '</span>' : '<span class="cf-none">―</span>';
    }
    function item(labelJa, html, fixId) {
        return '<div class="cf-row"><dt>' + fu(labelJa) + '</dt><dd>' + html + '</dd><div class="cf-act">' + fixBtn(fixId, labelJa.replace(/\{([^|}]+)\|([^}]+)\}/g, '$1')) + '</div></div>';
    }
    function part(n, nameJa, body) {
        return '<section class="cf-sec"><h2 class="cf-h"><span class="cf-no">PART ' + n + '</span><span class="cf-ttl">' + fu(nameJa) + '</span></h2>' + body + '</section>';
    }
    function rowsHtml(key, addFix, emptyJa) {
        var d = cur.data, rows = d[key], h = '<ol class="cf-lines">';
        if (!rows.length) h += '<li class="cf-line is-empty">' + fu(emptyJa) + '</li>';
        rows.forEach(function (r, i) {
            var ym = r.y ? eraYear(r.y, r.m, d.era) + (r.m ? (+r.m) + '月' : '') : '';
            var txt = ((r.t || '').trim() + (r.k ? '　' + r.k : '')).trim();
            h += '<li class="cf-line"><span class="cf-ym">' + esc(ym) + '</span><span class="cf-txt">' + esc(txt) + '</span>' +
                (expired ? '' : '<span class="cf-lact"><button type="button" class="cf-btn" data-row="' + key + '.' + i + '">' + BL('EDIT', '{直|なお}す') + '</button><button type="button" class="cf-btn cf-del" data-delrow="' + key + '.' + i + '">' + BL('DELETE', '{消|け}す') + '</button></span>') + '</li>';
        });
        h += '</ol>';
        var full = key === 'lic' ? rows.length >= LIM.lic : d.edu.length + d.work.length >= LIM.rows;
        if (!expired) h += '<button type="button" class="cf-add" data-fix="' + addFix + '"' + (full ? ' disabled' : '') + '>' + BL('＋ ADD', '{足|た}す') + '</button>' + (full ? '<p class="rs-hint">' + L('{行|ぎょう}がいっぱいです。', 'The rows are full.') + '</p>' : '');
        return h;
    }
    function renderConfirm() {
        $('viewList').hidden = true;
        var d = cur.data, v = $('viewEdit'), h = '';
        var a = ageOf(d), miss = missing(), ws = warns();
        h += '<div class="rs-top"><button type="button" class="rs-link" id="rsToList">‹ ' + BL('BACK', '{一覧|いちらん}へ{戻|もど}る', 1) + '</button><span class="rs-status" id="rsStatus" role="status" aria-live="polite"></span></div>';
        if (expired) h += expiredNote();
        h += '<h1><span>' + L('{確認|かくにん}', 'Check') + '</span>' + (d.done ? '<span class="rs-badge is-done">' + BL('DONE', '{完成|かんせい}', 1) + '</span>' : '') + '</h1>';
        h += '<div class="rs-f rs-title"><label for="cfTitle">' + L('{履歴書|りれきしょ}の{名前|なまえ}（{自分|じぶん}だけが{見|み}ます）', 'Resume name') + '</label><input id="cfTitle" data-k="title" maxlength="40" value="' + esc(cur.title) + '"' + (expired ? ' disabled' : '') + '></div>';
        if (miss.length) h += '<div class="rs-warn"><p>' + L('「{完成|かんせい}する」には、{次|つぎ}の{項目|こうもく}が{必要|ひつよう}です。', 'These items are needed to complete.') + '</p><ul>' + miss.map(function (x) { return '<li>' + fu(x[0]) + '</li>'; }).join('') + '</ul></div>';
        if (ws.length) h += '<div class="rs-note"><p>' + L('{確認|かくにん}してください（このまま{完成|かんせい}することもできます）。', 'Please check these.') + '</p><ul>' + ws.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';

        var birth = d.bY ? eraYear(d.bY, d.bM, d.era) + (d.bM ? (+d.bM) + '月' : '') + (d.bD ? (+d.bD) + '日' : '') + (a != null ? '（満' + a + '歳）' : '') : '';
        h += part(1, '{基本|きほん}', '<dl class="cf-dl">' +
            item('{名前|なまえ}', val(d.name, 1), 'name') + item('ふりがな', val(d.nameFuri), 'nameFuri') +
            item('{性別|せいべつ}', val(d.gender), 'gender') + item('{生年月日|せいねんがっぴ}', val(birth, 1), 'birth') + '</dl>');
        var alt = d.altOn ? '{住所|じゅうしょ}と{違|ちが}う：' + esc([d.altZip, d.altAddr, d.altPhone, d.altEmail].filter(Boolean).join('　')) : '{住所|じゅうしょ}と{同|おな}じ';
        h += part(2, '{連絡先|れんらくさき}', '<dl class="cf-dl">' +
            item('{郵便番号|ゆうびんばんごう}', val(d.zip), 'zip') + item('{住所|じゅうしょ}', val(d.addr, 1), 'addr') + item('{住所|じゅうしょ}のふりがな', val(d.addrFuri), 'addrFuri') +
            item('{電話番号|でんわばんごう}', val(d.phone, 1), 'phone') + item('メールアドレス', val(d.email, 1), 'email') + item('{連絡先|れんらくさき}', fu(alt), 'altOn') + '</dl>');
        var exp = d.statusExp ? String(d.statusExp).split('-') : null;
        h += part(3, '{留学生|りゅうがくせい}の{情報|じょうほう}', '<dl class="cf-dl">' +
            item('{国籍|こくせき}', val(d.nationality), 'nationality') + item('{在留資格|ざいりゅうしかく}', val(d.status), 'status') +
            item('{資格外活動許可|しかくがいかつどうきょか}', val(d.workPermit), 'workPermit') +
            item('{在留期限|ざいりゅうきげん}', val(exp ? exp[0] + '年' + (+exp[1]) + '月' + (+exp[2]) + '日' : ''), 'statusExp') +
            item('JLPT', val(d.jlpt), 'jlpt') + item('{履歴書|りれきしょ}に{載|の}せる', fu(d.showForeign === false ? '{載|の}せない' : '{載|の}せる'), 'showForeign') + '</dl>');
        h += part(4, '{学歴|がくれき}', '<div class="rs-f cf-era"><label for="cfEra">' + L('{年|ねん}の{書|か}きかた', 'Year style') + '</label><select id="cfEra" data-k="era"' + (expired ? ' disabled' : '') + '>' +
            '<option value="seireki"' + (d.era !== 'wareki' ? ' selected' : '') + '>' + T('西暦（2020年）', 'Western (2020)') + '</option><option value="wareki"' + (d.era === 'wareki' ? ' selected' : '') + '>' + T('和暦（令和2年）', 'Japanese era') + '</option></select></div>' +
            rowsHtml('edu', 'eduName', '<span class="cf-empty">まだ{入力|にゅうりょく}していません</span>'));
        h += part(5, '{職歴|しょくれき}・アルバイト', rowsHtml('work', 'workName', 'なし（{履歴書|りれきしょ}には「なし」と{書|か}きます）'));
        h += part(6, '{資格|しかく}', rowsHtml('lic', 'licPick', d.licNone ? '{特|とく}になし（{履歴書|りれきしょ}には「{特|とく}になし」と{書|か}きます）' : '<span class="cf-empty">まだ{入力|にゅうりょく}していません</span>'));
        var ind = d.persona && d.persona.industry ? (d.persona.industry === 'other' ? 'ほかの業種' : ((P && P.indById(d.persona.industry)) ? P.indById(d.persona.industry).ja.replace(/\{([^|}]+)\|([^}]+)\}/g, '$1') : '')) : '';
        var ms = String(d.motive || '').length + String(d.special || '').length;
        h += part(7, '{志望動機|しぼうどうき}など', '<dl class="cf-dl">' +
            item('{応募|おうぼ}する{業種|ぎょうしゅ}', val(ind), 'work') +
            item('{志望動機|しぼうどうき}', '<span class="cf-long">' + val(d.motive) + '</span>', 'motive') +
            item('{特技|とくぎ}・アピールポイント', '<span class="cf-long">' + val(d.special) + '</span>', 'special') +
            item('{本人希望|ほんにんきぼう}', '<span class="cf-long">' + (String(d.wish || '').trim() ? esc(d.wish) : '<span class="cf-none">' + fu('（{空|から}のときは「{貴社|きしゃ}の{規定|きてい}に{従|したが}います」と{印刷|いんさつ}します）') + '</span>') + '</span>', 'wish') + '</dl>' +
            '<p class="rs-hint">' + L('{志望動機|しぼうどうき}と{特技|とくぎ}：{合計|ごうけい}' + ms + ' / ' + LIM.motSpecial + '{字|じ}', 'Total ' + ms + ' / ' + LIM.motSpecial) + '</p>');

        h += '<section class="cf-sec"><h2 class="cf-h">' + L('{提出|ていしゅつ}する{前|まえ}のチェック', 'Before you submit') + '</h2><div class="rs-checks">' +
            CHECKS.map(function (c, i) { return '<div class="rs-f rs-check"><label><input type="checkbox" data-k="check.' + i + '"' + (d.check && d.check[i] ? ' checked' : '') + (expired ? ' disabled' : '') + '><span>' + L(c[0], c[1]) + '</span></label></div>'; }).join('') + '</div>' +
            '<p class="rs-hint">' + L('{履歴書|りれきしょ}の{日付|ひづけ}は、{表示|ひょうじ}・{印刷|いんさつ}するたびに、{今日|きょう}の{日付|ひづけ}が{自動|じどう}で{入|はい}ります。', 'The date is filled in automatically.') + '</p></section>';
        if (!expired) h += '<button type="button" class="btn btn-lg btn-block cf-done" id="cfDone"' + (miss.length ? ' disabled' : '') + '>' + BL('COMPLETE', '{完成|かんせい}する') + '</button>' +
            (miss.length ? '<p class="rs-hint">' + L('{上|うえ}の{必要|ひつよう}な{項目|こうもく}を{入|い}れると、{押|お}せるようになります。', 'Fill in the needed items to complete.') + '</p>' : '');
        h += '<button type="button" class="btn btn-secondary btn-block rs-back" id="rsToList2">' + BL('BACK', '{一覧|いちらん}へ{戻|もど}る') + '</button>';
        v.innerHTML = h; v.hidden = false;
        setStatus(dirty ? 'dirty' : (lastSaved ? 'saved' : ''));
    }
    function setStatus(kind) {
        var el = $('rsStatus'); if (!el) return;
        if (expired) { el.textContent = T('見るだけ', 'View only'); return; }
        var t = '';
        if (kind === 'saving') t = T('保存しています…', 'Saving…');
        else if (kind === 'saved') t = T('保存しました ', 'Saved ') + when(lastSaved);
        else if (kind === 'dirty') t = T('入力中…', 'Editing…');
        else if (kind === 'error') t = T('保存できませんでした。もう一度お試しください。', 'Could not save.');
        el.textContent = t; el.className = 'rs-status' + (kind === 'error' ? ' is-error' : '');
    }

    /* ---------- 保存 ---------- */
    function saveNow() {
        var p = saving.catch(function () {}).then(function () {
            if (!dirty || !cur) return { ok: true };
            dirty = false; setStatus('saving');
            return api({ action: 'resumeSave', resumeId: cur.resumeId, title: cur.title, data: cur.data }).then(function (res) {
                if (res && res.ok) { lastSaved = res.updatedAt; if (!dirty) setStatus('saved'); return res; }
                dirty = true; setStatus('error'); return res;
            }, function (e) { dirty = true; setStatus('error'); throw e; });
        });
        saving = p.catch(function () {});
        return p;
    }
    function schedule() {
        dirty = true; setStatus('dirty');
        clearTimeout(timer);
        timer = setTimeout(function () { saveNow().then(function (r) { if (r && r.ok === false) fail(r); }, function () {}); }, 1200);
    }
    function flush() { clearTimeout(timer); return saveNow(); }

    /* ---------- 操作 ---------- */
    function show(res, after) { if (res && res.ok === false) return fail(res); after && after(); }
    function toList() {
        box.clear();
        window.RLoading.run(function () { return flush().then(function (r) { if (r && r.ok === false) return r; return reloadList(); }); }, {
            text: T('よみこんでいます', 'Loading'),
            onSuccess: function (res) { show(res, function () { cur = null; history.replaceState(null, '', location.pathname); renderList(); window.scrollTo(0, 0); }); },
            onError: netFail
        });
    }
    function openResume(id) {
        box.clear();
        window.RLoading.run(function () { return api({ action: 'resumeGet', resumeId: id }); }, {
            text: T('よみこんでいます', 'Loading'),
            onSuccess: function (res) {
                show(res, function () {
                    expired = res.expired;
                    cur = { resumeId: res.resume.resumeId, title: res.resume.title, data: fixData(res.resume.data) };
                    dirty = false; lastSaved = res.resume.updatedAt;
                    history.replaceState(null, '', '#' + cur.resumeId);
                    renderConfirm(); window.scrollTo(0, 0);
                });
            },
            onError: netFail
        });
    }
    // 会話で直す：保存してから、chat.html?fix=…#ID へ
    function goChat(q) {
        var url = 'chat.html?' + q + '#' + cur.resumeId;
        if (!dirty) { location.href = url; return; }
        window.RLoading.run(function () { return flush(); }, {
            text: T('保存しています', 'Saving'),
            onSuccess: function (res) { show(res, function () { location.href = url; }); },
            onError: netFail
        });
    }
    function complete() {
        if (missing().length) return;
        cur.data.done = true; dirty = true;
        window.RLoading.run(function () { return flush(); }, {
            text: T('保存しています', 'Saving'),
            onSuccess: function (res) {
                show(res, function () {
                    renderConfirm(); window.scrollTo(0, 0);
                    box.set(fu('{完成|かんせい}しました！A4の{見本|みほん}と{印刷|いんさつ}・PDFは、もうすぐ{使|つか}えるようになります。'), 'Completed!', 'ok');
                });
            },
            onError: function () { cur.data.done = false; netFail(); }
        });
    }
    function createResume(title, copyFrom) {
        box.clear();
        window.RLoading.run(function () {
            return api({ action: 'resumeCreate', title: title, copyFrom: copyFrom || '' }).then(function (res) {
                if (!res || !res.ok) return res;
                return reloadList().then(function () { return res; });
            });
        }, {
            text: T('つくっています', 'Creating'),
            onSuccess: function (res) { show(res, function () { if (copyFrom) { renderList(); box.set('コピーしました。', 'Copied.', 'ok'); } else location.href = 'chat.html#' + res.resumeId; }); },
            onError: netFail
        });
    }
    function deleteResume(id) {
        box.clear();
        window.RLoading.run(function () {
            return api({ action: 'resumeDelete', resumeId: id }).then(function (res) {
                if (!res || !res.ok) return res;
                return reloadList().then(function () { return res; });
            });
        }, {
            text: T('削除しています', 'Deleting'),
            onSuccess: function (res) { show(res, function () { renderList(); box.set('削除しました。', 'Deleted.', 'ok'); }); },
            onError: netFail
        });
    }

    /* ---------- イベント ---------- */
    var dlgDel = $('dlgDel'), delId = '', delRow = '';
    $('viewList').addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.disabled) return;
        if (b.id === 'rsNew') { createResume(T('履歴書', 'Resume') + (list.length + 1), ''); return; }
        var id = b.getAttribute('data-id'), act = b.getAttribute('data-act');
        if (act === 'view') openResume(id);
        else if (act === 'copy') {
            var src = list.filter(function (x) { return x.resumeId === id; })[0];
            createResume(((src && src.title) || '履歴書') + T('のコピー', ' (copy)'), id);
        } else if (act === 'del') {
            delId = id; delRow = '';
            var r = list.filter(function (x) { return x.resumeId === id; })[0];
            $('delTitle').innerHTML = L('{削除|さくじょ}しますか？', 'Delete this resume?');
            $('delName').textContent = r ? r.title : '';
            dlgDel.showModal();
        }
    });
    $('delNo').addEventListener('click', function () { dlgDel.close(); });
    $('delForm').addEventListener('submit', function (e) {
        e.preventDefault(); dlgDel.close();
        if (delRow) {   // 確認の画面の1行を消す
            var p = delRow.split('.'); delRow = '';
            cur.data[p[0]].splice(+p[1], 1);
            schedule(); renderConfirm();
            return;
        }
        deleteResume(delId);
    });

    var ev = $('viewEdit');
    ev.addEventListener('input', function (e) {
        var el = e.target, k = el.getAttribute && el.getAttribute('data-k'); if (!k || expired) return;
        if (k === 'title') { cur.title = el.value; schedule(); }
    });
    ev.addEventListener('change', function (e) {
        var el = e.target, k = el.getAttribute && el.getAttribute('data-k'); if (!k || expired) return;
        if (k === 'title') return;
        setPath(cur.data, k, el.type === 'checkbox' ? el.checked : el.value);
        schedule();
        if (k === 'era') { var y = window.scrollY; renderConfirm(); window.scrollTo(0, y); }
    });
    ev.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.disabled) return;
        if (b.id === 'rsToList' || b.id === 'rsToList2') return toList();
        if (expired) return;
        if (b.id === 'cfDone') return complete();
        if (b.hasAttribute('data-fix')) return goChat('fix=' + encodeURIComponent(b.getAttribute('data-fix')));
        if (b.hasAttribute('data-row')) return goChat('fix=row&row=' + encodeURIComponent(b.getAttribute('data-row')));
        if (b.hasAttribute('data-delrow')) {
            delRow = b.getAttribute('data-delrow');
            var p = delRow.split('.'), r = cur.data[p[0]][+p[1]] || {};
            $('delTitle').innerHTML = L('この{行|ぎょう}を{消|け}しますか？', 'Delete this row?');
            $('delName').textContent = [r.y ? r.y + '年' + (r.m ? (+r.m) + '月' : '') : '', r.t || '', r.k || ''].filter(Boolean).join('　');
            dlgDel.showModal();
        }
    });
    window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && dirty && !expired) saveNow().catch(function () {}); });
    I.onChange(function () { if (!$('viewEdit').hidden) { var y = window.scrollY; renderConfirm(); window.scrollTo(0, y); } else if (!$('viewList').hidden) renderList(); });

    /* ---------- 最初の読み込み ---------- */
    window.RLoading.hold(reloadList().then(function (res) {
        if (!res) return;
        var id = (location.hash || '').replace('#', '');
        if (id && list.some(function (x) { return x.resumeId === id; })) {
            return api({ action: 'resumeGet', resumeId: id }).then(function (r) {
                if (r && r.ok) { expired = r.expired; cur = { resumeId: r.resume.resumeId, title: r.resume.title, data: fixData(r.resume.data) }; lastSaved = r.resume.updatedAt; renderConfirm(); }
                else renderList();
            });
        }
        renderList();
    }).catch(function () { netFail(); $('viewList').hidden = false; }));
})();
