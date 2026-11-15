/**
 * R-ESUME 資格の一覧（管理者が登録し、受講生が会話で✔して選ぶ）
 *  - qualList          資格の一覧を読む（ログインしている人なら誰でも）
 *  - adminQualSave     追加・編集（管理者だけ）
 *  - adminQualDelete   削除（管理者だけ）
 * Qualifications シートは、なければ自動で作り、最初の資格を入れる：qualId, label, name, rank, createdAt, updatedAt
 *  label … 選びやすいように分ける見出し（例：ワープロ、Excel、簿記）
 *  name  … 履歴書にそのまま載る名前（例：日本語能力試験 N2 合格）
 *  rank  … 同じ label の中の順位（数字が大きいほど上。同じ label で複数✔したら、高いほうだけ有効）。空なら競合しない
 */

const SHEET_QUALS = 'Qualifications';
const QUAL_HEADERS = ['qualId', 'label', 'name', 'rank', 'createdAt', 'updatedAt'];
const QUAL_SEED = [
  ['日本語能力試験', '日本語能力試験 N5 合格', 1], ['日本語能力試験', '日本語能力試験 N4 合格', 2],
  ['日本語能力試験', '日本語能力試験 N3 合格', 3], ['日本語能力試験', '日本語能力試験 N2 合格', 4],
  ['日本語能力試験', '日本語能力試験 N1 合格', 5],
  ['簿記', '日商簿記検定 3級 合格', 1], ['簿記', '日商簿記検定 2級 合格', 2], ['簿記', '日商簿記検定 1級 合格', 3],
  ['運転免許', '普通自動車第一種運転免許 取得', '']
];

function qualsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_QUALS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_QUALS);
    sh.getRange(1, 1, 1, QUAL_HEADERS.length).setValues([QUAL_HEADERS]).setFontWeight('bold').setBackground('#ffe66d');
    sh.setFrozenRows(1);
    [1, 2, 3].forEach(function (c) { sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'); });
    const now = new Date();
    const rows = QUAL_SEED.map(function (q) { return [newQualId_(), q[0], q[1], q[2], now, now]; });
    sh.getRange(2, 1, rows.length, QUAL_HEADERS.length).setValues(rows);
  }
  return sh;
}
function newQualId_() { return 'Q-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8); }

function readQuals_() {
  const sh = qualsSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 4).getValues().map(function (r, i) {
    const rk = r[3] === '' || r[3] === null ? null : Number(r[3]);
    return { row: i + 2, qualId: String(r[0]), label: String(r[1]), name: String(r[2]), rank: isNaN(rk) ? null : rk };
  }).filter(function (q) { return q.qualId && q.name; });
}

function qualList_(token) {
  const s = checkSession_(token);
  if (!s.ok) return s;
  return { ok: true, quals: readQuals_().map(function (q) { return { qualId: q.qualId, label: q.label, name: q.name, rank: q.rank }; }) };
}

function adminQualSave_(token, q) {
  const g = requireAdmin_(token);
  if (!g.ok) return g;
  q = q || {};
  const label = String(q.label || '').trim(), name = String(q.name || '').trim();
  if (!label || label.length > 30) return { ok: false, message: '見出し（ラベル）は、1〜30文字で入れてください。' };
  if (!name || name.length > 30) return { ok: false, message: '履歴書に載る名前は、1〜30文字で入れてください。' };
  let rank = '';
  if (q.rank !== '' && q.rank != null) {
    const n = Math.floor(Number(q.rank));
    if (isNaN(n) || n < 1 || n > 99) return { ok: false, message: '順位は、1〜99の数字で入れてください（空でもかまいません）。' };
    rank = n;
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = qualsSheet_();
    const all = readQuals_();
    const id = String(q.qualId || '');
    if (id) {
      const cur = all.filter(function (x) { return x.qualId === id; })[0];
      if (!cur) return { ok: false, message: 'この資格は、見つかりませんでした。「更新」を押してください。' };
      sh.getRange(cur.row, 2, 1, 3).setValues([[label, name, rank]]);
      sh.getRange(cur.row, 6).setValue(new Date());
    } else {
      if (all.length >= 300) return { ok: false, message: '登録できる資格は、300件までです。' };
      const now = new Date();
      sh.getRange(sh.getLastRow() + 1, 1, 1, 6).setValues([[newQualId_(), label, name, rank, now, now]]);
    }
  } finally { lock.releaseLock(); }
  return { ok: true };
}

function adminQualDelete_(token, qualId) {
  const g = requireAdmin_(token);
  if (!g.ok) return g;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cur = readQuals_().filter(function (x) { return x.qualId === qualId; })[0];
    if (!cur) return { ok: false, message: 'この資格は、見つかりませんでした。「更新」を押してください。' };
    qualsSheet_().deleteRow(cur.row);
  } finally { lock.releaseLock(); }
  return { ok: true };
}
