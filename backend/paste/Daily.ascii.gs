/**
 * R-ESUME \u6bce\u65e5\u306e\u81ea\u52d5\u51e6\u7406\uff08\u6642\u9593\u4e3b\u5c0e\u30c8\u30ea\u30ac\u30fc\u3067\u3001\u6bce\u65e51\u56de\u52d5\u304b\u3059\uff09
 *  1. \u652f\u6255\u671f\u9650\u304c\u904e\u304e\u305f\u300c\u5165\u91d1\u5f85\u3061\u300d\u306e\u7533\u8fbc\u3092\u3001\u300c\u671f\u9650\u5207\u308c\u300d\u306b\u3059\u308b\uff08\u30e1\u30fc\u30eb\u306f\u9001\u3089\u306a\u3044\uff09
 *  2. \u652f\u6255\u671f\u9650\u306e2\u65e5\u524d\u306b\u306a\u3063\u305f\u300c\u5165\u91d1\u5f85\u3061\u300d\u306e\u7533\u8fbc\u306b\u3001\u30ea\u30de\u30a4\u30f3\u30c9\u306e\u30e1\u30fc\u30eb\u30921\u56de\u3060\u3051\u9001\u308b
 * \u624b\u52d5\u3067\u52d5\u304b\u3057\u3066\u3082\u3088\u3044\uff08dailyJob \u3092\u5b9f\u884c \u2192 \u5b9f\u884c\u30ed\u30b0\u306b\u7d50\u679c\u304c\u51fa\u308b\uff09
 */

const REMIND_BEFORE_MS = 2 * 24 * 60 * 60 * 1000;   // \u652f\u6255\u671f\u9650\u306e2\u65e5\u524d

function dailyJob() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('\u307b\u304b\u306e\u51e6\u7406\u304c\u52d5\u3044\u3066\u3044\u308b\u305f\u3081\u3001\u4eca\u56de\u306f\u4f55\u3082\u3057\u307e\u305b\u3093\u3067\u3057\u305f\u3002'); return; }
  let expired = 0, reminded = 0, failed = 0;
  try {
    const now = Date.now();
    const sheet = getSheet_(SHEET_APPLICATIONS);
    readApplications_().forEach(function (a) {
      if (a.status !== 'awaiting_payment') return;
      const exp = a.expiresAt ? new Date(a.expiresAt).getTime() : 0;
      if (!exp) return;
      if (exp < now) {
        sheet.getRange(a.row, 8).setValue('expired');
        sheet.getRange(a.row, 14).setValue((a.note ? a.note + '\n' : '') + '[' + stamp_() + ' \u652f\u6255\u671f\u9650\u304c\u904e\u304e\u305f\u305f\u3081\u3001\u671f\u9650\u5207\u308c]');
        expired++;
        return;
      }
      if (!a.remindedAt && exp - now <= REMIND_BEFORE_MS) {
        try {
          sendRemindMail_(a);
          sheet.getRange(a.row, 15).setValue(new Date());   // remindedAt
          reminded++;
        } catch (err) { console.error(err); failed++; }
      }
    });
  } finally {
    lock.releaseLock();
  }
  Logger.log('\u671f\u9650\u5207\u308c\u306b\u3057\u305f\u7533\u8fbc\uff1a' + expired + ' \u4ef6\uff0f\u30ea\u30de\u30a4\u30f3\u30c9\u3092\u9001\u3063\u305f\u7533\u8fbc\uff1a' + reminded + ' \u4ef6\uff0f\u9001\u308c\u306a\u304b\u3063\u305f\u7533\u8fbc\uff1a' + failed + ' \u4ef6');
}

