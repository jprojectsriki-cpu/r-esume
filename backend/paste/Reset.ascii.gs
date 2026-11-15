/**
 * R-ESUME \u30d1\u30b9\u30ef\u30fc\u30c9\u518d\u8a2d\u5b9a
 *  - forgot  \u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\u3092\u53d7\u3051\u53d6\u308a\u3001\u767b\u9332\u304c\u3042\u308c\u3070\u518d\u8a2d\u5b9a\u306e\u30ea\u30f3\u30af\u3092\u30e1\u30fc\u30eb\u3067\u9001\u308b
 *            \uff08\u767b\u9332\u304c\u3042\u308b\u304b\u3069\u3046\u304b\u306f\u3001\u753b\u9762\u306b\u51fa\u3055\u306a\u3044\uff09
 *  - reset   \u30ea\u30f3\u30af\u306e\u30c8\u30fc\u30af\u30f3\u3068\u65b0\u3057\u3044\u30d1\u30b9\u30ef\u30fc\u30c9\u3092\u53d7\u3051\u53d6\u308a\u3001\u30d1\u30b9\u30ef\u30fc\u30c9\u3092\u5909\u3048\u308b
 * \u30c8\u30fc\u30af\u30f3\u306f\u30ad\u30e3\u30c3\u30b7\u30e5\u306b1\u6642\u9593\u3060\u3051\u7f6e\u304f\uff08\u4f7f\u3063\u305f\u3089\u6d88\u3059\u3002\u540c\u3058\u4eba\u306e\u53e4\u3044\u30ea\u30f3\u30af\u306f\u7121\u52b9\u306b\u3059\u308b\uff09
 */

const RESET_TTL_SEC = 60 * 60;            // \u30ea\u30f3\u30af\u306e\u6709\u52b9\u6642\u9593\uff081\u6642\u9593\uff09
const RESET_LIMIT_PER_EMAIL = 3;          // \u540c\u3058\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\u306b\u30011\u6642\u9593\u306b\u9001\u308c\u308b\u56de\u6570
const RESET_LIMIT_PER_HOUR = 20;          // \u5168\u4f53\u3067\u30011\u6642\u9593\u306b\u9001\u308c\u308b\u56de\u6570\uff08\u30e1\u30fc\u30eb\u306e\u9001\u4fe1\u6570\u306e\u4e0a\u9650\u3092\u5b88\u308b\u305f\u3081\uff09
const RESET_PAGE_URL = 'https://jprojectsriki-cpu.github.io/r-esume/frontend/user/reset.html';

