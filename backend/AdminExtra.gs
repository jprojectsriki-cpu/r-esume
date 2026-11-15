/**
 * R-ESUME 管理画面の追加機能（管理者だけ。お知らせの読み取りだけは、ログイン中の誰でも）
 *  - adminUserDetail   受講生の詳細（申込の履歴・履歴書の一覧）
 *  - adminResumeView   履歴書を読む（読むだけ。閲覧記録を ViewLog シートに残す）
 *  - noticeList        ホームに出すお知らせ（表示する設定のものを、新しい順に最大3件）
 *  - adminNoticeList / adminNoticeSave / adminNoticeDelete   お知らせの管理
 * ViewLog：viewedAt, adminUserId, adminName, targetUserId, targetName, resumeId, title
 * Notices：noticeId, title, body, visible(TRUE/FALSE), createdAt, updatedAt
 */

const SHEET_VIEWLOG = 'ViewLog';
const VIEWLOG_HEADERS = ['viewedAt', 'adminUserId', 'adminName', 'targetUserId', 'targetName', 'resumeId', 'title'];
const SHEET_NOTICES = 'Notices';
const NOTICE_HEADERS = ['noticeId', 'title', 'body', 'visible', 'createdAt', 'updatedAt'];

function ensureSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#ffe66d');
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ---------- 受講生の詳細 ---------- */
function adminUserDetail_(token, userId) {
  const g = requireAdmin_(token);
  if (!g.ok) return g;
  const u = readUsersAll_().filter(function (x) { return x.userId === userId && x.role !== 'admin'; })[0];
  if (!u) return { ok: false, message: 'この受講生は、見つかりませんでした。「更新」を押してください。' };
  const apps = readApplications_().filter(function (a) { return a.userId === userId; }).reverse().map(function (a) {
    return { applicationId: a.applicationId, amount: a.amount, status: a.status, createdAt: iso_(a.createdAt), paidAt: iso_(a.paidAt), issuedAt: iso_(a.issuedAt) };
  });
  const resumes = readMyResumes_(userId).map(function (r) {
    return { resumeId: r.resumeId, title: r.title, createdAt: iso_(r.createdAt), updatedAt: iso_(r.updatedAt) };
  });
  return {
    ok: true,
    user: { userId: u.userId, name: u.name, email: u.email, status: u.status, validUntil: iso_(u.validUntil), activatedAt: iso_(u.activatedAt), createdAt: iso_(u.createdAt), lastLoginAt: iso_(u.lastLoginAt) },
    applications: apps, resumes: resumes
  };
}

/* ---------- 履歴書を読む（読むだけ） ---------- */
function adminResumeView_(token, resumeId) {
  const g = requireAdmin_(token);
  if (!g.ok) return g;
  const sh = resumesSheet_();
  const last = sh.getLastRow();
  if (last < 2) return { ok: false, message: 'この履歴書は、見つかりませんでした。' };
  const rows = sh.getRange(2, 1, last - 1, 6).getValues();
  let hit = null;
  rows.forEach(function (r) { if (String(r[0]) === resumeId) hit = r; });
  if (!hit) return { ok: false, message: 'この履歴書は、見つかりませんでした。' };
  const owner = readUsersAll_().filter(function (x) { return x.userId === String(hit[1]); })[0];
  // 閲覧記録（いつ・だれが・どの履歴書を見たか）
  const log = ensureSheet_(SHEET_VIEWLOG, VIEWLOG_HEADERS);
  log.appendRow([new Date(), g.user.userId, g.user.name || '', String(hit[1]), owner ? owner.name : '', resumeId, String(hit[2])]);
  let data = {};
  try { data = JSON.parse(String(hit[3] || '{}')); } catch (e) { data = {}; }
  return { ok: true, resume: { resumeId: resumeId, title: String(hit[2]), ownerName: owner ? owner.name : '', updatedAt: iso_(hit[5]), data: data } };
}

/* ---------- お知らせ ---------- */
function readNotices_() {
  const sh = ensureSheet_(SHEET_NOTICES, NOTICE_HEADERS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 6).getValues().map(function (r, i) {
    return { row: i + 2, noticeId: String(r[0]), title: String(r[1]), body: String(r[2]), visible: String(r[3]).toUpperCase() === 'TRUE', createdAt: r[4], updatedAt: r[5] };
  }).filter(function (n) { return n.noticeId; });
}
function noticeOut_(n) { return { noticeId: n.noticeId, title: n.title, body: n.body, visible: n.visible, createdAt: iso_(n.createdAt), updatedAt: iso_(n.updatedAt) }; }

function noticeList_(token) {
  const s = checkSession_(token);
  if (!s.ok) return s;
  const list = readNotices_().filter(function (n) { return n.visible; })
    .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).slice(0, 3).map(noticeOut_);
  return { ok: true, notices: list };
}
function adminNoticeList_(token) {
  const g = requireAdmin_(token);
  if (!g.ok) return g;
  const list = readNotices_().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).map(noticeOut_);
  return { ok: true, notices: list };
}
function adminNoticeSave_(token, n) {
  const g = requireAdmin_(token);
  if (!g.ok) return g;
  n = n || {};
  const title = String(n.title || '').trim(), body = String(n.body || '').trim();
  if (!title || title.length > 40) return { ok: false, message: 'タイトルは、1〜40文字で入れてください。' };
  if (!body || body.length > 300) return { ok: false, message: '本文は、1〜300文字で入れてください。' };
  const visible = n.visible === true || n.visible === 'true' ? 'TRUE' : 'FALSE';
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = ensureSheet_(SHEET_NOTICES, NOTICE_HEADERS);
    const all = readNotices_();
    const id = String(n.noticeId || '');
    if (id) {
      const cur = all.filter(function (x) { return x.noticeId === id; })[0];
      if (!cur) return { ok: false, message: 'このお知らせは、見つかりませんでした。「更新」を押してください。' };
      sh.getRange(cur.row, 2, 1, 3).setValues([[title, body, visible]]);
      sh.getRange(cur.row, 6).setValue(new Date());
    } else {
      if (all.length >= 100) return { ok: false, message: '登録できるお知らせは、100件までです。古いものを削除してください。' };
      const now = new Date();
      sh.getRange(sh.getLastRow() + 1, 1, 1, 6).setValues([['N-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8), title, body, visible, now, now]]);
    }
  } finally { lock.releaseLock(); }
  return { ok: true };
}
function adminNoticeDelete_(token, noticeId) {
  const g = requireAdmin_(token);
  if (!g.ok) return g;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cur = readNotices_().filter(function (x) { return x.noticeId === noticeId; })[0];
    if (!cur) return { ok: false, message: 'このお知らせは、見つかりませんでした。「更新」を押してください。' };
    ensureSheet_(SHEET_NOTICES, NOTICE_HEADERS).deleteRow(cur.row);
  } finally { lock.releaseLock(); }
  return { ok: true };
}
