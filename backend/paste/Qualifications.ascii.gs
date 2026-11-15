/**
 * R-ESUME \u8cc7\u683c\u306e\u4e00\u89a7\uff08\u7ba1\u7406\u8005\u304c\u767b\u9332\u3057\u3001\u53d7\u8b1b\u751f\u304c\u4f1a\u8a71\u3067\u2714\u3057\u3066\u9078\u3076\uff09
 *  - qualList          \u8cc7\u683c\u306e\u4e00\u89a7\u3092\u8aad\u3080\uff08\u30ed\u30b0\u30a4\u30f3\u3057\u3066\u3044\u308b\u4eba\u306a\u3089\u8ab0\u3067\u3082\uff09
 *  - adminQualSave     \u8ffd\u52a0\u30fb\u7de8\u96c6\uff08\u7ba1\u7406\u8005\u3060\u3051\uff09
 *  - adminQualDelete   \u524a\u9664\uff08\u7ba1\u7406\u8005\u3060\u3051\uff09
 * Qualifications \u30b7\u30fc\u30c8\u306f\u3001\u306a\u3051\u308c\u3070\u81ea\u52d5\u3067\u4f5c\u308a\u3001\u6700\u521d\u306e\u8cc7\u683c\u3092\u5165\u308c\u308b\uff1aqualId, label, name, rank, createdAt, updatedAt
 *  label \u2026 \u9078\u3073\u3084\u3059\u3044\u3088\u3046\u306b\u5206\u3051\u308b\u898b\u51fa\u3057\uff08\u4f8b\uff1a\u30ef\u30fc\u30d7\u30ed\u3001Excel\u3001\u7c3f\u8a18\uff09
 *  name  \u2026 \u5c65\u6b74\u66f8\u306b\u305d\u306e\u307e\u307e\u8f09\u308b\u540d\u524d\uff08\u4f8b\uff1a\u65e5\u672c\u8a9e\u80fd\u529b\u8a66\u9a13 N2 \u5408\u683c\uff09
 *  rank  \u2026 \u540c\u3058 label \u306e\u4e2d\u306e\u9806\u4f4d\uff08\u6570\u5b57\u304c\u5927\u304d\u3044\u307b\u3069\u4e0a\u3002\u540c\u3058 label \u3067\u8907\u6570\u2714\u3057\u305f\u3089\u3001\u9ad8\u3044\u307b\u3046\u3060\u3051\u6709\u52b9\uff09\u3002\u7a7a\u306a\u3089\u7af6\u5408\u3057\u306a\u3044
 */

const SHEET_QUALS = 'Qualifications';
const QUAL_HEADERS = ['qualId', 'label', 'name', 'rank', 'createdAt', 'updatedAt'];
const QUAL_SEED = [
  ['\u65e5\u672c\u8a9e\u80fd\u529b\u8a66\u9a13', '\u65e5\u672c\u8a9e\u80fd\u529b\u8a66\u9a13 N5 \u5408\u683c', 1], ['\u65e5\u672c\u8a9e\u80fd\u529b\u8a66\u9a13', '\u65e5\u672c\u8a9e\u80fd\u529b\u8a66\u9a13 N4 \u5408\u683c', 2],
  ['\u65e5\u672c\u8a9e\u80fd\u529b\u8a66\u9a13', '\u65e5\u672c\u8a9e\u80fd\u529b\u8a66\u9a13 N3 \u5408\u683c', 3], ['\u65e5\u672c\u8a9e\u80fd\u529b\u8a66\u9a13', '\u65e5\u672c\u8a9e\u80fd\u529b\u8a66\u9a13 N2 \u5408\u683c', 4],
  ['\u65e5\u672c\u8a9e\u80fd\u529b\u8a66\u9a13', '\u65e5\u672c\u8a9e\u80fd\u529b\u8a66\u9a13 N1 \u5408\u683c', 5],
  ['\u7c3f\u8a18', '\u65e5\u5546\u7c3f\u8a18\u691c\u5b9a 3\u7d1a \u5408\u683c', 1], ['\u7c3f\u8a18', '\u65e5\u5546\u7c3f\u8a18\u691c\u5b9a 2\u7d1a \u5408\u683c', 2], ['\u7c3f\u8a18', '\u65e5\u5546\u7c3f\u8a18\u691c\u5b9a 1\u7d1a \u5408\u683c', 3],
  ['\u904b\u8ee2\u514d\u8a31', '\u666e\u901a\u81ea\u52d5\u8eca\u7b2c\u4e00\u7a2e\u904b\u8ee2\u514d\u8a31 \u53d6\u5f97', '']
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
  if (!label || label.length > 30) return { ok: false, message: '\u898b\u51fa\u3057\uff08\u30e9\u30d9\u30eb\uff09\u306f\u30011\u301c30\u6587\u5b57\u3067\u5165\u308c\u3066\u304f\u3060\u3055\u3044\u3002' };
  if (!name || name.length > 30) return { ok: false, message: '\u5c65\u6b74\u66f8\u306b\u8f09\u308b\u540d\u524d\u306f\u30011\u301c30\u6587\u5b57\u3067\u5165\u308c\u3066\u304f\u3060\u3055\u3044\u3002' };
  let rank = '';
  if (q.rank !== '' && q.rank != null) {
    const n = Math.floor(Number(q.rank));
    if (isNaN(n) || n < 1 || n > 99) return { ok: false, message: '\u9806\u4f4d\u306f\u30011\u301c99\u306e\u6570\u5b57\u3067\u5165\u308c\u3066\u304f\u3060\u3055\u3044\uff08\u7a7a\u3067\u3082\u304b\u307e\u3044\u307e\u305b\u3093\uff09\u3002' };
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
      if (!cur) return { ok: false, message: '\u3053\u306e\u8cc7\u683c\u306f\u3001\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u300c\u66f4\u65b0\u300d\u3092\u62bc\u3057\u3066\u304f\u3060\u3055\u3044\u3002' };
      sh.getRange(cur.row, 2, 1, 3).setValues([[label, name, rank]]);
      sh.getRange(cur.row, 6).setValue(new Date());
    } else {
      if (all.length >= 300) return { ok: false, message: '\u767b\u9332\u3067\u304d\u308b\u8cc7\u683c\u306f\u3001300\u4ef6\u307e\u3067\u3067\u3059\u3002' };
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
    if (!cur) return { ok: false, message: '\u3053\u306e\u8cc7\u683c\u306f\u3001\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u300c\u66f4\u65b0\u300d\u3092\u62bc\u3057\u3066\u304f\u3060\u3055\u3044\u3002' };
    qualsSheet_().deleteRow(cur.row);
  } finally { lock.releaseLock(); }
  return { ok: true };
}
