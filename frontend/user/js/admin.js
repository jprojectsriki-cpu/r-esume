/* R-ESUME 管理画面（管理者だけ）。日本語のみ */
(function () {
    'use strict';
    var A = window.RAuth;
    var s = A.load();
    if (!s || !s.token || !A.ready()) { location.replace('login.html'); return; }
    function $(id) { return document.getElementById(id); }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function jst(iso, withYear) {
        if (!iso) return '―';
        var j = new Date(new Date(iso).getTime() + 9 * 3600 * 1000), p = function (n) { return (n < 10 ? '0' : '') + n; };
        return (withYear ? j.getUTCFullYear() + '/' : '') + (j.getUTCMonth() + 1) + '/' + j.getUTCDate() + ' ' + p(j.getUTCHours()) + ':' + p(j.getUTCMinutes());
    }
    function yen(n) { return '¥' + Number(n).toLocaleString('ja-JP'); }

    var data = { applications: [], users: [], quals: [], notices: [] }, query = '', tab = 'apps', appFilter = 'wait', userFilter = 'all';

    /* ---- 状態の表示 ---- */
    function appState(a) {
        if (a.status === 'awaiting_payment') return a.overdue ? { t: '支払期限超過', c: 's-over' } : { t: '入金待ち', c: 's-wait' };
        if (a.status === 'issued') return { t: '発行済み', c: 's-ok' };
        if (a.status === 'paid') return { t: '入金済み', c: 's-wait' };
        if (a.status === 'expired') return { t: '期限切れ', c: 's-off' };
        if (a.status === 'cancelled') return { t: 'キャンセル', c: 's-off' };
        return { t: a.status, c: 's-off' };
    }
    function userState(u) {
        if (u.status === 'suspended') return { t: '利用停止中', c: 's-over' };
        if (u.status === 'pending') return { t: '発行前', c: 's-wait' };
        if (u.expired) return { t: '期限切れ', c: 's-off' };
        return { t: '利用中', c: 's-ok' };
    }
    var APP_FILTERS = [
        ['wait', '入金待ち', function (a) { return a.status === 'awaiting_payment' || a.status === 'paid'; }],
        ['issued', '発行済み', function (a) { return a.status === 'issued'; }],
        ['closed', '期限切れ・キャンセル', function (a) { return a.status === 'expired' || a.status === 'cancelled'; }],
        ['all', 'すべて', function () { return true; }]
    ];
    var USER_FILTERS = [
        ['all', 'すべて', function () { return true; }],
        ['active', '利用中', function (u) { return u.status === 'active' && !u.expired; }],
        ['expired', '期限切れ', function (u) { return u.status === 'active' && u.expired; }],
        ['pending', '発行前', function (u) { return u.status === 'pending'; }],
        ['suspended', '利用停止中', function (u) { return u.status === 'suspended'; }]
    ];

    function chips(el, defs, list, cur, onPick) {
        el.innerHTML = defs.map(function (d) {
            var n = list.filter(d[2]).length;
            return '<button type="button" class="chip' + (d[0] === cur ? ' is-on' : '') + '" aria-pressed="' + (d[0] === cur) + '" data-f="' + d[0] + '">' + esc(d[1]) + '（' + n + '）</button>';
        }).join('');
        Array.prototype.forEach.call(el.querySelectorAll('.chip'), function (b) { b.addEventListener('click', function () { onPick(b.getAttribute('data-f')); }); });
    }

    function hit(parts) { if (!query) return true; return parts.join(' ').toLowerCase().indexOf(query) >= 0; }
    function renderStats() {
        var apps = data.applications, users = data.users;
        var wait = apps.filter(function (a) { return a.status === 'awaiting_payment' || a.status === 'paid'; }).length;
        var over = apps.filter(function (a) { return a.overdue; }).length;
        var act = users.filter(function (u) { return u.status === 'active' && !u.expired; }).length;
        var exp = users.filter(function (u) { return u.status === 'active' && u.expired; }).length;
        var sus = users.filter(function (u) { return u.status === 'suspended'; }).length;
        var tiles = [
            ['入金待ち', wait, 'apps', 'wait', wait > 0], ['支払期限超過', over, 'apps', 'wait', over > 0],
            ['利用中', act, 'users', 'active', false], ['期限切れ', exp, 'users', 'expired', false], ['利用停止中', sus, 'users', 'suspended', sus > 0]
        ];
        $('stats').innerHTML = tiles.map(function (t, i) {
            return '<button type="button" class="stat' + (t[4] ? ' is-alert' : '') + '" data-stat="' + i + '"><span class="stat-n">' + t[1] + '</span><span class="stat-t">' + t[0] + '</span></button>';
        }).join('');
        Array.prototype.forEach.call($('stats').querySelectorAll('.stat'), function (b) {
            b.addEventListener('click', function () {
                var t = tiles[+b.getAttribute('data-stat')];
                if (t[2] === 'apps') appFilter = t[3]; else userFilter = t[3];
                setTab(t[2]); render();
            });
        });
    }
    function render() {
        renderQuals();
        renderNotices();
        renderStats();
        var apps = data.applications, users = data.users;
        $('cntApps').textContent = apps.filter(function (a) { return a.status === 'awaiting_payment' || a.status === 'paid'; }).length;
        $('cntUsers').textContent = users.length;

        chips($('appChips'), APP_FILTERS, apps, appFilter, function (f) { appFilter = f; render(); });
        var af = APP_FILTERS.filter(function (d) { return d[0] === appFilter; })[0][2];
        var shownApps = apps.filter(af).filter(function (a) { return hit([a.name, a.email, a.applicationId]); });
        $('appList').innerHTML = shownApps.map(function (a) {
            var st = appState(a), canIssue = a.status === 'awaiting_payment' || a.status === 'paid' || a.status === 'expired';
            var canCancel = a.status === 'awaiting_payment' || a.status === 'paid' || a.status === 'expired';
            return '<article class="acard' + (a.overdue ? ' is-alert' : '') + '">' +
                '<div class="acard-top"><span class="badge ' + st.c + '">' + esc(st.t) + '</span><span class="acard-id">' + esc(a.applicationId) + '</span></div>' +
                '<div class="acard-name">' + esc(a.name) + '</div><div class="acard-mail">' + esc(a.email) + '</div>' +
                '<div class="acard-meta"><span>金額：' + yen(a.amount) + '</span><span>申込：' + jst(a.createdAt, true) + '</span><span>支払期限：' + jst(a.expiresAt, true) + '</span>' +
                (a.issuedAt ? '<span>発行：' + jst(a.issuedAt, true) + '</span>' : '') + '</div>' +
                (a.note ? '<p class="acard-note">' + esc(a.note) + '</p>' : '') +
                ((canIssue || canCancel) ? '<div class="acard-actions">' +
                    (canIssue ? '<button type="button" class="btn" data-act="issue" data-id="' + esc(a.applicationId) + '">入金を確認して発行</button>' : '') +
                    (canCancel ? '<button type="button" class="btn btn-danger" data-act="cancel" data-id="' + esc(a.applicationId) + '">キャンセル</button>' : '') +
                    '</div>' : '') + '</article>';
        }).join('');
        $('appEmpty').hidden = shownApps.length > 0;

        chips($('userChips'), USER_FILTERS, users, userFilter, function (f) { userFilter = f; render(); });
        var uf = USER_FILTERS.filter(function (d) { return d[0] === userFilter; })[0][2];
        var shownUsers = users.filter(uf).filter(function (u) { return hit([u.name, u.email, u.userId]); });
        $('userList').innerHTML = shownUsers.map(function (u) {
            var st = userState(u);
            var btn = u.status === 'suspended'
                ? '<button type="button" class="btn" data-act="resume" data-id="' + esc(u.userId) + '">利用を再開</button>'
                : '<button type="button" class="btn btn-danger" data-act="suspend" data-id="' + esc(u.userId) + '">利用停止</button>';
            return '<article class="acard"><div class="acard-top"><span class="badge ' + st.c + '">' + esc(st.t) + '</span></div>' +
                '<div class="acard-name">' + esc(u.name) + '</div><div class="acard-mail">' + esc(u.email) + '</div>' +
                '<div class="acard-meta"><span>利用期限：' + (u.validUntil ? jst(u.validUntil, true).split(' ')[0] : '―') + '</span><span>最終ログイン：' + jst(u.lastLoginAt, true) + '</span></div>' +
                '<div class="acard-actions"><button type="button" class="btn btn-secondary" data-act="udetail" data-id="' + esc(u.userId) + '">詳細</button>' + (u.status === 'pending' ? '' : btn) + '</div></article>';
        }).join('');
        $('userEmpty').hidden = shownUsers.length > 0;
    }

    function renderNotices() {
        var list = (notices || []).filter(function (n) { return hit([n.title, n.body]); });
        $('cntNotices').textContent = (notices || []).length || '';
        $('noticeEmpty').hidden = list.length > 0;
        $('noticeList').innerHTML = list.map(function (n) {
            return '<article class="acard"><div class="acard-top"><span class="badge ' + (n.visible ? 's-ok' : 's-off') + '">' + (n.visible ? '表示中' : '非表示') + '</span><span class="acard-id">' + jst(n.createdAt, true) + '</span></div>' +
                '<div class="acard-name">' + esc(n.title) + '</div><p class="acard-note">' + esc(n.body) + '</p>' +
                '<div class="acard-actions"><button type="button" class="btn btn-secondary" data-act="nedit" data-id="' + esc(n.noticeId) + '">編集</button>' +
                '<button type="button" class="btn btn-danger" data-act="ndel" data-id="' + esc(n.noticeId) + '">削除</button></div></article>';
        }).join('');
    }
    function renderQuals() {
        var list = quals || [], groups = [], idx = {};
        list.forEach(function (q) { if (idx[q.label] == null) { idx[q.label] = groups.length; groups.push({ label: q.label, items: [] }); } groups[idx[q.label]].items.push(q); });
        var all = list; list = list.filter(function (q) { return hit([q.label, q.name]); });
        $('cntQuals').textContent = all.length || '';
        $('qualEmpty').hidden = list.length > 0;
        $('qualList').innerHTML = groups.map(function (g) {
            return '<div class="acard"><div class="acard-top"><span class="badge s-wait">' + esc(g.label) + '</span></div>' + g.items.map(function (q) {
                return '<div class="q-row"><div class="q-main"><span class="acard-name">' + esc(q.name) + '</span><span class="acard-meta">' + (q.rank != null ? '順位 ' + q.rank : '順位なし') + '</span></div>' +
                    '<div class="acard-actions"><button type="button" class="btn btn-secondary" data-act="qedit" data-id="' + esc(q.qualId) + '">編集</button>' +
                    '<button type="button" class="btn btn-danger" data-act="qdel" data-id="' + esc(q.qualId) + '">削除</button></div></div>';
            }).join('') + '</div>';
        }).join('');
        $('qLabels').innerHTML = groups.map(function (g) { return '<option value="' + esc(g.label) + '">'; }).join('');
    }
    $('adminSearch').addEventListener('input', function () { query = this.value.trim().toLowerCase(); render(); });
    function setTab(t) {
        tab = t;
        $('paneApps').hidden = t !== 'apps'; $('paneUsers').hidden = t !== 'users'; $('paneQuals').hidden = t !== 'quals'; $('paneNotices').hidden = t !== 'notices';
        Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
            var on = b.getAttribute('data-tab') === t; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on));
        });
    }
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) { b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); }); });

    function toast(text, kind) { var t = $('toast'); t.textContent = text || ''; t.className = 'toast' + (kind ? ' is-' + kind : ''); }

    /* ---- 通信 ---- */
    function kickOut(res) {   // ログインが切れた・管理者ではない
        A.clear(); A.flash((res && res.message) || 'もう一度ログインしてください。'); location.replace('login.html');
        return new Promise(function () {});
    }
    function call(body) {
        body.token = s.token;
        return A.api(body).then(function (res) {
            if (res && res.ok === false && (res.reason === 'expired' || res.reason === 'replaced' || res.reason === 'suspended' || res.reason === 'forbidden')) return kickOut(res);
            return res;
        });
    }
    var quals = [], notices = [];
    function load() {
        return call({ action: 'adminList' }).then(function (res) {
            if (res && res.ok) {
                data = res; data.quals = quals; $('loadError').hidden = true;
                return call({ action: 'qualList' }).then(function (q) { if (q && q.ok) quals = q.quals; data.quals = quals; })
                    .then(function () { return call({ action: 'adminNoticeList' }); })
                    .then(function (n) { if (n && n.ok) notices = n.notices; render(); });
            }
            $('loadError').textContent = (res && res.message) || '読み込めませんでした。'; $('loadError').hidden = false;
        }).catch(function () { $('loadError').textContent = '通信できませんでした。時間をおいて「更新」を押してください。'; $('loadError').hidden = false; });
    }

    window.RLoading.hold(load());
    $('reloadBtn').addEventListener('click', function () { toast(''); window.RLoading.run(load, { text: '更新しています', onSuccess: function () {}, onError: function () {} }); });

    $('logoutBtn').addEventListener('click', function () {
        var back = function () { A.clear(); window.RLoading.show('ログアウトしています'); location.href = 'login.html'; };
        window.RLoading.run(function () { return A.api({ action: 'logout', token: s.token }); }, { text: 'ログアウトしています', onSuccess: back, onError: back });
    });

    /* ---- 操作（確認のあとで実行） ---- */
    var dlg = $('dlgConfirm'), pending = null;
    function ask(opt) {
        $('cfTitle').textContent = opt.title; $('cfBody').textContent = opt.body;
        $('cfReasonRow').hidden = !opt.reason; $('cfReason').value = '';
        $('cfYes').textContent = opt.yes; $('cfYes').className = 'btn' + (opt.danger ? ' btn-danger' : '');
        pending = opt; dlg.showModal();
    }
    $('cfNo').addEventListener('click', function () { pending = null; dlg.close(); });
    $('confirmForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var opt = pending; pending = null; dlg.close();
        if (!opt) return;
        var body = opt.body2; if (opt.reason) body.reason = $('cfReason').value.trim();
        toast('');
        // 変更が終わり、一覧を読み直して画面に出したあとで、ローディングを消す
        var sent = false;
        window.RLoading.run(function () {
            return call(body).then(function (res) {
                if (res && res.ok) { sent = true; return load().then(function () { return res; }); }
                return res;
            });
        }, {
            text: '処理しています',
            onSuccess: function (res) {
                if (res && res.ok) {
                    toast(opt.done + (res.mailed === false ? '（お客様へのメールが送れませんでした。別の方法でお知らせください）' : ''), res.mailed === false ? 'error' : 'ok');
                } else {
                    toast((res && res.message) || '処理できませんでした。', 'error');
                }
            },
            onError: function () { toast('通信できませんでした。「更新」で状態を確かめてから、もう一度お試しください。', 'error'); }
        });
    });

    /* ---- お知らせの追加・編集 ---- */
    var nd = $('dlgNotice'), nEditId = '';
    function openNotice(n) {
        nEditId = n ? n.noticeId : '';
        $('nTitleH').textContent = n ? 'お知らせを編集' : 'お知らせを追加';
        $('nTitle').value = n ? n.title : ''; $('nBody').value = n ? n.body : ''; $('nVisible').checked = n ? n.visible : true;
        $('nMsg').textContent = ''; nd.showModal();
    }
    $('nAdd').addEventListener('click', function () { openNotice(null); });
    $('nNo').addEventListener('click', function () { nd.close(); });
    $('noticeForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var body = { action: 'adminNoticeSave', notice: { noticeId: nEditId, title: $('nTitle').value.trim(), body: $('nBody').value.trim(), visible: $('nVisible').checked } };
        if (!body.notice.title || !body.notice.body) { $('nMsg').textContent = 'タイトルと本文を入れてください。'; return; }
        nd.close(); toast('');
        window.RLoading.run(function () {
            return call(body).then(function (res) { if (res && res.ok) return load().then(function () { return res; }); return res; });
        }, {
            text: '保存しています',
            onSuccess: function (res) { if (res && res.ok) toast('お知らせを保存しました。', 'ok'); else toast((res && res.message) || '保存できませんでした。', 'error'); },
            onError: function () { toast('通信できませんでした。「更新」で状態を確かめてから、もう一度お試しください。', 'error'); }
        });
    });

    /* ---- 受講生の詳細・履歴書を読む（読むだけ） ---- */
    var ud = $('dlgUser'), rv = $('dlgResume');
    function ymd(iso) { return iso ? jst(iso, true).split(' ')[0] : '―'; }
    var APP_JA = { awaiting_payment: '入金待ち', paid: '入金済み', issued: '発行済み', expired: '期限切れ', cancelled: 'キャンセル' };
    function showUser(res) {
        var u = res.user;
        var h = '<h2>' + esc(u.name) + '</h2><p class="d-sub">' + esc(u.email) + '</p>' +
            '<dl class="d-list"><dt>状態</dt><dd>' + esc(userState({ status: u.status, expired: u.validUntil && new Date(u.validUntil) < new Date() }).t) + '</dd>' +
            '<dt>利用期限</dt><dd>' + ymd(u.validUntil) + '</dd><dt>アカウント発行</dt><dd>' + ymd(u.activatedAt) + '</dd><dt>最終ログイン</dt><dd>' + jst(u.lastLoginAt, true) + '</dd></dl>' +
            '<h3 class="d-h">履歴書（' + res.resumes.length + '/3）</h3>';
        h += res.resumes.length ? res.resumes.map(function (r) {
            return '<div class="q-row"><div class="q-main"><span class="acard-name">' + esc(r.title) + '</span><span class="acard-meta">更新：' + jst(r.updatedAt, true) + '</span></div>' +
                '<button type="button" class="btn btn-secondary" data-act="rview" data-id="' + esc(r.resumeId) + '">読む</button></div>';
        }).join('') + '<p class="d-note">「読む」を押すと、閲覧の記録が残ります（ViewLog シート）。</p>' : '<p class="empty">履歴書は、まだありません。</p>';
        h += '<h3 class="d-h">申込の履歴</h3>' + (res.applications.length ? res.applications.map(function (a) {
            return '<div class="q-row"><div class="q-main"><span class="acard-name">' + esc(a.applicationId) + '</span><span class="acard-meta">' + yen(a.amount) + '　' + esc(APP_JA[a.status] || a.status) + '　申込：' + ymd(a.createdAt) + (a.issuedAt ? '　発行：' + ymd(a.issuedAt) : '') + '</span></div></div>';
        }).join('') : '<p class="empty">申込は、ありません。</p>');
        $('udBody').innerHTML = h; ud.showModal();
    }
    var RV_HEAD = [['name', '氏名'], ['nameFuri', 'ふりがな'], ['gender', '性別'], ['zip', '郵便番号'], ['addr', '住所'], ['addrFuri', '住所のふりがな'], ['phone', '電話'], ['email', 'メール'],
        ['nationality', '国籍'], ['status', '在留資格'], ['statusExp', '在留期限']];
    var RV_SKIP = { era: 1, showForeign: 1, chatAt: 1, chatTmp: 1, persona: 1, altOn: 1, bY: 1, bM: 1, bD: 1, edu: 1, work: 1, lic: 1, motive: 1, special: 1, wish: 1, altZip: 1, altAddr: 1, altPhone: 1, altEmail: 1 };
    function rvRows(title, rows) {
        if (!rows || !rows.length) return '';
        return '<h3 class="d-h">' + title + '</h3><table class="d-tbl"><tbody>' + rows.map(function (r) {
            return '<tr><td>' + esc(r.y || '') + '</td><td>' + esc(r.m || '') + '</td><td>' + esc(r.t || '') + ' ' + esc(r.k || '') + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    function showResume(res) {
        var r = res.resume, d = r.data || {};
        var h = '<h2>' + esc(r.title) + '</h2><p class="d-sub">' + esc(r.ownerName) + 'さん　更新：' + jst(r.updatedAt, true) + '（読むだけ）</p><dl class="d-list">';
        if (d.bY) h += '<dt>生年月日</dt><dd>' + esc(d.bY) + '年' + esc(d.bM || '') + '月' + esc(d.bD || '') + '日</dd>';
        RV_HEAD.forEach(function (k) { if (d[k[0]]) h += '<dt>' + k[1] + '</dt><dd>' + esc(d[k[0]]) + '</dd>'; });
        if (d.altOn) h += '<dt>連絡先（別）</dt><dd>' + esc([d.altZip, d.altAddr, d.altPhone, d.altEmail].filter(Boolean).join('　')) + '</dd>';
        Object.keys(d).forEach(function (k) {
            if (RV_SKIP[k] || RV_HEAD.some(function (x) { return x[0] === k; })) return;
            if (d[k] === '' || d[k] == null || typeof d[k] === 'object') return;
            h += '<dt>' + esc(k) + '</dt><dd>' + esc(d[k]) + '</dd>';
        });
        h += '</dl>' + rvRows('学歴・職歴', (d.edu || []).concat(d.work || [])) + rvRows('免許・資格', d.lic);
        if (d.motive) h += '<h3 class="d-h">志望の動機</h3><p class="d-text">' + esc(d.motive) + '</p>';
        if (d.special) h += '<h3 class="d-h">特技・アピール</h3><p class="d-text">' + esc(d.special) + '</p>';
        if (d.wish) h += '<h3 class="d-h">本人希望</h3><p class="d-text">' + esc(d.wish) + '</p>';
        if (d.persona && d.persona.industry) h += '<h3 class="d-h">性格診断</h3><p class="d-text">強み：' + esc((d.persona.top || []).join('・')) + '　業種：' + esc(d.persona.industry) + '</p>';
        $('rvBody').innerHTML = h; rv.showModal();
    }
    $('udClose').addEventListener('click', function () { ud.close(); });
    $('rvClose').addEventListener('click', function () { rv.close(); });

    /* ---- 資格の追加・編集 ---- */
    var qd = $('dlgQual'), qEditId = '';
    function openQual(q) {
        qEditId = q ? q.qualId : '';
        $('qTitle').textContent = q ? '資格を編集' : '資格を追加';
        $('qLabel').value = q ? q.label : ''; $('qName').value = q ? q.name : ''; $('qRank').value = q && q.rank != null ? q.rank : '';
        $('qMsg').textContent = ''; qd.showModal();
    }
    $('qAdd').addEventListener('click', function () { openQual(null); });
    $('qNo').addEventListener('click', function () { qd.close(); });
    $('qRank').addEventListener('input', function () { this.value = this.value.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/[^0-9]/g, ''); });
    $('qualForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var body = { action: 'adminQualSave', qual: { qualId: qEditId, label: $('qLabel').value.trim(), name: $('qName').value.trim(), rank: $('qRank').value.trim() } };
        if (!body.qual.label || !body.qual.name) { $('qMsg').textContent = 'ラベルと、履歴書に載る名前を入れてください。'; return; }
        qd.close(); toast('');
        window.RLoading.run(function () {
            return call(body).then(function (res) { if (res && res.ok) return load().then(function () { return res; }); return res; });
        }, {
            text: '保存しています',
            onSuccess: function (res) { if (res && res.ok) toast('資格を保存しました。', 'ok'); else toast((res && res.message) || '保存できませんでした。', 'error'); },
            onError: function () { toast('通信できませんでした。「更新」で状態を確かめてから、もう一度お試しください。', 'error'); }
        });
    });

    document.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-act]') : null;
        if (!b) return;
        var act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
        if (act === 'nedit') { var n1 = notices.filter(function (x) { return x.noticeId === id; })[0]; if (n1) openNotice(n1); return; }
        if (act === 'ndel') {
            var n2 = notices.filter(function (x) { return x.noticeId === id; })[0]; if (!n2) return;
            ask({ title: 'このお知らせを削除しますか？', body: n2.title + '\n\n取り消しはできません。残しておきたいときは、「編集」で「表示する」を外してください。', yes: '削除する', danger: true, body2: { action: 'adminNoticeDelete', noticeId: id }, done: 'お知らせを削除しました。' });
            return;
        }
        if (act === 'udetail' || act === 'rview') {
            var body = act === 'udetail' ? { action: 'adminUserDetail', userId: id } : { action: 'adminResumeView', resumeId: id };
            toast('');
            window.RLoading.run(function () { return call(body); }, {
                text: '読み込んでいます',
                onSuccess: function (res) { if (res && res.ok) { if (act === 'udetail') showUser(res); else showResume(res); } else toast((res && res.message) || '読み込めませんでした。', 'error'); },
                onError: function () { toast('通信できませんでした。時間をおいて、もう一度お試しください。', 'error'); }
            });
            return;
        }
        if (act === 'qedit') { var q1 = quals.filter(function (x) { return x.qualId === id; })[0]; if (q1) openQual(q1); return; }
        if (act === 'qdel') {
            var q2 = quals.filter(function (x) { return x.qualId === id; })[0]; if (!q2) return;
            ask({ title: 'この資格を削除しますか？', body: q2.name + '\n\n一覧から消えます。すでに受講生の履歴書に入っている資格は、そのまま残ります。', yes: '削除する', danger: true, body2: { action: 'adminQualDelete', qualId: id }, done: '資格を削除しました。' });
            return;
        }
        if (act === 'issue' || act === 'cancel') {
            var a = data.applications.filter(function (x) { return x.applicationId === id; })[0]; if (!a) return;
            var who = a.name + '（' + a.email + '）\n申込番号：' + a.applicationId + '\n金額：' + yen(a.amount);
            if (act === 'issue') ask({ title: '入金を確認して発行しますか？', body: who + '\n\n通帳（銀行の入金）で、この金額が入っていることを確かめてから実行してください。実行すると、お客様にメールが届きます。' + (a.status === 'expired' || a.overdue ? '\n\n※ 支払期限を過ぎた申込です。' : ''), yes: '発行する', body2: { action: 'adminIssue', applicationId: id }, done: '発行しました。お客様にメールを送りました。' });
            else ask({ title: 'この申込をキャンセルしますか？', body: who + '\n\n取り消しはできません（お客様は、申し込み直しになります）。お客様へのメールは送りません。', yes: 'キャンセルする', danger: true, reason: true, body2: { action: 'adminCancel', applicationId: id }, done: 'キャンセルしました。' });
        } else if (act === 'suspend' || act === 'resume') {
            var u = data.users.filter(function (x) { return x.userId === id; })[0]; if (!u) return;
            var w = u.name + '（' + u.email + '）';
            if (act === 'suspend') ask({ title: '利用を停止しますか？', body: w + '\n\nログイン中の端末も使えなくなります。あとから「利用を再開」できます。', yes: '停止する', danger: true, body2: { action: 'adminSetUser', userId: id, status: 'suspended' }, done: '利用を停止しました。' });
            else ask({ title: '利用を再開しますか？', body: w, yes: '再開する', body2: { action: 'adminSetUser', userId: id, status: 'active' }, done: '利用を再開しました。' });
        }
    });
})();
