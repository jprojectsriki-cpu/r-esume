/**
 * R-ESUME \u5c65\u6b74\u66f8\u306e\u4fdd\u5b58\uff08R-9\uff09
 *  - resumeList    \u81ea\u5206\u306e\u5c65\u6b74\u66f8\u306e\u4e00\u89a7\uff08\u671f\u9650\u5207\u308c\u3067\u3082\u898b\u3089\u308c\u308b\uff09
 *  - resumeGet     1\u901a\u3092\u8aad\u3080\uff08\u671f\u9650\u5207\u308c\u3067\u3082\u898b\u3089\u308c\u308b\uff09
 *  - resumeCreate  \u65b0\u3057\u304f\u4f5c\u308b\uff0f\u30b3\u30d4\u30fc\u3057\u3066\u4f5c\u308b\uff08\u671f\u9650\u5207\u308c\u306f\u4e0d\u53ef\u30fb3\u901a\u307e\u3067\uff09
 *  - resumeSave    \u4fdd\u5b58\uff08\u671f\u9650\u5207\u308c\u306f\u4e0d\u53ef\uff09
 *  - resumeDelete  \u524a\u9664\uff08\u671f\u9650\u5207\u308c\u306f\u4e0d\u53ef\uff09
 * Resumes \u30b7\u30fc\u30c8\u306f\u3001\u306a\u3051\u308c\u3070\u81ea\u52d5\u3067\u4f5c\u308b\uff1aresumeId, userId, title, data(JSON), createdAt, updatedAt
 */

const SHEET_RESUMES = 'Resumes';
const RESUME_HEADERS = ['resumeId', 'userId', 'title', 'data', 'createdAt', 'updatedAt'];
const MAX_RESUMES = 3;
const MAX_DATA_CHARS = 45000;   // 1\u3064\u306e\u30bb\u30eb\u306b\u5165\u308b\u4e0a\u9650\uff0850,000\u6587\u5b57\uff09\u3088\u308a\u5c11\u3057\u5c0f\u3055\u304f

function resumesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_RESUMES);
  if (!sh) {
    sh = ss.insertSheet(SHEET_RESUMES);
    sh.getRange(1, 1, 1, RESUME_HEADERS.length).setValues([RESUME_HEADERS])
      .setFontWeight('bold').setBackground('#ffe66d');
    sh.setFrozenRows(1);
    [1, 2, 3, 4].forEach(function (c) { sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'); });
  }
  return sh;
}

/** \u81ea\u5206\u306e\u5c65\u6b74\u66f8\u306e\u884c\u3092\u5168\u90e8\u8aad\u3080 */
function readMyResumes_(userId) {
  const sh = resumesSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, 6).getValues();
  const out = [];
  rows.forEach(function (r, i) {
    if (String(r[1]) !== userId) return;
    out.push({
      row: i + 2, resumeId: String(r[0]), userId: String(r[1]), title: String(r[2]),
      data: String(r[3] || '{}'), createdAt: r[4], updatedAt: r[5]
    });
  });
  return out;
}

/** \u30ed\u30b0\u30a4\u30f3\u78ba\u8a8d\uff0b\u30a2\u30ab\u30a6\u30f3\u30c8\u306e\u72b6\u614b\u3002write=true \u306e\u3068\u304d\u306f\u671f\u9650\u5207\u308c\u3092\u6b62\u3081\u308b */
function resumeAuth_(token, write) {
  const s = checkSession_(token);
  if (!s.ok) return s;
  const u = readUsersAll_().filter(function (x) { return x.userId === s.user.userId; })[0];
  if (!u || u.status !== 'active') {
    return { ok: false, reason: 'suspended', message: '\u3053\u306e\u30a2\u30ab\u30a6\u30f3\u30c8\u306f\u73fe\u5728\u3054\u5229\u7528\u3044\u305f\u3060\u3051\u307e\u305b\u3093\u3002' };
  }
  const expired = isExpired_(u.role, u.validUntil);
  if (write && expired) {
    return { ok: false, message: '\u5229\u7528\u671f\u9593\u304c\u7d42\u308f\u3063\u3066\u3044\u308b\u305f\u3081\u3001\u5c65\u6b74\u66f8\u306e\u4f5c\u6210\u30fb\u7de8\u96c6\u30fb\u5370\u5237\u306f\u3067\u304d\u307e\u305b\u3093\u3002\u66f4\u65b0\u3059\u308b\u3068\u307e\u305f\u4f7f\u3048\u307e\u3059\u3002' };
  }
  return { ok: true, userId: u.userId, expired: expired };
}

function resumeSummary_(r) {
  return { resumeId: r.resumeId, title: r.title, updatedAt: iso_(r.updatedAt), createdAt: iso_(r.createdAt) };
}

function cleanTitle_(t) {
  t = String(t || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 40);
  if (/^[=+\-@]/.test(t)) t = "'" + t;   // \u6570\u5f0f\u3068\u3057\u3066\u8aad\u307e\u308c\u306a\u3044\u3088\u3046\u306b
  return t;
}