function forgotPassword_(rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return { ok: false, message: '\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\u306e\u5f62\u5f0f\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002' };
  }
  const cache = CacheService.getScriptCache();

  const gKey = 'resetglobal_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHH');
  const g = Number(cache.get(gKey) || 0);
  if (g >= RESET_LIMIT_PER_HOUR) {
    return { ok: false, message: '\u305f\u3060\u3044\u307e\u30e1\u30fc\u30eb\u306e\u9001\u4fe1\u304c\u96c6\u4e2d\u3057\u3066\u3044\u307e\u3059\u3002\u3057\u3070\u3089\u304f\u3057\u3066\u304b\u3089\u3082\u3046\u4e00\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002' };
  }
  cache.put(gKey, String(g + 1), 3600);

  const eKey = 'resetmail_' + email;
  const e = Number(cache.get(eKey) || 0);
  if (e >= RESET_LIMIT_PER_EMAIL) return { ok: true };   // \u4f55\u3082\u9001\u3089\u306a\u3044\uff08\u56de\u6570\u306e\u4e0a\u9650\uff09\u3002\u753b\u9762\u306f\u540c\u3058
  cache.put(eKey, String(e + 1), 3600);

  const user = findUserByEmail_(email);
  if (!user || user.status !== 'active') return { ok: true };   // \u767b\u9332\u304c\u306a\u3044\u30fb\u307e\u3060\u4f7f\u3048\u306a\u3044\u5834\u5408\u3082\u3001\u753b\u9762\u306f\u540c\u3058

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
    return { ok: false, message: '\u30d1\u30b9\u30ef\u30fc\u30c9\u306f8\u301c64\u6587\u5b57\u3067\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002' };
  }
  const invalid = { ok: false, message: '\u3053\u306e\u30ea\u30f3\u30af\u306f\u3001\u671f\u9650\u304c\u5207\u308c\u3066\u3044\u308b\u304b\u3001\u3059\u3067\u306b\u4f7f\u308f\u308c\u3066\u3044\u307e\u3059\u3002\u3082\u3046\u4e00\u5ea6\u3001\u30d1\u30b9\u30ef\u30fc\u30c9\u518d\u8a2d\u5b9a\u306e\u30e1\u30fc\u30eb\u3092\u9001\u3063\u3066\u304f\u3060\u3055\u3044\u3002' };
  const cache = CacheService.getScriptCache();
  const userId = token ? cache.get('reset_' + token) : null;
  if (!userId) return invalid;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, message: '\u305f\u3060\u3044\u307e\u6df7\u307f\u5408\u3063\u3066\u3044\u307e\u3059\u3002\u5c11\u3057\u5f85\u3063\u3066\u304b\u3089\u3001\u3082\u3046\u4e00\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002' };
  let user;
  try {
    user = readUsersAll_().filter(function (u) { return u.userId === userId; })[0];
    if (!user || user.status !== 'active') return invalid;
    const salt = generateSalt_();
    getSheet_(SHEET_USERS).getRange(user.row, 3, 1, 2).setValues([[hashPassword_(password, salt), salt]]);   // C\uff1apasswordHash\u3001D\uff1asalt
    cache.remove('reset_' + token);
    cache.remove('resetcur_' + userId);
    cache.remove('current_' + userId);                          // \u30ed\u30b0\u30a4\u30f3\u4e2d\u306e\u7aef\u672b\u306f\u3001\u30ed\u30b0\u30a2\u30a6\u30c8\u306b\u3059\u308b
    cache.remove('loginfail_' + String(user.email).toLowerCase());   // \u30ed\u30b0\u30a4\u30f3\u306e\u5931\u6557\u306e\u6570\u3082\u3001\u30ea\u30bb\u30c3\u30c8\u3059\u308b
  } finally {
    lock.releaseLock();
  }
  try { sendResetDoneMail_(user.name, user.email); } catch (err) { console.error(err); }
  return { ok: true };
}

