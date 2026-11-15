/**
 * R-ESUME \u5229\u7528\u671f\u9593\u306e\u66f4\u65b0\uff08\u53d7\u8b1b\u751f\u304c\u30de\u30a4\u30da\u30fc\u30b8\u304b\u3089\u7533\u3057\u8fbc\u3080\uff09
 *  - myRenewal  \u3044\u307e\u306e\u5229\u7528\u671f\u9650\u30fb\u66f4\u65b0\u3067\u304d\u308b\u304b\u30fb\u53d7\u4ed8\u4e2d\u306e\u66f4\u65b0\u306e\u7533\u8fbc\u3092\u8fd4\u3059
 *  - renew      \u66f4\u65b0\u306e\u7533\u8fbc\u3092\u4f5c\u308b\uff08\u53d7\u4ed8\u30e1\u30fc\u30eb\u3092\u9001\u308b\uff09\u3002\u5165\u91d1\u78ba\u8a8d\u3068\u3001\u671f\u9650\u3092\u306e\u3070\u3059\u51e6\u7406\u306f\u3001\u7ba1\u7406\u753b\u9762\u306e\u300c\u5165\u91d1\u3092\u78ba\u8a8d\u3057\u3066\u767a\u884c\u300d
 * \u66f4\u65b0\u306e\u7533\u8fbc\u306f\u3001\u5229\u7528\u671f\u9650\u306e30\u65e5\u524d\u304b\u3089\uff08\u671f\u9650\u304c\u904e\u304e\u305f\u3042\u3068\u3082\uff09\u3067\u304d\u308b
 */

const RENEW_WINDOW_DAYS = 30;

/** \u81ea\u5206\u306e\u5229\u7528\u72b6\u6cc1\uff08\u6bce\u56de\u30b7\u30fc\u30c8\u304b\u3089\u8aad\u3080\uff09 */
function renewState_(userId) {
  const u = readUsersAll_().filter(function (x) { return x.userId === userId; })[0];
  if (!u) return null;
  const now = new Date();
  const vu = u.validUntil ? new Date(u.validUntil) : null;
  const expired = !!(vu && vu.getTime() < now.getTime());
  const daysLeft = vu ? Math.ceil((vu.getTime() - now.getTime()) / 86400000) : null;
  const open = readApplications_().filter(function (a) {
    return a.userId === userId && a.status === 'awaiting_payment' && a.expiresAt && new Date(a.expiresAt).getTime() > now.getTime();
  })[0] || null;
  const canRenew = u.role !== 'admin' && u.status === 'active' && !!vu && (expired || daysLeft <= RENEW_WINDOW_DAYS) && !open;
  return { user: u, expired: expired, daysLeft: daysLeft, open: open, canRenew: canRenew };
}

function myRenewal_(token) {
  const s = checkSession_(token);
  if (!s.ok) return s;
  const st = renewState_(s.user.userId);
  if (!st) return { ok: false, reason: 'expired', message: '\u30ed\u30b0\u30a4\u30f3\u306e\u6709\u52b9\u671f\u9650\u304c\u5207\u308c\u307e\u3057\u305f\u3002\u3082\u3046\u4e00\u5ea6\u30ed\u30b0\u30a4\u30f3\u3057\u3066\u304f\u3060\u3055\u3044\u3002' };
  return {
    ok: true,
    role: st.user.role, status: st.user.status,
    validUntil: iso_(st.user.validUntil), expired: st.expired, daysLeft: st.daysLeft,
    canRenew: st.canRenew, amount: PRICE, windowDays: RENEW_WINDOW_DAYS,
    open: st.open ? { applicationId: st.open.applicationId, expiresAt: iso_(st.open.expiresAt) } : null
  };
}

function renew_(token) {
  const s = checkSession_(token);
  if (!s.ok) return s;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, message: '\u305f\u3060\u3044\u307e\u6df7\u307f\u5408\u3063\u3066\u3044\u307e\u3059\u3002\u5c11\u3057\u5f85\u3063\u3066\u304b\u3089\u3001\u3082\u3046\u4e00\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002' };
  let application, user;
  try {
    const st = renewState_(s.user.userId);
    if (!st) return { ok: false, message: '\u30a2\u30ab\u30a6\u30f3\u30c8\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002' };
    user = st.user;
    if (user.role === 'admin' || user.status !== 'active') return { ok: false, message: '\u3053\u306e\u30a2\u30ab\u30a6\u30f3\u30c8\u306f\u3001\u66f4\u65b0\u306e\u304a\u7533\u3057\u8fbc\u307f\u304c\u3067\u304d\u307e\u305b\u3093\u3002' };
    if (st.open) return { ok: false, message: '\u3059\u3067\u306b\u66f4\u65b0\u306e\u304a\u7533\u3057\u8fbc\u307f\uff08' + st.open.applicationId + '\uff09\u304c\u3042\u308a\u307e\u3059\u3002\u53d7\u4ed8\u30e1\u30fc\u30eb\u306b\u66f8\u304b\u308c\u305f\u652f\u6255\u671f\u9650\u307e\u3067\u306b\u304a\u652f\u6255\u3044\u304f\u3060\u3055\u3044\u3002' };
    if (!st.canRenew) return { ok: false, message: '\u3044\u307e\u306f\u3001\u66f4\u65b0\u306e\u304a\u7533\u3057\u8fbc\u307f\u306f\u3067\u304d\u307e\u305b\u3093\u3002\u5229\u7528\u671f\u9650\u306e30\u65e5\u524d\u304b\u3089\u3001\u304a\u7533\u3057\u8fbc\u307f\u3067\u304d\u307e\u3059\u3002' };

    const now = new Date();
    application = {
      applicationId: makeApplicationId_(),
      plan: PLAN_CODE,
      amount: PRICE,
      payment: PAYMENT_DEFAULT,
      expiresAt: new Date(now.getTime() + PAYMENT_DAYS * 24 * 60 * 60 * 1000),
      renewal: true
    };
    getSheet_(SHEET_APPLICATIONS).appendRow([
      application.applicationId, user.userId, user.email, user.name, application.plan, application.amount,
      application.payment, 'awaiting_payment', now, application.expiresAt, '', '', '',
      '[' + stamp_() + ' \u66f4\u65b0\u306e\u304a\u7533\u3057\u8fbc\u307f]', ''
    ]);
  } finally {
    lock.releaseLock();
  }
  try { sendApplyMails_(user.name, user.email, application); } catch (err) { console.error(err); }
  return { ok: true, applicationId: application.applicationId, expiresAt: application.expiresAt.toISOString() };
}
