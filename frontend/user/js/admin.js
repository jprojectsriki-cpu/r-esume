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

    var data = { applications: [], users: [], quals: [] }, query = '', tab = 'apps', appFilter = 'wait', userFilter = 'all';

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
                '<div class="acard-actions">' + (u.status === 'pending' ? '' : btn) + '</div></article>';
        }).join('');
        $('userEmpty').hidden = shownUsers.length > 0;
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
        $('paneApps').hidden = t !== 'apps'; $('paneUsers').hidden = t !== 'users'; $('paneQuals').hidden = t !== 'quals';
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
    var quals = [];
    function load() {
        return call({ action: 'adminList' }).then(function (res) {
            if (res && res.ok) {
                data = res; data.quals = quals; $('loadError').hidden = true;
                return call({ action: 'qualList' }).then(function (q) { if (q && q.ok) quals = q.quals; data.quals = quals; render(); });
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
