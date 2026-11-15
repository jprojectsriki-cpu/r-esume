/**
 * R-ESUME 管理API（管理者だけが使う）
 * すべての操作で、トークンの持ち主が role = admin であることを確認する
 *  - adminList        申込と受講生の一覧
 *  - adminIssue       入金を確認して、アカウントを発行（利用期限＝発行から1年）
 *  - adminCancel      申込のキャンセル（入金前のものだけ）
 *  - adminSetUser     受講生の利用停止／再開
 */

const LOGIN_URL = 'https://jprojectsriki-cpu.github.io/r-esume/frontend/user/login.html';

/** 管理者か確認する。OKなら { ok: true, user } */
function requireAdmin_(token) {
  const s = checkSession_(token);
  if (!s.ok) return s;
  if (s.user.role !== 'admin') return { ok: false, reason: 'forbidden', message: 'この操作は、管理者だけができます。' };
  return s;
}

function iso_(d) {
  if (!d) return null;
  const t = new Date(d);
  return isNaN(t.getTime()) ? null : t.toISOString();
}
function stamp_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'); }

/** Users シートを全部読む（パスワード関係は含めない） */
function readUsersAll_() {
  const sheet = getSheet_(SHEET_USERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 11).getValues().map(function (r, i) {
    return {
      row: i + 2, userId: String(r[0]), email: String(r[1]), name: String(r[4]), role: String(r[5]),
      status: String(r[6]), validUntil: r[7] || null, createdAt: r[8] || null,
      activatedAt: r[9] || null, lastLoginAt: r[10] || null
    };
  });
}

/** 申込と受講生の一覧 */
function adminList_(token) {
  const g = requireAdmin_(token);
  if (!g.ok) return g;
  const now = Date.now();
  const apps = readApplications_().reverse().map(function (a) {
    const exp = a.expiresAt ? new Date(a.expiresAt).getTime() : 0;
    return {
      applicationId: a.applicationId, userId: a.userId, email: a.email, name: a.name,
      amount: a.amount, status: a.status, note: a.note,
      overdue: a.status === 'awaiting_payment' && exp > 0 && exp < now,
      createdAt: iso_(a.createdAt), expiresAt: iso_(a.expiresAt), paidAt: iso_(a.paidAt),
      issuedAt: iso_(a.issuedAt), cancelledAt: iso_(a.cancelledAt)
    };
  });
  const users = readUsersAll_().filter(function (u) { return u.role !== 'admin'; }).reverse().map(function (u) {
    const vu = u.validUntil ? new Date(u.validUntil).getTime() : 0;
    return {
      userId: u.userId, email: u.email, name: u.name, status: u.status,
      expired: vu > 0 && vu < now,
      validUntil: iso_(u.validUntil), activatedAt: iso_(u.activatedAt), lastLoginAt: iso_(u.lastLoginAt)
    };
  });
  return { ok: true, applications: apps, users: users };
}

/** 入金を確認して、アカウントを発行する */
function adminIssue_(token, applicationId) {
  const g = requireAdmin_(token);
  if (!g.ok) return g;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, message: 'ほかの処理が動いています。少し待ってから、もう一度お試しください。' };
  let a, user, validUntil, renewal = false;
  try {
    a = readApplications_().filter(function (x) { return x.applicationId === applicationId; })[0];
    if (!a) return { ok: false, message: '申込が見つかりません。' };
    if (a.status === 'issued') return { ok: false, message: 'この申込は、すでに発行済みです。' };
    if (a.status === 'cancelled') return { ok: false, message: 'キャンセル済みの申込は発行できません。お客様に、申し込み直してもらってください。' };
    user = readUsersAll_().filter(function (u) { return u.userId === a.userId; })[0];
    if (!user) return { ok: false, message: '申込に対応するアカウントが見つかりません。' };

    renewal = !!user.activatedAt && user.status === 'active';   // すでに発行したことがある＝更新
    const now = new Date();
    // 更新のときは、いまの期限の続きから1年。初めてなら、今日から1年
    const cur = user.validUntil ? new Date(user.validUntil) : null;
    const base = (cur && user.status === 'active' && cur.getTime() > now.getTime()) ? cur : now;
    validUntil = new Date(base.getTime());
    validUntil.setFullYear(validUntil.getFullYear() + 1);

    const us = getSheet_(SHEET_USERS);
    us.getRange(user.row, 7).setValue('active');           // status
    us.getRange(user.row, 8).setValue(validUntil);         // validUntil
    if (!user.activatedAt) us.getRange(user.row, 10).setValue(now);   // activatedAt
    CacheService.getScriptCache().remove('current_' + user.userId);   // 停止中の目印を消す

    const as = getSheet_(SHEET_APPLICATIONS);
    as.getRange(a.row, 8).setValue('issued');
    as.getRange(a.row, 11).setValue(now);                  // paidAt
    as.getRange(a.row, 12).setValue(now);                  // issuedAt
    as.getRange(a.row, 14).setValue((a.note ? a.note + '\n' : '') + '[' + stamp_() + ' 入金確認・アカウント発行（利用期限 ' + Utilities.formatDate(validUntil, 'Asia/Tokyo', 'yyyy/MM/dd') + '）]');
  } finally {
    lock.releaseLock();
  }

  let mailed = true;
  try { sendIssueMail_(user.name, user.email, validUntil, renewal); } catch (err) { console.error(err); mailed = false; }
  return { ok: true, mailed: mailed, validUntil: validUntil.toISOString() };
}