/** \u652f\u6255\u671f\u9650\u304c\u8fd1\u3044\u304a\u5ba2\u69d8\u3078\u306e\u30e1\u30fc\u30eb */
function sendRemindMail_(a) {
  const deadline = Utilities.formatDate(new Date(a.expiresAt), 'Asia/Tokyo', 'yyyy\u5e74M\u6708d\u65e5 HH:mm');
  const deadlineEn = Utilities.formatDate(new Date(a.expiresAt), 'Asia/Tokyo', 'MMM d, yyyy HH:mm');
  MailApp.sendEmail({
    to: a.email,
    subject: '\u3010R-ESUME\u3011\u304a\u652f\u6255\u3044\u671f\u9650\u304c\u8fd1\u3065\u3044\u3066\u3044\u307e\u3059\uff08' + a.applicationId + '\uff09 / Payment reminder',
    name: 'R-ESUME',
    body: [
      a.name + ' \u69d8',
      '',
      '\u304a\u7533\u3057\u8fbc\u307f\u306e\u304a\u652f\u6255\u3044\u671f\u9650\u304c\u3001\u8fd1\u3065\u3044\u3066\u3044\u307e\u3059\u3002',
      '',
      '\u25a0 \u7533\u8fbc\u756a\u53f7\uff1a' + a.applicationId,
      '\u25a0 \u91d1\u984d\u3000\u3000\uff1a' + yen_(a.amount) + '\uff08\u7a0e\u8fbc\uff09',
      '\u25a0 \u652f\u6255\u671f\u9650\uff1a' + deadline,
      ''
    ].concat(bankLines_(a.applicationId)).concat([
      '',
      '\u3059\u3067\u306b\u304a\u652f\u6255\u3044\u306e\u3068\u304d\u306f\u3001\u3053\u306e\u30e1\u30fc\u30eb\u306f\u6c17\u306b\u3057\u306a\u3044\u3067\u304f\u3060\u3055\u3044\uff08\u5165\u91d1\u306e\u78ba\u8a8d\u306b\u3001\u5c11\u3057\u304a\u6642\u9593\u3092\u3044\u305f\u3060\u304f\u3053\u3068\u304c\u3042\u308a\u307e\u3059\uff09\u3002',
      '\u203b \u652f\u6255\u671f\u9650\u3092\u904e\u304e\u308b\u3068\u3001\u304a\u7533\u3057\u8fbc\u307f\u306f\u81ea\u52d5\u7684\u306b\u53d6\u308a\u6d88\u3055\u308c\u307e\u3059\u3002',
      '',
      '----------------------------------------',
      'Dear ' + a.name + ',',
      '',
      'The payment deadline for your application is coming soon.',
      '* Application No.: ' + a.applicationId,
      '* Amount: ' + yen_(a.amount) + ' (tax included)',
      '* Deadline: ' + deadlineEn + ' (Japan time)',
      'If you have already paid, please ignore this email. It may take a little time for us to confirm your payment.',
      'After the deadline, your application is cancelled automatically.',
      '----------------------------------------',
      'R-ESUME\uff5c\u7559\u5b66\u751f\u5411\u3051\u81ea\u52d5\u5c65\u6b74\u66f8\u4f5c\u6210\u30b7\u30b9\u30c6\u30e0'
    ]).join('\n')
  });
}

/**
 * \u30101\u56de\u3060\u3051\u5b9f\u884c\u3011\u6bce\u65e5\u306e\u81ea\u52d5\u51e6\u7406\u3092\u3001\u6bce\u671d9\u6642\u3054\u308d\uff08\u65e5\u672c\u6642\u9593\uff09\u306b\u52d5\u304b\u3059\u3088\u3046\u767b\u9332\u3059\u308b
 * \u3082\u3046\u4e00\u5ea6\u5b9f\u884c\u3057\u3066\u3082\u3001\u4e8c\u91cd\u306b\u306f\u767b\u9332\u3055\u308c\u306a\u3044
 */
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyJob') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyJob').timeBased().everyDays(1).atHour(9).inTimezone('Asia/Tokyo').create();
  Logger.log('\u767b\u9332\u3057\u307e\u3057\u305f\uff1adailyJob \u3092\u3001\u6bce\u65e59\u6642\u3054\u308d\uff08\u65e5\u672c\u6642\u9593\uff09\u306b\u52d5\u304b\u3057\u307e\u3059\u3002');
}