/** \u30ea\u30f3\u30af\u304c\u307e\u3060\u4f7f\u3048\u308b\u304b\u3092\u78ba\u304b\u3081\u308b\uff08\u30c8\u30fc\u30af\u30f3\u306f\u6d88\u3055\u306a\u3044\uff09\u3002\u753b\u9762\u3092\u958b\u3044\u305f\u3068\u304d\u306b\u547c\u3076 */
function resetCheckToken_(rawToken) {
  const token = String(rawToken || '');
  const invalid = { ok: false, message: '\u3053\u306e\u30ea\u30f3\u30af\u306f\u3001\u671f\u9650\u304c\u5207\u308c\u3066\u3044\u308b\u304b\u3001\u3059\u3067\u306b\u4f7f\u308f\u308c\u3066\u3044\u307e\u3059\u3002\u3082\u3046\u4e00\u5ea6\u3001\u30d1\u30b9\u30ef\u30fc\u30c9\u518d\u8a2d\u5b9a\u306e\u30e1\u30fc\u30eb\u3092\u9001\u3063\u3066\u304f\u3060\u3055\u3044\u3002' };
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
    subject: '\u3010R-ESUME\u3011\u30d1\u30b9\u30ef\u30fc\u30c9\u306e\u518d\u8a2d\u5b9a / Reset your password',
    name: 'R-ESUME',
    body: [
      name + ' \u69d8',
      '',
      '\u30d1\u30b9\u30ef\u30fc\u30c9\u306e\u518d\u8a2d\u5b9a\u306e\u3054\u4f9d\u983c\u3092\u53d7\u3051\u4ed8\u3051\u307e\u3057\u305f\u3002',
      '\u4e0b\u306e\u30da\u30fc\u30b8\u3092\u958b\u3044\u3066\u3001\u65b0\u3057\u3044\u30d1\u30b9\u30ef\u30fc\u30c9\u3092\u6c7a\u3081\u3066\u304f\u3060\u3055\u3044\u3002',
      '\u3053\u306e\u30da\u30fc\u30b8\u306f\u30011\u6642\u9593\u3060\u3051\u4f7f\u3048\u307e\u3059\u3002',
      '',
      '\u25a0 \u30d1\u30b9\u30ef\u30fc\u30c9\u306e\u518d\u8a2d\u5b9a',
      url,
      '',
      '\u203b \u3053\u306e\u30e1\u30fc\u30eb\u306b\u5fc3\u5f53\u305f\u308a\u304c\u306a\u3044\u5834\u5408\u306f\u3001\u3053\u306e\u30e1\u30fc\u30eb\u3092\u7834\u68c4\u3057\u3066\u304f\u3060\u3055\u3044\u3002\u30d1\u30b9\u30ef\u30fc\u30c9\u306f\u5909\u308f\u308a\u307e\u305b\u3093\u3002',
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
      'R-ESUME\uff5c\u7559\u5b66\u751f\u5411\u3051\u81ea\u52d5\u5c65\u6b74\u66f8\u4f5c\u6210\u30b7\u30b9\u30c6\u30e0'
    ].join('\n')
  });
}

function sendResetDoneMail_(name, email) {
  MailApp.sendEmail({
    to: email,
    subject: '\u3010R-ESUME\u3011\u30d1\u30b9\u30ef\u30fc\u30c9\u3092\u5909\u66f4\u3057\u307e\u3057\u305f / Your password was changed',
    name: 'R-ESUME',
    body: [
      name + ' \u69d8',
      '',
      '\u30d1\u30b9\u30ef\u30fc\u30c9\u3092\u5909\u66f4\u3057\u307e\u3057\u305f\u3002',
      '\u3054\u81ea\u8eab\u3067\u5909\u66f4\u3057\u3066\u3044\u306a\u3044\u5834\u5408\u306f\u3001\u3059\u3050\u306b\u304a\u554f\u3044\u5408\u308f\u305b\u304f\u3060\u3055\u3044\u3002',
      '',
      '----------------------------------------',
      'Dear ' + name + ',',
      '',
      'Your password was changed.',
      'If you did not change it yourself, please contact us right away.',
      '----------------------------------------',
      'R-ESUME\uff5c\u7559\u5b66\u751f\u5411\u3051\u81ea\u52d5\u5c65\u6b74\u66f8\u4f5c\u6210\u30b7\u30b9\u30c6\u30e0'
    ].join('\n')
  });
}

/**
 * \u3010\u78ba\u8a8d\u7528\u3011\u30e1\u30fc\u30eb\u304c\u5c4a\u304b\u306a\u3044\u3068\u304d\u306e\u539f\u56e0\u3057\u3089\u3079
 * \u7ba1\u7406\u8005\u306e\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\uff08\u30b9\u30af\u30ea\u30d7\u30c8 \u30d7\u30ed\u30d1\u30c6\u30a3 ADMIN_EMAIL\uff09\u5b9b\u3066\u306b\u3001\u78ba\u8a8d\u7528\u306e\u30e1\u30fc\u30eb\u30921\u901a\u9001\u308b
 * \u5b9f\u884c\u3057\u305f\u3042\u3068\u3001\u300c\u5b9f\u884c\u30ed\u30b0\u300d\u3092\u898b\u308b
 */
