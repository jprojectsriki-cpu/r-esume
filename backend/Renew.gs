/**
 * R-ESUME 利用期間の更新（受講生がマイページから申し込む）
 *  - myRenewal  いまの利用期限・更新できるか・受付中の更新の申込を返す
 *  - renew      更新の申込を作る（受付メールを送る）。入金確認と、期限をのばす処理は、管理画面の「入金を確認して発行」
 * 更新の申込は、利用期限の30日前から（期限が過ぎたあとも）できる
 */

const RENEW_WINDOW_DAYS = 30;

/** 自分の利用状況（毎回シートから読む） */
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
  if (!st) return { ok: false, reason: 'expired', message: 'ログインの有効期限が切れました。もう一度ログインしてください。' };
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
  if (!lock.tryLock(20000)) return { ok: false, message: 'ただいま混み合っています。少し待ってから、もう一度お試しください。' };
  let application, user;
  try {
    const st = renewState_(s.user.userId);
    if (!st) return { ok: false, message: 'アカウントが見つかりません。' };
    user = st.user;
    if (user.role === 'admin' || user.status !== 'active') return { ok: false, message: 'このアカウントは、更新のお申し込みができません。' };
    if (st.open) return { ok: false, message: 'すでに更新のお申し込み（' + st.open.applicationId + '）があります。受付メールに書かれた支払期限までにお支払いください。' };
    if (!st.canRenew) return { ok: false, message: 'いまは、更新のお申し込みはできません。利用期限の30日前から、お申し込みできます。' };

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
      '[' + stamp_() + ' 更新のお申し込み]', ''
    ]);
  } finally {
    lock.releaseLock();
  }
  try { sendApplyMails_(user.name, user.email, application); } catch (err) { console.error(err); }
  return { ok: true, applicationId: application.applicationId, expiresAt: application.expiresAt.toISOString() };
}