function resumeList_(token) {
  const a = resumeAuth_(token, false);
  if (!a.ok) return a;
  const list = readMyResumes_(a.userId).map(resumeSummary_)
    .sort(function (x, y) { return String(y.updatedAt).localeCompare(String(x.updatedAt)); });
  return { ok: true, expired: a.expired, max: MAX_RESUMES, resumes: list };
}

function resumeGet_(token, resumeId) {
  const a = resumeAuth_(token, false);
  if (!a.ok) return a;
  const r = readMyResumes_(a.userId).filter(function (x) { return x.resumeId === resumeId; })[0];
  if (!r) return { ok: false, message: '\u5c65\u6b74\u66f8\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002' };
  let data = {};
  try { data = JSON.parse(r.data); } catch (e) { data = {}; }
  return { ok: true, expired: a.expired, resume: { resumeId: r.resumeId, title: r.title, data: data, updatedAt: iso_(r.updatedAt) } };
}

/** \u65b0\u3057\u304f\u4f5c\u308b\u3002copyFrom \u304c\u3042\u308c\u3070\u3001\u305d\u306e\u5c65\u6b74\u66f8\u306e\u4e2d\u8eab\u3092\u30b3\u30d4\u30fc\u3059\u308b */
function resumeCreate_(token, title, copyFrom) {
  const a = resumeAuth_(token, true);
  if (!a.ok) return a;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, message: '\u305f\u3060\u3044\u307e\u6df7\u307f\u5408\u3063\u3066\u3044\u307e\u3059\u3002\u5c11\u3057\u5f85\u3063\u3066\u304b\u3089\u3001\u3082\u3046\u4e00\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002' };
  try {
    const mine = readMyResumes_(a.userId);
    if (mine.length >= MAX_RESUMES) {
      return { ok: false, message: '\u5c65\u6b74\u66f8\u306f' + MAX_RESUMES + '\u901a\u307e\u3067\u4f5c\u308c\u307e\u3059\u3002\u3044\u3089\u306a\u3044\u5c65\u6b74\u66f8\u3092\u524a\u9664\u3057\u3066\u304b\u3089\u3001\u4f5c\u3063\u3066\u304f\u3060\u3055\u3044\u3002' };
    }
    let data = '{}';
    if (copyFrom) {
      const src = mine.filter(function (x) { return x.resumeId === copyFrom; })[0];
      if (!src) return { ok: false, message: '\u5c65\u6b74\u66f8\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002' };
      data = src.data;
    }
    const now = new Date();
    const id = 'RS-' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd') + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
    resumesSheet_().appendRow([id, a.userId, cleanTitle_(title) || '\u7121\u984c', data, now, now]);
    return { ok: true, resumeId: id };
  } finally {
    lock.releaseLock();
  }
}

function resumeSave_(token, resumeId, title, data) {
  const a = resumeAuth_(token, true);
  if (!a.ok) return a;
  if (!data || typeof data !== 'object') return { ok: false, message: '\u4fdd\u5b58\u3059\u308b\u5185\u5bb9\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002' };
  const json = JSON.stringify(data);
  if (json.length > MAX_DATA_CHARS) {
    return { ok: false, message: '\u5165\u529b\u304c\u591a\u3059\u304e\u3066\u4fdd\u5b58\u3067\u304d\u307e\u305b\u3093\u3002\u6587\u7ae0\u3092\u77ed\u304f\u3057\u3066\u304f\u3060\u3055\u3044\u3002' };
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, message: '\u305f\u3060\u3044\u307e\u6df7\u307f\u5408\u3063\u3066\u3044\u307e\u3059\u3002\u5c11\u3057\u5f85\u3063\u3066\u304b\u3089\u3001\u3082\u3046\u4e00\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002' };
  try {
    const r = readMyResumes_(a.userId).filter(function (x) { return x.resumeId === resumeId; })[0];
    if (!r) return { ok: false, message: '\u5c65\u6b74\u66f8\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002' };
    const sh = resumesSheet_();
    const now = new Date();
    sh.getRange(r.row, 3, 1, 4).setValues([[cleanTitle_(title) || r.title, json, r.createdAt, now]]);
    return { ok: true, updatedAt: iso_(now) };
  } finally {
    lock.releaseLock();
  }
}

function resumeDelete_(token, resumeId) {
  const a = resumeAuth_(token, true);
  if (!a.ok) return a;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, message: '\u305f\u3060\u3044\u307e\u6df7\u307f\u5408\u3063\u3066\u3044\u307e\u3059\u3002\u5c11\u3057\u5f85\u3063\u3066\u304b\u3089\u3001\u3082\u3046\u4e00\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002' };
  try {
    const r = readMyResumes_(a.userId).filter(function (x) { return x.resumeId === resumeId; })[0];
    if (!r) return { ok: false, message: '\u5c65\u6b74\u66f8\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002' };
    resumesSheet_().deleteRow(r.row);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