function diagnoseForgot() {
  const email = String(PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL') || '').trim().toLowerCase();
  Logger.log('1. ADMIN_EMAIL\uff1a' + (email ? '\u8a2d\u5b9a\u3042\u308a' : '\u8a2d\u5b9a\u306a\u3057'));
  Logger.log('2. 1\u65e5\u306b\u9001\u308c\u308b\u30e1\u30fc\u30eb\u306e\u6b8b\u308a\uff1a' + MailApp.getRemainingDailyQuota() + ' \u901a');
  const user = email ? findUserByEmail_(email) : null;
  Logger.log('3. \u30e6\u30fc\u30b6\u30fc\u304c\u898b\u3064\u304b\u3063\u305f\uff1a' + (user ? '\u306f\u3044\uff08status = ' + user.status + '\uff09' : '\u3044\u3044\u3048'));
  try {
    sendResetMail_('\u78ba\u8a8d\u7528', email, 'TEST');
    Logger.log('4. \u78ba\u8a8d\u7528\u306e\u30e1\u30fc\u30eb\u3092\u9001\u308a\u307e\u3057\u305f\uff08\u30ea\u30f3\u30af\u306e\u4e2d\u8eab\u306f\u898b\u672c\u3067\u3059\u3002\u4f7f\u3048\u307e\u305b\u3093\uff09\u3002\u53d7\u4fe1\u7bb1\u3068\u8ff7\u60d1\u30e1\u30fc\u30eb\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044');
  } catch (err) {
    Logger.log('4. \u30e1\u30fc\u30eb\u306e\u9001\u4fe1\u306b\u5931\u6557\uff1a' + err);
  }
  const rl = CacheService.getScriptCache().get('resetmail_' + email);
  Logger.log('5. \u3053\u306e\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\u3078\u306e\u3001\u3053\u306e1\u6642\u9593\u306e\u518d\u8a2d\u5b9a\u306e\u56de\u6570\uff1a' + (rl || 0) + ' / ' + RESET_LIMIT_PER_EMAIL);
}

/**
 * \u3010\u30c6\u30b9\u30c8\u7528\u3011\u518d\u8a2d\u5b9a\u30e1\u30fc\u30eb\u306e\u56de\u6570\u306e\u5236\u9650\u3092\u3001\u3044\u3063\u305f\u3093\u89e3\u9664\u3059\u308b
 * \uff08\u540c\u3058\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\u306b\u306f1\u6642\u9593\u306b3\u56de\u307e\u3067\u3001\u5168\u4f53\u3067\u306f1\u6642\u9593\u306b20\u56de\u307e\u3067\u306e\u5236\u9650\u304c\u3042\u308b\u3002\u30c6\u30b9\u30c8\u3092\u7e70\u308a\u8fd4\u3059\u3068\u3001\u3053\u306e\u5236\u9650\u306b\u304b\u304b\u308b\uff09
 * \u767b\u9332\u3055\u308c\u3066\u3044\u308b\u3059\u3079\u3066\u306e\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\u306e\u56de\u6570\u3068\u3001\u4eca\u306e\u6642\u9593\u5e2f\u306e\u5168\u4f53\u306e\u56de\u6570\u3092\u30010\u306b\u623b\u3059
 */
function clearResetLimitForTest() {
  const cache = CacheService.getScriptCache();
  let n = 0;
  readUsersAll_().forEach(function (u) {
    cache.remove('resetmail_' + String(u.email).toLowerCase());
    n++;
  });
  cache.remove('resetglobal_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHH'));
  Logger.log(n + ' \u4ef6\u306e\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\u306e\u56de\u6570\u3068\u3001\u5168\u4f53\u306e\u56de\u6570\u3092\u30010\u306b\u623b\u3057\u307e\u3057\u305f\u3002');
}
