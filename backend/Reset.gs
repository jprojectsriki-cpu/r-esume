/**
 * R-ESUME パスワード再設定
 *  - forgot  メールアドレスを受け取り、登録があれば再設定のリンクをメールで送る
 *            （登録があるかどうかは、画面に出さない）
 *  - reset   リンクのトークンと新しいパスワードを受け取り、パスワードを変える
 * トークンはキャッシュに1時間だけ置く（使ったら消す。同じ人の古いリンクは無効にする）
 */

const RESET_TTL_SEC = 60 * 60;            // リンクの有効時間（1時間）
const RESET_LIMIT_PER_EMAIL = 3;          // 同じメールアドレスに、1時間に送れる回数
const RESET_LIMIT_PER_HOUR = 20;          // 全体で、1時間に送れる回数（メールの送信数の上限を守るため）
const RESET_PAGE_URL = 'https://jprojectsriki-cpu.github.io/r-esume/frontend/user/reset.html';

function forgotPassword_(rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return { ok: false, message: 'メールアドレスの形式を確認してください。' };
  }
  const cache = CacheService.getScriptCache();

  const gKey = 'resetglobal_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHH');
  const g = Number(cache.get(gKey) || 0);
  if (g >= RESET_LIMIT_PER_HOUR) {
    return { ok: false, message: 'ただいまメールの送信が集中しています。しばらくしてからもう一度お試しください。' };
  }
  cache.put(gKey, String(g + 1), 3600);

  const eKey = 'resetmail_' + email;
  const e = Number(cache.get(eKey) || 0);
  if (e >= RESET_LIMIT_PER_EMAIL) return { ok: true };   // 何も送らない（回数の上限）。画面は同じ
  cache.put(eKey, String(e + 1), 3600);

  const user = findUserByEmail_(email);
  if (!user || user.status !== 'active') return { ok: true };   // 登録がない・まだ使えない場合も、画面は同じ

  const old = cache.get('resetcur_' + user.userId);
  if (old) cache.remove('reset_' + old);
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('reset_' + token, user.userId, RESET_TTL_SEC);
  cache.put('resetcur_' + user.userId, token, RESET_TTL_SEC);

  try { sendResetMail_(user.name, user.email, token); } catch (err) { console.error(err); }
  return { ok: true };
}

function resetPassword_(rawToken, rawPassword) {
  const token = String(rawToken || '');
  const password = String(rawPassword || '');
  if (password.length < 8 || password.length > 64) {
    return { ok: false, message: 'パスワードは8〜64文字で入力してください。' };
  }
  const invalid = { ok: false, message: 'このリンクは、期限が切れているか、すでに使われています。もう一度、パスワード再設定のメールを送ってください。' };
  const cache = CacheService.getScriptCache();
  const userId = token ? cache.get('reset_' + token) : null;
  if (!userId) return invalid;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, message: 'ただいま混み合っています。少し待ってから、もう一度お試しください。' };
  let user;
  try {
    user = readUsersAll_().filter(function (u) { return u.userId === userId; })[0];
    if (!user || user.status !== 'active') return invalid;
    const salt = generateSalt_();
    getSheet_(SHEET_USERS).getRange(user.row, 3, 1, 2).setValues([[hashPassword_(password, salt), salt]]);   // C：passwordHash、D：salt
    cache.remove('reset_' + token);
    cache.remove('resetcur_' + userId);
    cache.remove('current_' + userId);                          // ログイン中の端末は、ログアウトにする
    cache.remove('loginfail_' + String(user.email).toLowerCase());   // ログインの失敗の数も、リセットする
  } finally {
    lock.releaseLock();
  }
  try { sendResetDoneMail_(user.name, user.email); } catch (err) { console.error(err); }
  return { ok: true };
}

/** リンクがまだ使えるかを確かめる（トークンは消さない）。画面を開いたときに呼ぶ */
function resetCheckToken_(rawToken) {
  const token = String(rawToken || '');
  const invalid = { ok: false, message: 'このリンクは、期限が切れているか、すでに使われています。もう一度、パスワード再設定のメールを送ってください。' };
  const userId = token ? CacheService.getScriptCache().get('reset_' + token) : null;
  if (!userId) return invalid;
  const user = readUsersAll_().filter(function (u) { return u.userId === userId; })[0];
  if (!user || user.status !== 'active') return invalid;
  return { ok: true };
}

