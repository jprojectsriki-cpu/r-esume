/**
 * R-ESUME 履歴書の保存（R-9）
 *  - resumeList    自分の履歴書の一覧（期限切れでも見られる）
 *  - resumeGet     1通を読む（期限切れでも見られる）
 *  - resumeCreate  新しく作る／コピーして作る（期限切れは不可・3通まで）
 *  - resumeSave    保存（期限切れは不可）
 *  - resumeDelete  削除（期限切れは不可）
 * Resumes シートは、なければ自動で作る：resumeId, userId, title, data(JSON), createdAt, updatedAt
 */

const SHEET_RESUMES = 'Resumes';
const RESUME_HEADERS = ['resumeId', 'userId', 'title', 'data', 'createdAt', 'updatedAt'];
const MAX_RESUMES = 3;
const MAX_DATA_CHARS = 45000;   // 1つのセルに入る上限（50,000文字）より少し小さく

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

/** 自分の履歴書の行を全部読む */
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

/** ログイン確認＋アカウントの状態。write=true のときは期限切れを止める */
function resumeAuth_(token, write) {
  const s = checkSession_(token);
  if (!s.ok) return s;
  const u = readUsersAll_().filter(function (x) { return x.userId === s.user.userId; })[0];
  if (!u || u.status !== 'active') {
    return { ok: false, reason: 'suspended', message: 'このアカウントは現在ご利用いただけません。' };
  }
  const expired = isExpired_(u.role, u.validUntil);
  if (write && expired) {
    return { ok: false, message: '利用期間が終わっているため、履歴書の作成・編集・印刷はできません。更新するとまた使えます。' };
  }
  return { ok: true, userId: u.userId, expired: expired };
}

function resumeSummary_(r) {
  return { resumeId: r.resumeId, title: r.title, updatedAt: iso_(r.updatedAt), createdAt: iso_(r.createdAt) };
}

function cleanTitle_(t) {
  t = String(t || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 40);
  if (/^[=+\-@]/.test(t)) t = "'" + t;   // 数式として読まれないように
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
  if (!r) return { ok: false, message: '履歴書が見つかりません。' };
  let data = {};
  try { data = JSON.parse(r.data); } catch (e) { data = {}; }
  return { ok: true, expired: a.expired, resume: { resumeId: r.resumeId, title: r.title, data: data, updatedAt: iso_(r.updatedAt) } };
}

/** 新しく作る。copyFrom があれば、その履歴書の中身をコピーする */
function resumeCreate_(token, title, copyFrom) {
  const a = resumeAuth_(token, true);
  if (!a.ok) return a;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, message: 'ただいま混み合っています。少し待ってから、もう一度お試しください。' };
  try {
    const mine = readMyResumes_(a.userId);
    if (mine.length >= MAX_RESUMES) {
      return { ok: false, message: '履歴書は' + MAX_RESUMES + '通まで作れます。いらない履歴書を削除してから、作ってください。' };
    }
    let data = '{}';
    if (copyFrom) {
      const src = mine.filter(function (x) { return x.resumeId === copyFrom; })[0];
      if (!src) return { ok: false, message: '履歴書が見つかりません。' };
      data = src.data;
    }
    const now = new Date();
    const id = 'RS-' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd') + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
    resumesSheet_().appendRow([id, a.userId, cleanTitle_(title) || '無題', data, now, now]);
    return { ok: true, resumeId: id };
  } finally {
    lock.releaseLock();
  }
}

function resumeSave_(token, resumeId, title, data) {
  const a = resumeAuth_(token, true);
  if (!a.ok) return a;
  if (!data || typeof data !== 'object') return { ok: false, message: '保存する内容が正しくありません。' };
  const json = JSON.stringify(data);
  if (json.length > MAX_DATA_CHARS) {
    return { ok: false, message: '入力が多すぎて保存できません。文章を短くしてください。' };
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, message: 'ただいま混み合っています。少し待ってから、もう一度お試しください。' };
  try {
    const r = readMyResumes_(a.userId).filter(function (x) { return x.resumeId === resumeId; })[0];
    if (!r) return { ok: false, message: '履歴書が見つかりません。' };
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
  if (!lock.tryLock(20000)) return { ok: false, message: 'ただいま混み合っています。少し待ってから、もう一度お試しください。' };
  try {
    const r = readMyResumes_(a.userId).filter(function (x) { return x.resumeId === resumeId; })[0];
    if (!r) return { ok: false, message: '履歴書が見つかりません。' };
    resumesSheet_().deleteRow(r.row);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
