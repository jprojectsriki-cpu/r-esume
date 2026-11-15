/**
 * R-ESUME 毎日の自動処理（時間主導トリガーで、毎日1回動かす）
 *  1. 支払期限が過ぎた「入金待ち」の申込を、「期限切れ」にする（メールは送らない）
 *  2. 支払期限の2日前になった「入金待ち」の申込に、リマインドのメールを1回だけ送る
 * 手動で動かしてもよい（dailyJob を実行 → 実行ログに結果が出る）
 */

const REMIND_BEFORE_MS = 2 * 24 * 60 * 60 * 1000;   // 支払期限の2日前

function dailyJob() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('ほかの処理が動いているため、今回は何もしませんでした。'); return; }
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
        sheet.getRange(a.row, 14).setValue((a.note ? a.note + '\n' : '') + '[' + stamp_() + ' 支払期限が過ぎたため、期限切れ]');
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
  Logger.log('期限切れにした申込：' + expired + ' 件／リマインドを送った申込：' + reminded + ' 件／送れなかった申込：' + failed + ' 件');
}

/** 支払期限が近いお客様へのメール */
function sendRemindMail_(a) {
  const deadline = Utilities.formatDate(new Date(a.expiresAt), 'Asia/Tokyo', 'yyyy年M月d日 HH:mm');
  const deadlineEn = Utilities.formatDate(new Date(a.expiresAt), 'Asia/Tokyo', 'MMM d, yyyy HH:mm');
  MailApp.sendEmail({
    to: a.email,
    subject: '【R-ESUME】お支払い期限が近づいています（' + a.applicationId + '） / Payment reminder',
    name: 'R-ESUME',
    body: [
      a.name + ' 様',
      '',
      'お申し込みのお支払い期限が、近づいています。',
      '',
      '■ 申込番号：' + a.applicationId,
      '■ 金額　　：' + yen_(a.amount) + '（税込）',
      '■ 支払期限：' + deadline,
      ''
    ].concat(bankLines_(a.applicationId)).concat([
      '',
      'すでにお支払いのときは、このメールは気にしないでください（入金の確認に、少しお時間をいただくことがあります）。',
      '※ 支払期限を過ぎると、お申し込みは自動的に取り消されます。',
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
      'R-ESUME｜留学生向け自動履歴書作成システム'
    ]).join('\n')
  });
}

/**
 * 【1回だけ実行】毎日の自動処理を、毎朝9時ごろ（日本時間）に動かすよう登録する
 * もう一度実行しても、二重には登録されない
 */
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyJob') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyJob').timeBased().everyDays(1).atHour(9).inTimezone('Asia/Tokyo').create();
  Logger.log('登録しました：dailyJob を、毎日9時ごろ（日本時間）に動かします。');
}
