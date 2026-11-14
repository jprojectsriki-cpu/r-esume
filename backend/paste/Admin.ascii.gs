/**
 * R-ESUME \u7ba1\u7406API\uff08\u7ba1\u7406\u8005\u3060\u3051\u304c\u4f7f\u3046\uff09
 * \u3059\u3079\u3066\u306e\u64cd\u4f5c\u3067\u3001\u30c8\u30fc\u30af\u30f3\u306e\u6301\u3061\u4e3b\u304c role = admin \u3067\u3042\u308b\u3053\u3068\u3092\u78ba\u8a8d\u3059\u308b
 *  - adminList        \u7533\u8fbc\u3068\u53d7\u8b1b\u751f\u306e\u4e00\u89a7
 *  - adminIssue       \u5165\u91d1\u3092\u78ba\u8a8d\u3057\u3066\u3001\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u767a\u884c\uff08\u5229\u7528\u671f\u9650\uff1d\u767a\u884c\u304b\u30891\u5e74\uff09
 *  - adminCancel      \u7533\u8fbc\u306e\u30ad\u30e3\u30f3\u30bb\u30eb\uff08\u5165\u91d1\u524d\u306e\u3082\u306e\u3060\u3051\uff09
 *  - adminSetUser     \u53d7\u8b1b\u751f\u306e\u5229\u7528\u505c\u6b62\uff0f\u518d\u958b
 */

const LOGIN_URL = 'https://jprojectsriki-cpu.github.io/r-esume/frontend/user/login.html';

/** \u7ba1\u7406\u8005\u304b\u78ba\u8a8d\u3059\u308b\u3002OK\u306a\u3089 { ok: true, user } */
function requireAdmin_(token) {
  const s = checkSession_(token);
  if (!s.ok) return s;
  if (s.user.role !== 'admin') return { ok: false, reason: 'forbidden', message: '\u3053\u306e\u64cd\u4f5c\u306f\u3001\u7ba1\u7406\u8005\u3060\u3051\u304c\u3067\u304d\u307e\u3059\u3002' };
  return s;
}

function iso_(d) {
  if (!d) return null;
  const t = new Date(d);
  return isNaN(t.getTime()) ? null : t.toISOString();
}
function stamp_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'); }

/** Users \u30b7\u30fc\u30c8\u3092\u5168\u90e8\u8aad\u3080\uff08\u30d1\u30b9\u30ef\u30fc\u30c9\u95a2\u4fc2\u306f\u542b\u3081\u306a\u3044\uff09 */
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

/** \u7533\u8fbc\u3068\u53d7\u8b1b\u751f\u306e\u4e00\u89a7 */
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

