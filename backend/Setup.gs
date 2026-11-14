/**
 * R-ESUME API - シートの準備（R-1）
 * 【1回だけ実行】setupSheets：Users と Applications の2シートを作り、見出しを入れる。
 * すでに見出しがあるシートは書きかえない（何度実行しても安全）。
 * ※ シート名の定数は、R-2 で作る Code.gs に置く。ここでは名前の重複を避けるため別の名前にしている。
 */

const SETUP_DEFS_ = [
  {
    name: 'Users',
    headers: ['userId', 'email', 'passwordHash', 'salt', 'name', 'role', 'status',
              'validUntil', 'createdAt', 'activatedAt', 'lastLoginAt'],
    textCols: [2, 3, 4, 5],   // email・passwordHash・salt・name を「書式なしテキスト」にする
    lists: { 6: ['admin', 'user'], 7: ['pending', 'active', 'suspended'] }
  },
  {
    name: 'Applications',
    headers: ['applicationId', 'userId', 'email', 'name', 'plan', 'amount', 'paymentMethod', 'status',
              'createdAt', 'expiresAt', 'paidAt', 'issuedAt', 'cancelledAt', 'note', 'remindedAt'],
    textCols: [1, 2, 3, 4, 5, 7, 14],
    lists: { 8: ['awaiting_payment', 'paid', 'issued', 'expired', 'cancelled'] }
  }
];

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const messages = [];

  SETUP_DEFS_.forEach(function (def, idx) {
    let sheet = ss.getSheetByName(def.name);
    if (!sheet) {
      // 最初の1枚だけは、初期の空のシート（シート1）を名前変更して使う
      const first = ss.getSheets()[0];
      if (idx === 0 && ss.getSheets().length === 1 && first.getLastRow() === 0) {
        sheet = first;
        sheet.setName(def.name);
      } else {
        sheet = ss.insertSheet(def.name);
      }
    }

    if (sheet.getLastRow() === 0) {
      const n = def.headers.length;
      sheet.getRange(1, 1, 1, n).setValues([def.headers])
        .setFontWeight('bold').setBackground('#ffe66d');
      sheet.setFrozenRows(1);
      def.textCols.forEach(function (c) { sheet.getRange(1, c, sheet.getMaxRows(), 1).setNumberFormat('@'); });
      Object.keys(def.lists).forEach(function (c) {
        const rule = SpreadsheetApp.newDataValidation()
          .requireValueInList(def.lists[c], true).setAllowInvalid(false).build();
        sheet.getRange(2, Number(c), sheet.getMaxRows() - 1, 1).setDataValidation(rule);
      });
      messages.push(def.name + '：見出しを入れました（' + n + '列）');
    } else {
      messages.push(def.name + '：すでに見出しがあるため、そのままにしました');
    }
  });

  Logger.log(messages.join(' ／ '));
}
