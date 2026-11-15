/**
 * R-ESUME 性格診断の結果の保存（ユーザーごとに1つ）
 *  - personaGet   自分の診断結果を読む（期限切れでも読める）
 *  - personaSave  診断結果を保存（上書き。期限切れは不可）
 * Persona シートは、なければ自動で作る：userId, persona(JSON), updatedAt
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
  if (!persona || typeof persona !== 'object' || Array.isArray(persona)) return { ok: false, message: '診断の結果が正しくありません。' };
  const text = JSON.stringify(persona);
  if (text.length > 6000) return { ok: false, message: '診断の結果が大きすぎます。' };
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