function sendResetMail_(name, email, token) {
  const url = RESET_PAGE_URL + '?token=' + token;
  MailApp.sendEmail({
    to: email,
    subject: '【R-ESUME】パスワードの再設定 / Reset your password',
    name: 'R-ESUME',
    body: [
      name + ' 様',
      '',
      'パスワードの再設定のご依頼を受け付けました。',
      '下のページを開いて、新しいパスワードを決めてください。',
      'このページは、1時間だけ使えます。',
      '',
      '■ パスワードの再設定',
      url,
      '',
      '※ このメールに心当たりがない場合は、このメールを破棄してください。パスワードは変わりません。',
      '',
      '----------------------------------------',
      'Dear ' + name + ',',
      '',
      'We received a request to reset your password.',
      'Please open the page below and set a new password.',
      'The page can be used for 1 hour only.',
      '',
      '* Reset your password',
      url,
      '',
      'If you did not request this, please ignore this email. Your password will not change.',
      '----------------------------------------',
      'R-ESUME｜留学生向け自動履歴書作成システム'
    ].join('\n')
  });
}

function sendResetDoneMail_(name, email) {
  MailApp.sendEmail({
    to: email,
    subject: '【R-ESUME】パスワードを変更しました / Your password was changed',
    name: 'R-ESUME',
    body: [
      name + ' 様',
      '',
      'パスワードを変更しました。',
      'ご自身で変更していない場合は、すぐにお問い合わせください。',
      '',
      '----------------------------------------',
      'Dear ' + name + ',',
      '',
      'Your password was changed.',
      'If you did not change it yourself, please contact us right away.',
      '----------------------------------------',
      'R-ESUME｜留学生向け自動履歴書作成システム'
    ].join('\n')
  });
}

/**
 * 【確認用】メールが届かないときの原因しらべ
 * 管理者のメールアドレス（スクリプト プロパティ ADMIN_EMAIL）宛てに、確認用のメールを1通送る
 * 実行したあと、「実行ログ」を見る
 */
function diagnoseForgot() {
  const email = String(PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL') || '').trim().toLowerCase();
  Logger.log('1. ADMIN_EMAIL：' + (email ? '設定あり' : '設定なし'));
  Logger.log('2. 1日に送れるメールの残り：' + MailApp.getRemainingDailyQuota() + ' 通');
  const user = email ? findUserByEmail_(email) : null;
  Logger.log('3. ユーザーが見つかった：' + (user ? 'はい（status = ' + user.status + '）' : 'いいえ'));
  try {
    sendResetMail_('確認用', email, 'TEST');
    Logger.log('4. 確認用のメールを送りました（リンクの中身は見本です。使えません）。受信箱と迷惑メールを確認してください');
  } catch (err) {
    Logger.log('4. メールの送信に失敗：' + err);
  }
  const rl = CacheService.getScriptCache().get('resetmail_' + email);
  Logger.log('5. このメールアドレスへの、この1時間の再設定の回数：' + (rl || 0) + ' / ' + RESET_LIMIT_PER_EMAIL);
}

/**
 * 【テスト用】再設定メールの回数の制限を、いったん解除する
 * （同じメールアドレスには1時間に3回まで、全体では1時間に20回までの制限がある。テストを繰り返すと、この制限にかかる）
 * 登録されているすべてのメールアドレスの回数と、今の時間帯の全体の回数を、0に戻す
 */
function clearResetLimitForTest() {
  const cache = CacheService.getScriptCache();
  let n = 0;
  readUsersAll_().forEach(function (u) {
    cache.remove('resetmail_' + String(u.email).toLowerCase());
    n++;
  });
  cache.remove('resetglobal_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHH'));
  Logger.log(n + ' 件のメールアドレスの回数と、全体の回数を、0に戻しました。');
}