/** \u5165\u91d1\u3092\u78ba\u8a8d\u3057\u3066\u3001\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u767a\u884c\u3059\u308b */
function adminIssue_(token, applicationId) {
  const g = requireAdmin_(token);
  if (!g.ok) return g;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, message: '\u307b\u304b\u306e\u51e6\u7406\u304c\u52d5\u3044\u3066\u3044\u307e\u3059\u3002\u5c11\u3057\u5f85\u3063\u3066\u304b\u3089\u3001\u3082\u3046\u4e00\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002' };
  let a, user, validUntil;
  try {
    a = readApplications_().filter(function (x) { return x.applicationId === applicationId; })[0];
    if (!a) return { ok: false, message: '\u7533\u8fbc\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002' };
    if (a.status === 'issued') return { ok: false, message: '\u3053\u306e\u7533\u8fbc\u306f\u3001\u3059\u3067\u306b\u767a\u884c\u6e08\u307f\u3067\u3059\u3002' };
    if (a.status === 'cancelled') return { ok: false, message: '\u30ad\u30e3\u30f3\u30bb\u30eb\u6e08\u307f\u306e\u7533\u8fbc\u306f\u767a\u884c\u3067\u304d\u307e\u305b\u3093\u3002\u304a\u5ba2\u69d8\u306b\u3001\u7533\u3057\u8fbc\u307f\u76f4\u3057\u3066\u3082\u3089\u3063\u3066\u304f\u3060\u3055\u3044\u3002' };
    user = readUsersAll_().filter(function (u) { return u.userId === a.userId; })[0];
    if (!user) return { ok: false, message: '\u7533\u8fbc\u306b\u5bfe\u5fdc\u3059\u308b\u30a2\u30ab\u30a6\u30f3\u30c8\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002' };

    const now = new Date();
    // \u66f4\u65b0\u306e\u3068\u304d\u306f\u3001\u3044\u307e\u306e\u671f\u9650\u306e\u7d9a\u304d\u304b\u30891\u5e74\u3002\u521d\u3081\u3066\u306a\u3089\u3001\u4eca\u65e5\u304b\u30891\u5e74
    const cur = user.validUntil ? new Date(user.validUntil) : null;
    const base = (cur && user.status === 'active' && cur.getTime() > now.getTime()) ? cur : now;
    validUntil = new Date(base.getTime());
    validUntil.setFullYear(validUntil.getFullYear() + 1);

    const us = getSheet_(SHEET_USERS);
    us.getRange(user.row, 7).setValue('active');           // status
    us.getRange(user.row, 8).setValue(validUntil);         // validUntil
    if (!user.activatedAt) us.getRange(user.row, 10).setValue(now);   // activatedAt
    CacheService.getScriptCache().remove('current_' + user.userId);   // \u505c\u6b62\u4e2d\u306e\u76ee\u5370\u3092\u6d88\u3059

    const as = getSheet_(SHEET_APPLICATIONS);
    as.getRange(a.row, 8).setValue('issued');
    as.getRange(a.row, 11).setValue(now);                  // paidAt
    as.getRange(a.row, 12).setValue(now);                  // issuedAt
    as.getRange(a.row, 14).setValue((a.note ? a.note + '\n' : '') + '[' + stamp_() + ' \u5165\u91d1\u78ba\u8a8d\u30fb\u30a2\u30ab\u30a6\u30f3\u30c8\u767a\u884c\uff08\u5229\u7528\u671f\u9650 ' + Utilities.formatDate(validUntil, 'Asia/Tokyo', 'yyyy/MM/dd') + '\uff09]');
  } finally {
    lock.releaseLock();
  }

  let mailed = true;
  try { sendIssueMail_(user.name, user.email, validUntil); } catch (err) { console.error(err); mailed = false; }
  return { ok: true, mailed: mailed, validUntil: validUntil.toISOString() };
}

/** \u304a\u5ba2\u69d8\u3078\u306e\u300c\u30a2\u30ab\u30a6\u30f3\u30c8\u767a\u884c\u300d\u30e1\u30fc\u30eb */
function sendIssueMail_(name, email, validUntil) {
  const until = Utilities.formatDate(validUntil, 'Asia/Tokyo', 'yyyy\u5e74M\u6708d\u65e5');
  const untilEn = Utilities.formatDate(validUntil, 'Asia/Tokyo', 'MMM d, yyyy');
  MailApp.sendEmail({
    to: email,
    subject: '\u3010R-ESUME\u3011\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u767a\u884c\u3057\u307e\u3057\u305f / Your account is ready',
    name: 'R-ESUME',
    body: [
      name + ' \u69d8',
      '',
      '\u304a\u652f\u6255\u3044\u3092\u78ba\u8a8d\u3057\u3001\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u767a\u884c\u3057\u307e\u3057\u305f\u3002',
      '\u4e0b\u306e\u30da\u30fc\u30b8\u304b\u3089\u3001\u304a\u7533\u3057\u8fbc\u307f\u306e\u3068\u304d\u306b\u6c7a\u3081\u305f\u30d1\u30b9\u30ef\u30fc\u30c9\u3067\u30ed\u30b0\u30a4\u30f3\u3057\u3066\u304f\u3060\u3055\u3044\u3002',
      '',
      '\u25a0 \u30ed\u30b0\u30a4\u30f3\uff1a' + LOGIN_URL,
      '\u25a0 \u30ed\u30b0\u30a4\u30f3\u306e\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\uff1a' + email,
      '\u25a0 \u5229\u7528\u671f\u9650\uff1a' + until + '\u307e\u3067',
      '',
      '----------------------------------------',
      'Dear ' + name + ',',
      '',
      'We have confirmed your payment and issued your account.',
      'Please log in with the password you set when you applied.',
      '',
      '* Log in: ' + LOGIN_URL,
      '* Email: ' + email,
      '* Valid until: ' + untilEn,
      '----------------------------------------',
      'R-ESUME\uff5c\u7559\u5b66\u751f\u5411\u3051\u81ea\u52d5\u5c65\u6b74\u66f8\u4f5c\u6210\u30b7\u30b9\u30c6\u30e0'
    ].join('\n')
  });
}

