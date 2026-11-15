/**
 * R-ESUME \u7ba1\u7406\u753b\u9762\u306e\u8ffd\u52a0\u6a5f\u80fd\uff08\u7ba1\u7406\u8005\u3060\u3051\u3002\u304a\u77e5\u3089\u305b\u306e\u8aad\u307f\u53d6\u308a\u3060\u3051\u306f\u3001\u30ed\u30b0\u30a4\u30f3\u4e2d\u306e\u8ab0\u3067\u3082\uff09
 *  - adminUserDetail   \u53d7\u8b1b\u751f\u306e\u8a73\u7d30\uff08\u7533\u8fbc\u306e\u5c65\u6b74\u30fb\u5c65\u6b74\u66f8\u306e\u4e00\u89a7\uff09
 *  - adminResumeView   \u5c65\u6b74\u66f8\u3092\u8aad\u3080\uff08\u8aad\u3080\u3060\u3051\u3002\u95b2\u89a7\u8a18\u9332\u3092 ViewLog \u30b7\u30fc\u30c8\u306b\u6b8b\u3059\uff09
 *  - noticeList        \u30db\u30fc\u30e0\u306b\u51fa\u3059\u304a\u77e5\u3089\u305b\uff08\u8868\u793a\u3059\u308b\u8a2d\u5b9a\u306e\u3082\u306e\u3092\u3001\u65b0\u3057\u3044\u9806\u306b\u6700\u59273\u4ef6\uff09
 *  - adminNoticeList / adminNoticeSave / adminNoticeDelete   \u304a\u77e5\u3089\u305b\u306e\u7ba1\u7406
 * ViewLog\uff1aviewedAt, adminUserId, adminName, targetUserId, targetName, resumeId, title
 * Notices\uff1anoticeId, title, body, visible(TRUE/FALSE), createdAt, updatedAt
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

/* ---------- \u53d7\u8b1b\u751f\u306e\u8a73\u7d30 ---------- */
function adminUserDetail_(token, userId) {
  const g = requireAdmin_(token);
  if (!g.ok) return g;
  const u = readUsersAll_().filter(function (x) { return x.userId === userId && x.role !== 'admin'; })[0];
  if (!u) return { ok: false, message: '\u3053\u306e\u53d7\u8b1b\u751f\u306f\u3001\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u300c\u66f4\u65b0\u300d\u3092\u62bc\u3057\u3066\u304f\u3060\u3055\u3044\u3002' };
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

/* ---------- \u5c65\u6b74\u66f8\u3092\u8aad\u3080\uff08\u8aad\u3080\u3060\u3051\uff09 ---------- */
function adminResumeView_(token, resumeId) {
  const g = requireAdmin_(token);
  if (!g.ok) return g;
  const sh = resumesSheet_();
  const last = sh.getLastRow();
  if (last < 2) return { ok: false, message: '\u3053\u306e\u5c65\u6b74\u66f8\u306f\u3001\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002' };
  const rows = sh.getRange(2, 1, last - 1, 6).getValues();
  let hit = null;
  rows.forEach(function (r) { if (String(r[0]) === resumeId) hit = r; });
  if (!hit) return { ok: false, message: '\u3053\u306e\u5c65\u6b74\u66f8\u306f\u3001\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002' };
  const owner = readUsersAll_().filter(function (x) { return x.userId === String(hit[1]); })[0];
  // \u95b2\u89a7\u8a18\u9332\uff08\u3044\u3064\u30fb\u3060\u308c\u304c\u30fb\u3069\u306e\u5c65\u6b74\u66f8\u3092\u898b\u305f\u304b\uff09
  const log = ensureSheet_(SHEET_VIEWLOG, VIEWLOG_HEADERS);
  log.appendRow([new Date(), g.user.userId, g.user.name || '', String(hit[1]), owner ? owner.name : '', resumeId, String(hit[2])]);
  let data = {};
  try { data = JSON.parse(String(hit[3] || '{}')); } catch (e) { data = {}; }
  return { ok: true, resume: { resumeId: resumeId, title: String(hit[2]), ownerName: owner ? owner.name : '', updatedAt: iso_(hit[5]), data: data } };
}

/* ---------- \u304a\u77e5\u3089\u305b ---------- */
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
  if (!title || title.length > 40) return { ok: false, message: '\u30bf\u30a4\u30c8\u30eb\u306f\u30011\u301c40\u6587\u5b57\u3067\u5165\u308c\u3066\u304f\u3060\u3055\u3044\u3002' };
  if (!body || body.length > 300) return { ok: false, message: '\u672c\u6587\u306f\u30011\u301c300\u6587\u5b57\u3067\u5165\u308c\u3066\u304f\u3060\u3055\u3044\u3002' };
  const visible = n.visible === true || n.visible === 'true' ? 'TRUE' : 'FALSE';
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = ensureSheet_(SHEET_NOTICES, NOTICE_HEADERS);
    const all = readNotices_();
    const id = String(n.noticeId || '');
    if (id) {
      const cur = all.filter(function (x) { return x.noticeId === id; })[0];
      if (!cur) return { ok: false, message: '\u3053\u306e\u304a\u77e5\u3089\u305b\u306f\u3001\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u300c\u66f4\u65b0\u300d\u3092\u62bc\u3057\u3066\u304f\u3060\u3055\u3044\u3002' };
      sh.getRange(cur.row, 2, 1, 3).setValues([[title, body, visible]]);
      sh.getRange(cur.row, 6).setValue(new Date());
    } else {
      if (all.length >= 100) return { ok: false, message: '\u767b\u9332\u3067\u304d\u308b\u304a\u77e5\u3089\u305b\u306f\u3001100\u4ef6\u307e\u3067\u3067\u3059\u3002\u53e4\u3044\u3082\u306e\u3092\u524a\u9664\u3057\u3066\u304f\u3060\u3055\u3044\u3002' };
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
    if (!cur) return { ok: false, message: '\u3053\u306e\u304a\u77e5\u3089\u305b\u306f\u3001\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u300c\u66f4\u65b0\u300d\u3092\u62bc\u3057\u3066\u304f\u3060\u3055\u3044\u3002' };
    ensureSheet_(SHEET_NOTICES, NOTICE_HEADERS).deleteRow(cur.row);
  } finally { lock.releaseLock(); }
  return { ok: true };
}
