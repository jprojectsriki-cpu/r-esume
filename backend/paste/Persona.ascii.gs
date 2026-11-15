/**
 * R-ESUME \u6027\u683c\u8a3a\u65ad\u306e\u7d50\u679c\u306e\u4fdd\u5b58\uff08\u30e6\u30fc\u30b6\u30fc\u3054\u3068\u306b1\u3064\uff09
 *  - personaGet   \u81ea\u5206\u306e\u8a3a\u65ad\u7d50\u679c\u3092\u8aad\u3080\uff08\u671f\u9650\u5207\u308c\u3067\u3082\u8aad\u3081\u308b\uff09
 *  - personaSave  \u8a3a\u65ad\u7d50\u679c\u3092\u4fdd\u5b58\uff08\u4e0a\u66f8\u304d\u3002\u671f\u9650\u5207\u308c\u306f\u4e0d\u53ef\uff09
 * Persona \u30b7\u30fc\u30c8\u306f\u3001\u306a\u3051\u308c\u3070\u81ea\u52d5\u3067\u4f5c\u308b\uff1auserId, persona(JSON), updatedAt
 */

const SHEET_PERSONA = 'Persona';
const PERSONA_HEADERS = ['userId', 'persona', 'updatedAt'];

function personaSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_PERSONA);
  if (!sh) {
    sh = ss.insertSheet(SHEET_PERSONA);
    sh.getRange(1, 1, 1, PERSONA_HEADERS.length).setValues([PERSONA_HEADERS]).setFontWeight('bold').setBackground('#ffe66d');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), 1).setNumberFormat('@');
  }
  return sh;
}

function findPersonaRow_(userId) {
  const sh = personaSheet_();
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) { if (String(ids[i][0]) === userId) return i + 2; }
  return 0;
}

function personaGet_(token) {
  const a = resumeAuth_(token, false);
  if (!a.ok) return a;
  const row = findPersonaRow_(a.userId);
  if (!row) return { ok: true, persona: null };
  let p = null;
  try { p = JSON.parse(String(personaSheet_().getRange(row, 2).getValue() || 'null')); } catch (e) { p = null; }
  return { ok: true, persona: p };
}

function personaSave_(token, persona) {
  const a = resumeAuth_(token, true);
  if (!a.ok) return a;
  if (!persona || typeof persona !== 'object' || Array.isArray(persona)) return { ok: false, message: '\u8a3a\u65ad\u306e\u7d50\u679c\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002' };
  const text = JSON.stringify(persona);
  if (text.length > 6000) return { ok: false, message: '\u8a3a\u65ad\u306e\u7d50\u679c\u304c\u5927\u304d\u3059\u304e\u307e\u3059\u3002' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = personaSheet_();
    let row = findPersonaRow_(a.userId);
    if (!row) row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, 3).setValues([[a.userId, text, new Date()]]);
  } finally { lock.releaseLock(); }
  return { ok: true };
}
