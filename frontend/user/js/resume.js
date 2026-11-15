/* R-ESUME 履歴書の入力（R-9）：一覧 → ステップ式の入力。自動保存。利用期間が終わっているときは、見るだけ */
(function () {
    'use strict';
    var A = window.RAuth, I = window.RI18n, T = I.t;
    var s = A.load();
    if (!s || !s.token || !A.ready()) { location.replace('login.html'); return; }

    function $(id) { return document.getElementById(id); }
    function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function fu(x) { return x.replace(/\{([^|}]+)\|([^}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>'); }
    function L(ja, en) { return T(fu(ja), esc(en)); }               // 画面の文章（HTML）
    function plain(ja) { return ja.replace(/\{([^|}]+)\|([^}]+)\}/g, '$1'); }

    var box = I.msgBox($('rsMsg'));
    var list = [], max = 3, expired = false;
    var cur = null, step = 0, dirty = false, timer = null, saving = Promise.resolve(), lastSaved = null;

    /* ---------- 共通 ---------- */
    function kick(res) { A.clear(); A.flash((res && res.message) || 'もう一度ログインしてください。'); location.replace('login.html'); return new Promise(function () {}); }
    function api(body) { body.token = s.token; return A.api(body); }
    function fail(res) {       // サーバーのエラーを画面に出す
        if (res && res.reason) return kick(res);
        if (res && res.message) box.fromServer(res.message, 'error');
        else box.set('うまくいきませんでした。', 'Something went wrong.', 'error');
    }
    function netFail() { box.set(fu('{通信|つうしん}できませんでした。{時間|じかん}をおいてもう{一度|いちど}お{試|ため}しください。'), 'Network error. Please try again.', 'error'); }
    function when(iso) {
        if (!iso) return '';
        var j = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
        var p = function (n) { return (n < 10 ? '0' : '') + n; };
        return T(j.getUTCFullYear() + '年' + (j.getUTCMonth() + 1) + '月' + j.getUTCDate() + '日 ' + p(j.getUTCHours()) + ':' + p(j.getUTCMinutes()),
            j.getUTCFullYear() + '-' + p(j.getUTCMonth() + 1) + '-' + p(j.getUTCDate()) + ' ' + p(j.getUTCHours()) + ':' + p(j.getUTCMinutes()));
    }
    var expiredNote = function () {
        return '<p class="rs-warn">' + L('{利用|りよう}{期間|きかん}が{終|お}わっています。{履歴書|りれきしょ}の{作成|さくせい}・{編集|へんしゅう}・{印刷|いんさつ}をする{場合|ばあい}は{更新|こうしん}をしてください。', 'Your period of use has ended. To create, edit or print your resume, please renew.') +
            ' <a href="mypage.html">' + L('マイページで{更新|こうしん}する', 'Renew on My page') + '</a></p>';
    };

    /* ---------- 値の読み書き（"edu.0.y" のような道すじ） ---------- */
    function getPath(o, path) { var p = path.split('.'); for (var i = 0; i < p.length; i++) { if (o == null) return undefined; o = o[p[i]]; } return o; }
    function setPath(o, path, val) {
        var p = path.split('.');
        for (var i = 0; i < p.length - 1; i++) { if (o[p[i]] == null) o[p[i]] = isNaN(p[i + 1]) ? {} : []; o = o[p[i]]; }
        o[p[p.length - 1]] = val;
    }
    function zen2han(v) { return String(v).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/[‐－―−ー]/g, '-'); }
    function norm(v, kind) {
        if (kind === 'num') return zen2han(v).replace(/[^0-9]/g, '');
        if (kind === 'tel') return zen2han(v).replace(/[^0-9+\-]/g, '');
        if (kind === 'zip') return zen2han(v).replace(/[^0-9\-]/g, '');
        return v;
    }
    function fixData(d) {
        d = d && typeof d === 'object' ? d : {};
        if (!d.era) d.era = 'seireki';
        if (d.showForeign == null) d.showForeign = true;
        ['edu', 'work', 'lic'].forEach(function (k) { if (!Array.isArray(d[k])) d[k] = []; });
        return d;
    }

    /* ---------- 和暦・年齢・並び ---------- */
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
    function sortRows(rows) {
        var idx = rows.map(function (r, i) { return { r: r, i: i }; });
        idx.sort(function (a, b) {
            var ka = (+a.r.y || 99999) * 100 + (+a.r.m || 0), kb = (+b.r.y || 99999) * 100 + (+b.r.m || 0);
            return ka - kb || a.i - b.i;
        });
        return idx.map(function (x) { return x.r; });
    }
    function preview(title, rows, era, closing) {
        var items = rows.filter(function (r) { return (r.t || '').trim() || r.k; });
        if (!items.length) return '';
        var h = '<div class="rs-pv"><p class="rs-pv-h">' + L('{履歴書|りれきしょ}には、こう{書|か}かれます', 'How it will look on your resume') + '</p><ol>' +
            '<li class="rs-pv-title"><span></span><span>' + esc(title) + '</span></li>';
        items.forEach(function (r) {
            var ym = eraYear(r.y, r.m, era) + (r.m ? (+r.m) + '月' : '');
            h += '<li><span>' + esc(ym) + '</span><span>' + esc(((r.t || '').trim() + (r.k ? ' ' + r.k : '')).trim()) + '</span></li>';
        });
        if (closing) h += '<li class="rs-pv-end"><span></span><span>' + esc(closing) + '</span></li>';
        return h + '</ol></div>';
    }

    function pvFor(n) {
        var d = cur.data;
        if (n === 3) return preview('学歴', d.edu, d.era);
        if (n === 4) return preview('職歴', d.work, d.era, '以上');
        if (n === 5) return preview('免許・資格', d.lic, d.era);
        return '';
    }

    /* ---------- 入力欄の部品 ---------- */
    function dis() { return expired ? ' disabled' : ''; }
    function F(label, key, o) {
        o = o || {};
        var v = key === 'title' ? cur.title : getPath(cur.data, key);
        return '<div class="rs-f' + (o.cls ? ' ' + o.cls : '') + '"><label for="f_' + key + '">' + label + (o.opt ? '<span class="rs-opt">' + L('{任意|にんい}', 'optional') + '</span>' : '') + '</label>' +
            (o.hint ? '<p class="rs-hint">' + o.hint + '</p>' : '') +
            '<input id="f_' + key + '" data-k="' + key + '"' + (o.norm ? ' data-norm="' + o.norm + '"' : '') + ' type="' + (o.type || 'text') + '"' +
            (o.im ? ' inputmode="' + o.im + '"' : '') + (o.ac ? ' autocomplete="' + o.ac + '"' : '') + (o.max ? ' maxlength="' + o.max + '"' : '') +
            (o.list ? ' list="' + o.list + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + ' value="' + esc(v) + '"' + dis() + '></div>';
    }
    function TA(label, key, o) {
        o = o || {};
        return '<div class="rs-f"><label for="f_' + key + '">' + label + '</label>' + (o.hint ? '<p class="rs-hint">' + o.hint + '</p>' : '') +
            '<textarea id="f_' + key + '" data-k="' + key + '" rows="' + (o.rows || 5) + '" maxlength="' + (o.max || 1000) + '"' + dis() + '>' + esc(getPath(cur.data, key)) + '</textarea></div>';
    }
    function S(label, key, opts, o) {
        o = o || {};
        var v = getPath(cur.data, key) || '';
        var h = '<div class="rs-f"><label for="f_' + key + '">' + label + (o.opt ? '<span class="rs-opt">' + L('{任意|にんい}', 'optional') + '</span>' : '') + '</label>' + (o.hint ? '<p class="rs-hint">' + o.hint + '</p>' : '') +
            '<select id="f_' + key + '" data-k="' + key + '"' + dis() + '>';
        opts.forEach(function (p) { h += '<option value="' + esc(p[0]) + '"' + (p[0] === v ? ' selected' : '') + '>' + (typeof p[1] === 'function' ? p[1]() : esc(p[1])) + '</option>'; });
        return h + '</select></div>';
    }
    function C(label, key, checked) {
        return '<div class="rs-f rs-check"><label><input type="checkbox" data-k="' + key + '"' + (checked ? ' checked' : '') + dis() + '> <span>' + label + '</span></label></div>';
    }
    function opt(ja, en) { return function () { return T(plain(ja), en); }; }

    /* ---------- ステップの中身 ---------- */
    function rowEditor(key, kinds, ph, nameLabel) {
        var rows = cur.data[key], h = '';
        rows.forEach(function (r, i) {
            h += '<div class="rs-row"><div class="rs-row-top">' +
                '<div class="rs-f rs-sm"><label for="f_' + key + '.' + i + '.y">' + L('{年|ねん}（{西暦|せいれき}）', 'Year') + '</label><input id="f_' + key + '.' + i + '.y" data-k="' + key + '.' + i + '.y" data-norm="num" inputmode="numeric" maxlength="4" placeholder="2020" value="' + esc(r.y) + '"' + dis() + '></div>' +
                '<div class="rs-f rs-sm"><label for="f_' + key + '.' + i + '.m">' + L('{月|つき}', 'Month') + '</label><input id="f_' + key + '.' + i + '.m" data-k="' + key + '.' + i + '.m" data-norm="num" inputmode="numeric" maxlength="2" placeholder="4" value="' + esc(r.m) + '"' + dis() + '></div>' +
                (expired ? '' : '<button type="button" class="rs-del" data-del="' + key + '.' + i + '" aria-label="' + T('この行を削除', 'Delete this row') + '">' + L('{削除|さくじょ}', 'Delete') + '</button>') + '</div>' +
                '<div class="rs-f"><label for="f_' + key + '.' + i + '.t">' + nameLabel + '</label><input id="f_' + key + '.' + i + '.t" data-k="' + key + '.' + i + '.t" maxlength="80" placeholder="' + esc(ph) + '" value="' + esc(r.t) + '"' + dis() + '></div>';
            if (kinds) {
                h += '<div class="rs-f"><label for="f_' + key + '.' + i + '.k">' + L('{区分|くぶん}', 'Type') + '</label><select id="f_' + key + '.' + i + '.k" data-k="' + key + '.' + i + '.k"' + dis() + '>';
                kinds.forEach(function (k) { h += '<option value="' + esc(k[0]) + '"' + (k[0] === (r.k || '') ? ' selected' : '') + '>' + esc(T(k[0] || '（なし）', k[1])) + '</option>'; });
                h += '</select></div>';
            }
            h += '</div>';
        });
        if (!expired) {
            h += '<div class="rs-row-acts"><button type="button" class="btn btn-secondary" data-add="' + key + '">' + L('＋ {行|ぎょう}を{追加|ついか}', '+ Add a row') + '</button>' +
                (rows.length > 1 ? '<button type="button" class="btn btn-secondary" data-sort="' + key + '">' + L('{年月|ねんげつ}の{順|じゅん}に{並|なら}べる', 'Sort by date') + '</button>' : '') + '</div>';
        }
        return h;
    }
    var EDU_KINDS = [['', 'None'], ['入学', 'Enrolled'], ['卒業', 'Graduated'], ['卒業見込', 'Expected to graduate'], ['中途退学', 'Left before graduating'], ['修了', 'Completed']];
    var WORK_KINDS = [['', 'None'], ['入社', 'Joined'], ['退社', 'Left'], ['現在に至る', 'Currently employed']];
    var STATUS_LIST = ['留学', '家族滞在', '技術・人文知識・国際業務', '特定技能', '特定活動', '永住者', '日本人の配偶者等', '永住者の配偶者等', '定住者'];

    var STEPS = [
        { ja: '{基本|きほん}の{情報|じょうほう}', en: 'Basic information', body: function () {
            return F(L('{氏名|しめい}（ふりがな）', 'Name (reading)'), 'nameFuri', { max: 60, ac: 'off', hint: L('ひらがな、またはカタカナで{入力|にゅうりょく}します。', 'Write the reading in hiragana or katakana.') }) +
                F(L('{氏名|しめい}', 'Full name'), 'name', { max: 60, ac: 'name' }) +
                S(L('{性別|せいべつ}', 'Gender'), 'gender', [['', opt('{書|か}かない', 'Leave blank')], ['男', opt('{男|おとこ}', 'Male')], ['女', opt('{女|おんな}', 'Female')], ['その他', opt('その{他|た}', 'Other')]], { opt: 1 }) +
                '<div class="rs-f"><span class="rs-lab">' + L('{生年月日|せいねんがっぴ}（{西暦|せいれき}）', 'Date of birth') + '</span><div class="rs-row3">' +
                '<input aria-label="' + T('年', 'Year') + '" data-k="bY" data-norm="num" inputmode="numeric" maxlength="4" placeholder="2000" value="' + esc(cur.data.bY) + '"' + dis() + '><span>' + T('年', '/') + '</span>' +
                '<input aria-label="' + T('月', 'Month') + '" data-k="bM" data-norm="num" inputmode="numeric" maxlength="2" placeholder="4" value="' + esc(cur.data.bM) + '"' + dis() + '><span>' + T('月', '/') + '</span>' +
                '<input aria-label="' + T('日', 'Day') + '" data-k="bD" data-norm="num" inputmode="numeric" maxlength="2" placeholder="1" value="' + esc(cur.data.bD) + '"' + dis() + '><span>' + T('日', '') + '</span></div>' +
                '<p class="rs-age" id="rsAge"></p></div>';
        } },
        { ja: '{連絡先|れんらくさき}', en: 'Contact details', body: function () {
            var d = cur.data;
            return F(L('{郵便番号|ゆうびんばんごう}', 'Postal code'), 'zip', { norm: 'zip', im: 'numeric', max: 8, ph: '902-0062', ac: 'postal-code' }) +
                F(L('{現住所|げんじゅうしょ}（ふりがな）', 'Address (reading)'), 'addrFuri', { max: 120 }) +
                F(L('{現住所|げんじゅうしょ}', 'Current address'), 'addr', { max: 120, ac: 'street-address' }) +
                F(L('{電話番号|でんわばんごう}', 'Phone number'), 'phone', { norm: 'tel', type: 'tel', im: 'tel', max: 20, ac: 'tel' }) +
                F(L('メールアドレス', 'Email address'), 'email', { type: 'email', max: 100, ac: 'email' }) +
                C(L('{連絡先|れんらくさき}が{現住所|げんじゅうしょ}と{違|ちが}う{場合|ばあい}は、チェックします', 'Check this if your contact address is different from your current address'), 'altOn', !!d.altOn) +
                (d.altOn ? '<div class="rs-sub">' + F(L('{連絡先|れんらくさき}の{郵便番号|ゆうびんばんごう}', 'Postal code'), 'altZip', { norm: 'zip', im: 'numeric', max: 8 }) +
                    F(L('{連絡先|れんらくさき}の{住所|じゅうしょ}（ふりがな）', 'Address (reading)'), 'altAddrFuri', { max: 120 }) +
                    F(L('{連絡先|れんらくさき}の{住所|じゅうしょ}', 'Address'), 'altAddr', { max: 120 }) +
                    F(L('{連絡先|れんらくさき}の{電話番号|でんわばんごう}', 'Phone number'), 'altPhone', { norm: 'tel', type: 'tel', im: 'tel', max: 20 }) +
                    F(L('{連絡先|れんらくさき}のメールアドレス', 'Email address'), 'altEmail', { type: 'email', max: 100 }) + '</div>' : '');
        } },
        { ja: '{留学生|りゅうがくせい}の{情報|じょうほう}', en: 'Information for international students', body: function () {
            var jl = [['', opt('{書|か}かない', 'Leave blank')], ['N1', 'N1'], ['N2', 'N2'], ['N3', 'N3'], ['N4', 'N4'], ['N5', 'N5'], ['受験予定', opt('{受験予定|じゅけんよてい}', 'Planning to take the test')]];
            return '<p class="rs-note">' + L('この{情報|じょうほう}は、{日本|にほん}の{履歴書|りれきしょ}の{様式例|ようしきれい}にはありません。{印刷|いんさつ}するときに{載|の}せるかどうかを、{選|えら}べます。', 'This information is not on the standard Japanese resume form. You can choose whether to print it.') + '</p>' +
                F(L('{国籍|こくせき}', 'Nationality'), 'nationality', { max: 40, ph: T('例：ネパール', 'e.g. Nepal') }) +
                F(L('{在留資格|ざいりゅうしかく}', 'Status of residence'), 'status', { max: 40, list: 'dlStatus', ph: T('例：留学', 'e.g. 留学 (Student)') }) +
                '<datalist id="dlStatus">' + STATUS_LIST.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' +
                F(L('{在留期限|ざいりゅうきげん}', 'Expiry of stay'), 'statusExp', { type: 'date' }) +
                S(L('{日本語|にほんご}の{能力|のうりょく}（JLPT）', 'Japanese ability (JLPT)'), 'jlpt', jl) +
                F(L('{日本語|にほんご}について{補足|ほそく}', 'Notes on your Japanese'), 'jlptNote', { opt: 1, max: 80, ph: T('例：2026年7月 N2 合格', 'e.g. Passed N2 in July 2026') }) +
                C(L('{履歴書|りれきしょ}に{載|の}せる', 'Print this on my resume'), 'showForeign', cur.data.showForeign !== false);
        } },
        { ja: '{学歴|がくれき}', en: 'Education', body: function () {
            return S(L('{年|ねん}の{書|か}きかた', 'Year style'), 'era', [['seireki', opt('{西暦|せいれき}（2020{年|ねん}）', 'Western (2020)')], ['wareki', opt('{和暦|われき}（{令和|れいわ}2{年|ねん}）', 'Japanese era (令和2)')]], { hint: L('{入力|にゅうりょく}は{西暦|せいれき}で{大丈夫|だいじょうぶ}です。{和暦|われき}を{選|えら}ぶと、{自動|じどう}で{直|なお}します。', 'You enter years in the Western style. The Japanese era is converted automatically.') }) +
                '<p class="rs-note">' + L('{高校|こうこう}から{順|じゅん}に{入力|にゅうりょく}します。{学校|がっこう}の{名前|なまえ}と{区分|くぶん}（{入学|にゅうがく}・{卒業|そつぎょう}）を{選|えら}びます。', 'Enter schools from high school onward. Choose the type (enrolled / graduated) for each row.') + '</p>' +
                rowEditor('edu', EDU_KINDS, T('例：東京ABC大学 経営学部', 'e.g. Tokyo ABC University, Faculty of Business'), L('{学校名|がっこうめい}・{学部|がくぶ}', 'School and department')) +
                '<div id="rsPv">' + pvFor(3) + '</div>';
        } },
        { ja: '{職歴|しょくれき}', en: 'Work history', body: function () {
            return '<p class="rs-note">' + L('アルバイトも{書|か}けます。{職歴|しょくれき}がない{場合|ばあい}は、{空|あ}けたままで{大丈夫|だいじょうぶ}です（「なし」と{印刷|いんさつ}します）。', 'You can include part-time jobs. If you have no work history, leave this empty (it will print as 「なし」).') + '</p>' +
                rowEditor('work', WORK_KINDS, T('例：株式会社ABC 販売スタッフ（アルバイト）', 'e.g. ABC Co., Ltd. sales staff (part-time)'), L('{会社名|かいしゃめい}・{仕事|しごと}', 'Company and job')) +
                '<div id="rsPv">' + pvFor(4) + '</div>';
        } },
        { ja: '{免許|めんきょ}・{資格|しかく}', en: 'Licenses and qualifications', body: function () {
            return '<p class="rs-note">' + L('JLPTなど、とった{資格|しかく}を{書|か}きます。{取|と}った{年月|ねんげつ}と{名前|なまえ}を{入力|にゅうりょく}してください。', 'Write qualifications you have earned, such as the JLPT. Enter the year, month and name.') + '</p>' +
                rowEditor('lic', null, T('例：日本語能力試験 N2 合格', 'e.g. Passed JLPT N2'), L('{免許|めんきょ}・{資格|しかく}の{名前|なまえ}', 'Name of license or qualification')) +
                '<div id="rsPv">' + pvFor(5) + '</div>';
        } },
        { ja: '{志望|しぼう}{動機|どうき}など', en: 'Motivation and other notes', body: function () {
            return '<p class="rs-note">' + L('{自分|じぶん}の{言葉|ことば}で{書|か}きます。{志望動機|しぼうどうき}と{自己|じこ}PRの{自動作成|じどうさくせい}は、もうすぐ{使|つか}えるようになります。', 'Write in your own words. Automatic drafting of your motivation and self-PR will be available soon.') + '</p>' +
                TA(L('{志望|しぼう}の{動機|どうき}', 'Reason for applying'), 'motive', { rows: 6, max: 1000 }) +
                TA(L('{特技|とくぎ}・{好|す}きな{学科|がっか}・アピールポイント', 'Skills, favorite subjects, strengths'), 'special', { rows: 5, max: 600 }) +
                TA(L('{本人希望|ほんにんきぼう}の{記入欄|きにゅうらん}', 'Requests'), 'wish', { rows: 3, max: 300, hint: L('{空|から}のときは「{貴社|きしゃ}の{規定|きてい}に{従|したが}います」と{印刷|いんさつ}します。', 'If empty, a standard sentence (“I will follow your company’s rules”) is printed.') });
        } },
        { ja: '{確認|かくにん}', en: 'Check', body: function () {
            var d = cur.data, miss = [];
            [['name', '{氏名|しめい}', 'Name'], ['nameFuri', '{氏名|しめい}（ふりがな）', 'Name (reading)'], ['bY', '{生年月日|せいねんがっぴ}', 'Date of birth'], ['addr', '{現住所|げんじゅうしょ}', 'Current address'], ['phone', '{電話番号|でんわばんごう}', 'Phone number'], ['email', 'メールアドレス', 'Email address']].forEach(function (x) {
                if (!String(d[x[0]] || '').trim()) miss.push('<li>' + L(x[1], x[2]) + '</li>');
            });
            var a = ageOf(d);
            return (miss.length ? '<div class="rs-warn"><p>' + L('まだ{入力|にゅうりょく}していない{項目|こうもく}があります。', 'Some items are still empty.') + '</p><ul>' + miss.join('') + '</ul></div>' : '<p class="rs-ok">' + L('{必要|ひつよう}な{項目|こうもく}は、すべて{入力|にゅうりょく}されています。', 'All the main items are filled in.') + '</p>') +
                '<dl class="rs-sum"><dt>' + L('{氏名|しめい}', 'Name') + '</dt><dd>' + esc(d.name) + '</dd><dt>' + L('{生年月日|せいねんがっぴ}', 'Date of birth') + '</dt><dd>' + (d.bY ? esc(eraYear(d.bY, d.bM, d.era) + (d.bM || '') + (d.bM ? '月' : '') + (d.bD || '') + (d.bD ? '日' : '')) + (a != null ? T('（満' + a + '歳）', ' (age ' + a + ')') : '') : '') + '</dd>' +
                '<dt>' + L('{現住所|げんじゅうしょ}', 'Address') + '</dt><dd>' + esc(d.addr) + '</dd><dt>' + L('{学歴|がくれき}・{職歴|しょくれき}・{資格|しかく}', 'Education / work / qualifications') + '</dt><dd>' + T(d.edu.length + '行・' + d.work.length + '行・' + d.lic.length + '行', d.edu.length + ' / ' + d.work.length + ' / ' + d.lic.length + ' rows') + '</dd></dl>' +
                '<p class="rs-note">' + L('{入力|にゅうりょく}した{内容|ないよう}は、{自動|じどう}で{保存|ほぞん}されています。{画面|がめん}でのプレビューと「{印刷|いんさつ}／PDFに{保存|ほぞん}」、{証明写真|しょうめいしゃしん}は、もうすぐ{使|つか}えるようになります。', 'Your input is saved automatically. The on-screen preview, “Print / Save as PDF”, and ID photo will be available soon.') + '</p>';
        } }
    ];

    /* ---------- 一覧の画面 ---------- */
    function renderList() {
        $('viewEdit').hidden = true;
        var v = $('viewList'), h = '';
        h += '<h1><span>' + L('{履歴書|りれきしょ}', 'Resumes') + '</span></h1>';
        if (expired) h += expiredNote();
        h += '<p class="rs-count">' + T('いま ' + list.length + '通 ／ ' + max + '通まで', list.length + ' of ' + max + ' resumes') + '</p>';
        if (!list.length) h += '<p class="rs-empty">' + L('まだ{履歴書|りれきしょ}がありません。{下|した}のボタンから{作|つく}ります。', 'You have no resumes yet. Press the button below to create one.') + '</p>';
        h += '<ul class="rs-list">';
        list.forEach(function (r) {
            h += '<li class="rs-item"><div class="rs-item-main"><strong>' + esc(r.title) + '</strong><small>' + L('{更新|こうしん}', 'Updated') + '：' + esc(when(r.updatedAt)) + '</small></div><div class="rs-acts">' +
                '<button type="button" class="btn" data-act="open" data-id="' + esc(r.resumeId) + '">' + (expired ? L('{見|み}る', 'View') : L('{入力|にゅうりょく}する', 'Edit')) + '</button>' +
                (expired ? '' : '<button type="button" class="btn btn-secondary" data-act="copy" data-id="' + esc(r.resumeId) + '"' + (list.length >= max ? ' disabled' : '') + '>' + L('コピー', 'Copy') + '</button>' +
                    '<button type="button" class="btn btn-secondary" data-act="del" data-id="' + esc(r.resumeId) + '">' + L('{削除|さくじょ}', 'Delete') + '</button>') + '</div></li>';
        });
        h += '</ul>';
        if (!expired) h += '<button type="button" class="btn btn-lg btn-block" id="rsNew"' + (list.length >= max ? ' disabled' : '') + '>' + L('＋ あたらしい{履歴書|りれきしょ}をつくる', '+ Create a new resume') + '</button>' +
            (list.length >= max ? '<p class="rs-hint">' + L('{履歴書|りれきしょ}は' + max + '通までです。{削除|さくじょ}すると、また{作|つく}れます。', 'You can have up to ' + max + ' resumes. Delete one to create another.') + '</p>' : '');
        h += '<a class="btn btn-secondary btn-block rs-back" href="mypage.html">' + L('マイページへ{戻|もど}る', 'Back to My page') + '</a>';
        v.innerHTML = h; v.hidden = false;
    }
    function reloadList() {
        return api({ action: 'resumeList' }).then(function (res) {
            if (res && res.ok) { list = res.resumes; max = res.max; expired = res.expired; return res; }
            return fail(res);
        });
    }

    /* ---------- 入力の画面 ---------- */
    function renderEditor() {
        $('viewList').hidden = true;
        var v = $('viewEdit'), h = '';
        var st = STEPS[step];
        h += '<div class="rs-top"><button type="button" class="rs-link" id="rsToList">‹ ' + L('{一覧|いちらん}へ{戻|もど}る', 'Back to the list') + '</button><span class="rs-status" id="rsStatus" role="status" aria-live="polite"></span></div>';
        if (expired) h += expiredNote();
        h += F(L('{履歴書|りれきしょ}の{名前|なまえ}（{自分|じぶん}だけが{見|み}ます）', 'Resume name (only you can see it)'), 'title', { max: 40, cls: 'rs-title' });
        h += '<ol class="rs-steps" aria-label="' + T('ステップ', 'Steps') + '">';
        STEPS.forEach(function (x, i) { h += '<li><button type="button" data-go="' + i + '" class="' + (i === step ? 'is-cur' : (i < step ? 'is-done' : '')) + '"' + (i === step ? ' aria-current="step"' : '') + ' aria-label="' + (i + 1) + ': ' + esc(T(plain(x.ja), x.en)) + '">' + (i + 1) + '</button></li>'; });
        h += '</ol><h2 class="rs-h2"><span>' + (step + 1) + '/' + STEPS.length + '　' + L(st.ja, st.en) + '</span></h2>';
        h += '<div class="rs-body">' + st.body() + '</div>';
        h += '<div class="rs-nav">' + (step > 0 ? '<button type="button" class="btn btn-secondary" data-go="' + (step - 1) + '">' + L('{戻|もど}る', 'Back') + '</button>' : '<span></span>') +
            (step < STEPS.length - 1 ? '<button type="button" class="btn" data-go="' + (step + 1) + '">' + L('{次|つぎ}へ', 'Next') + '</button>' : '<button type="button" class="btn" id="rsDone">' + L('{一覧|いちらん}へ{戻|もど}る', 'Back to the list') + '</button>') + '</div>';
        v.innerHTML = h; v.hidden = false;
        updateAge(); setStatus(dirty ? 'dirty' : (lastSaved ? 'saved' : ''));
    }
    function updateAge() {
        var el = $('rsAge'); if (!el) return;
        var a = ageOf(cur.data);
        el.innerHTML = a == null ? '' : L('{満|まん}' + a + '{歳|さい}', 'Age: ' + a);
    }
    function setStatus(kind) {
        var el = $('rsStatus'); if (!el) return;
        if (expired) { el.textContent = T('見るだけ', 'View only'); return; }
        var t = '';
        if (kind === 'saving') t = T('保存しています…', 'Saving…');
        else if (kind === 'saved') t = T('保存しました ', 'Saved ') + when(lastSaved);
        else if (kind === 'dirty') t = T('入力中…', 'Editing…');
        else if (kind === 'error') t = T('保存できませんでした。もう一度お試しください。', 'Could not save. Please try again.');
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
        timer = setTimeout(function () { saveNow().then(function (r) { if (r && r.ok === false) fail(r); }, function () {}); }, 1500);
    }
    function flush() { clearTimeout(timer); return saveNow(); }

    /* ---------- 操作 ---------- */
    function show(res, after) { if (res && res.ok === false) return fail(res); after && after(); }
    function goStep(n) {
        box.clear();
        if (!dirty || expired) { step = n; renderEditor(); window.scrollTo(0, 0); return; }
        window.RLoading.run(function () { return flush(); }, {
            text: T('保存しています', 'Saving'),
            onSuccess: function (res) { show(res, function () { step = n; renderEditor(); window.scrollTo(0, 0); }); },
            onError: netFail
        });
    }
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
                    step = 0; dirty = false; lastSaved = res.resume.updatedAt;
                    history.replaceState(null, '', '#' + cur.resumeId);
                    renderEditor(); window.scrollTo(0, 0);
                });
            },
            onError: netFail
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
            onSuccess: function (res) { show(res, function () { if (copyFrom) { renderList(); box.set('コピーしました。', 'Copied.', 'ok'); } else openResume(res.resumeId); }); },
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
    var dlgNew = $('dlgNew'), dlgDel = $('dlgDel'), delId = '';
    $('viewList').addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.disabled) return;
        if (b.id === 'rsNew') {
            $('newTitle').value = T('履歴書', 'Resume') + (list.length + 1); dlgNew.showModal(); $('newTitle').select(); return;
        }
        var id = b.getAttribute('data-id'), act = b.getAttribute('data-act');
        if (act === 'open') openResume(id);
        else if (act === 'copy') {
            var src = list.filter(function (x) { return x.resumeId === id; })[0];
            createResume(((src && src.title) || '履歴書') + T('のコピー', ' (copy)'), id);
        } else if (act === 'del') {
            delId = id;
            var r = list.filter(function (x) { return x.resumeId === id; })[0];
            $('delName').textContent = r ? r.title : '';
            dlgDel.showModal();
        }
    });
    $('newNo').addEventListener('click', function () { dlgNew.close(); });
    $('newForm').addEventListener('submit', function (e) { e.preventDefault(); dlgNew.close(); createResume($('newTitle').value.trim() || T('履歴書', 'Resume'), ''); });
    $('delNo').addEventListener('click', function () { dlgDel.close(); });
    $('delForm').addEventListener('submit', function (e) { e.preventDefault(); dlgDel.close(); deleteResume(delId); });

    var ev = $('viewEdit');
    ev.addEventListener('input', function (e) {
        var el = e.target, k = el.getAttribute && el.getAttribute('data-k'); if (!k || expired) return;
        var val = el.type === 'checkbox' ? el.checked : el.value;
        var n = el.getAttribute('data-norm');
        if (n && el.type !== 'checkbox') { var nv = norm(val, n); if (nv !== val) { var p = el.selectionStart; el.value = nv; try { el.setSelectionRange(p - 1, p - 1); } catch (x) {} } val = nv; }
        if (k === 'title') cur.title = val; else setPath(cur.data, k, val);
        if (k === 'bY' || k === 'bM' || k === 'bD') updateAge();
        if (/^(edu|work|lic)\./.test(k) && $('rsPv')) $('rsPv').innerHTML = pvFor(step);
        schedule();
    });
    ev.addEventListener('change', function (e) {      // 項目が増えたり減ったりする入力は、画面を作り直す
        var el = e.target, k = el.getAttribute && el.getAttribute('data-k'); if (!k || expired) return;
        if (k === 'altOn' || k === 'era') { setPath(cur.data, k, el.type === 'checkbox' ? el.checked : el.value); schedule(); renderEditor(); }
    });
    ev.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.id === 'rsToList' || b.id === 'rsDone') return toList();
        if (b.hasAttribute('data-go')) return goStep(+b.getAttribute('data-go'));
        if (expired) return;
        if (b.hasAttribute('data-add')) { var k = b.getAttribute('data-add'); cur.data[k].push(k === 'lic' ? { y: '', m: '', t: '' } : { y: '', m: '', t: '', k: '' }); schedule(); renderEditor(); }
        else if (b.hasAttribute('data-del')) { var p = b.getAttribute('data-del').split('.'); cur.data[p[0]].splice(+p[1], 1); schedule(); renderEditor(); }
        else if (b.hasAttribute('data-sort')) { var kk = b.getAttribute('data-sort'); cur.data[kk] = sortRows(cur.data[kk]); schedule(); renderEditor(); }
    });
    window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && dirty && !expired) saveNow().catch(function () {}); });
    I.onChange(function () { if (!$('viewEdit').hidden) { var y = window.scrollY; renderEditor(); window.scrollTo(0, y); } else if (!$('viewList').hidden) renderList(); });

    /* ---------- 最初の読み込み ---------- */
    window.RLoading.hold(reloadList().then(function (res) {
        if (!res) return;
        var id = (location.hash || '').replace('#', '');
        if (id && list.some(function (x) { return x.resumeId === id; })) {
            return api({ action: 'resumeGet', resumeId: id }).then(function (r) {
                if (r && r.ok) { expired = r.expired; cur = { resumeId: r.resume.resumeId, title: r.resume.title, data: fixData(r.resume.data) }; lastSaved = r.resume.updatedAt; renderEditor(); }
                else renderList();
            });
        }
        renderList();
    }).catch(function () { netFail(); $('viewList').hidden = false; }));
})();