/** お客様への「アカウント発行」メール */
function sendIssueMail_(name, email, validUntil, renewal) {
  const until = Utilities.formatDate(validUntil, 'Asia/Tokyo', 'yyyy年M月d日');
  const untilEn = Utilities.formatDate(validUntil, 'Asia/Tokyo', 'MMM d, yyyy');
  if (renewal) {
    MailApp.sendEmail({
      to: email,
      subject: '【R-ESUME】利用期間を更新しました / Your period of use was renewed',
      name: 'R-ESUME',
      body: [
        name + ' 様',
        '',
        'お支払いを確認し、利用期間を更新しました。',
        '',
        '■ 新しい利用期限',
        until + 'まで',
        '',
        '■ ログイン',
        LOGIN_URL,
        '',
        '----------------------------------------',
        'Dear ' + name + ',',
        '',
        'We have confirmed your payment and renewed your period of use.',
        '',
        '* New expiry date',
        untilEn,
        '',
        '* Log in',
        LOGIN_URL,
        '----------------------------------------',
        'R-ESUME｜留学生向け自動履歴書作成システム'
      ].join('\n')
    });
    return;
  }
  MailApp.sendEmail({
    to: email,
    subject: '【R-ESUME】アカウントを発行しました / Your account is ready',
    name: 'R-ESUME',
    body: [
      name + ' 様',
      '',
      'お支払いを確認し、アカウントを発行しました。',
      '下のページから、お申し込みのときに決めたパスワードでログインしてください。',
      '',
      '■ ログイン',
      LOGIN_URL,
      '',
      '■ ログインのメールアドレス',
      email,
      '',
      '■ 利用期限',
      until + 'まで',
      '',
      '----------------------------------------',
      'Dear ' + name + ',',
      '',
      'We have confirmed your payment and issued your account.',
      'Please log in with the password you set when you applied.',
      '',
      '* Log in',
      LOGIN_URL,
      '',
      '* Email',
      email,
      '',
      '* Valid until',
      untilEn,
      '----------------------------------------',
      'R-ESUME｜留学生向け自動履歴書作成システム'
    ].join('\n')
  });
}

/** 申込のキャンセル（入金前のものだけ） */
function adminCancel_(token, applicationId, reason) {
  const g = requireAdmin_(token);
  if (!g.ok) return g;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, message: 'ほかの処理が動いています。少し待ってから、もう一度お試しください。' };
  try {
    const a = readApplications_().filter(function (x) { return x.applicationId === applicationId; })[0];
    if (!a) return { ok: false, message: '申込が見つかりません。' };
    if (a.status === 'issued') return { ok: false, message: '発行済みの申込は、キャンセルできません。利用をとめるときは、受講生の「利用停止」を使ってください。' };
    if (a.status === 'cancelled') return { ok: false, message: 'この申込は、すでにキャンセル済みです。' };
    const as = getSheet_(SHEET_APPLICATIONS);
    const why = String(reason || '').trim().slice(0, 100);
    as.getRange(a.row, 8).setValue('cancelled');
    as.getRange(a.row, 13).setValue(new Date());
    as.getRange(a.row, 14).setValue((a.note ? a.note + '\n' : '') + '[' + stamp_() + ' キャンセル' + (why ? '：' + why : '') + ']');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** 受講生の利用停止／再開 */
function adminSetUser_(token, userId, status) {
  const g = requireAdmin_(token);
  if (!g.ok) return g;
  if (status !== 'suspended' && status !== 'active') return { ok: false, message: '不明な操作です。' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, message: 'ほかの処理が動いています。少し待ってから、もう一度お試しください。' };
  try {
    const u = readUsersAll_().filter(function (x) { return x.userId === userId; })[0];
    if (!u) return { ok: false, message: '受講生が見つかりません。' };
    if (u.role === 'admin') return { ok: false, message: '管理者のアカウントは、変更できません。' };
    const cache = CacheService.getScriptCache();
    if (status === 'suspended') {
      getSheet_(SHEET_USERS).getRange(u.row, 7).setValue('suspended');
      cache.put('current_' + u.userId, 'suspended', SESSION_TTL_SEC);   // ログイン中の端末も使えなくする
    } else {
      if (!u.validUntil) return { ok: false, message: 'まだ発行していないアカウントは、再開できません。申込から「入金を確認して発行」してください。' };
      getSheet_(SHEET_USERS).getRange(u.row, 7).setValue('active');
      cache.remove('current_' + u.userId);
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