/** \u7533\u8fbc\u306e\u30ad\u30e3\u30f3\u30bb\u30eb\uff08\u5165\u91d1\u524d\u306e\u3082\u306e\u3060\u3051\uff09 */
function adminCancel_(token, applicationId, reason) {
  const g = requireAdmin_(token);
  if (!g.ok) return g;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, message: '\u307b\u304b\u306e\u51e6\u7406\u304c\u52d5\u3044\u3066\u3044\u307e\u3059\u3002\u5c11\u3057\u5f85\u3063\u3066\u304b\u3089\u3001\u3082\u3046\u4e00\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002' };
  try {
    const a = readApplications_().filter(function (x) { return x.applicationId === applicationId; })[0];
    if (!a) return { ok: false, message: '\u7533\u8fbc\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002' };
    if (a.status === 'issued') return { ok: false, message: '\u767a\u884c\u6e08\u307f\u306e\u7533\u8fbc\u306f\u3001\u30ad\u30e3\u30f3\u30bb\u30eb\u3067\u304d\u307e\u305b\u3093\u3002\u5229\u7528\u3092\u3068\u3081\u308b\u3068\u304d\u306f\u3001\u53d7\u8b1b\u751f\u306e\u300c\u5229\u7528\u505c\u6b62\u300d\u3092\u4f7f\u3063\u3066\u304f\u3060\u3055\u3044\u3002' };
    if (a.status === 'cancelled') return { ok: false, message: '\u3053\u306e\u7533\u8fbc\u306f\u3001\u3059\u3067\u306b\u30ad\u30e3\u30f3\u30bb\u30eb\u6e08\u307f\u3067\u3059\u3002' };
    const as = getSheet_(SHEET_APPLICATIONS);
    const why = String(reason || '').trim().slice(0, 100);
    as.getRange(a.row, 8).setValue('cancelled');
    as.getRange(a.row, 13).setValue(new Date());
    as.getRange(a.row, 14).setValue((a.note ? a.note + '\n' : '') + '[' + stamp_() + ' \u30ad\u30e3\u30f3\u30bb\u30eb' + (why ? '\uff1a' + why : '') + ']');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** \u53d7\u8b1b\u751f\u306e\u5229\u7528\u505c\u6b62\uff0f\u518d\u958b */
function adminSetUser_(token, userId, status) {
  const g = requireAdmin_(token);
  if (!g.ok) return g;
  if (status !== 'suspended' && status !== 'active') return { ok: false, message: '\u4e0d\u660e\u306a\u64cd\u4f5c\u3067\u3059\u3002' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, message: '\u307b\u304b\u306e\u51e6\u7406\u304c\u52d5\u3044\u3066\u3044\u307e\u3059\u3002\u5c11\u3057\u5f85\u3063\u3066\u304b\u3089\u3001\u3082\u3046\u4e00\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002' };
  try {
    const u = readUsersAll_().filter(function (x) { return x.userId === userId; })[0];
    if (!u) return { ok: false, message: '\u53d7\u8b1b\u751f\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002' };
    if (u.role === 'admin') return { ok: false, message: '\u7ba1\u7406\u8005\u306e\u30a2\u30ab\u30a6\u30f3\u30c8\u306f\u3001\u5909\u66f4\u3067\u304d\u307e\u305b\u3093\u3002' };
    const cache = CacheService.getScriptCache();
    if (status === 'suspended') {
      getSheet_(SHEET_USERS).getRange(u.row, 7).setValue('suspended');
      cache.put('current_' + u.userId, 'suspended', SESSION_TTL_SEC);   // \u30ed\u30b0\u30a4\u30f3\u4e2d\u306e\u7aef\u672b\u3082\u4f7f\u3048\u306a\u304f\u3059\u308b
    } else {
      if (!u.validUntil) return { ok: false, message: '\u307e\u3060\u767a\u884c\u3057\u3066\u3044\u306a\u3044\u30a2\u30ab\u30a6\u30f3\u30c8\u306f\u3001\u518d\u958b\u3067\u304d\u307e\u305b\u3093\u3002\u7533\u8fbc\u304b\u3089\u300c\u5165\u91d1\u3092\u78ba\u8a8d\u3057\u3066\u767a\u884c\u300d\u3057\u3066\u304f\u3060\u3055\u3044\u3002' };
      getSheet_(SHEET_USERS).getRange(u.row, 7).setValue('active');
      cache.remove('current_' + u.userId);
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
