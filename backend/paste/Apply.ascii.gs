/**
 * R-ESUME API - \u7533\u3057\u8fbc\u307f
 * - \u304a\u652f\u6255\u3044\u306f\u9280\u884c\u632f\u8fbc\u3060\u3051\u3002\u632f\u8fbc\u5148\u306f\u3001\u30b9\u30af\u30ea\u30d7\u30c8 \u30d7\u30ed\u30d1\u30c6\u30a3 BANK_INFO \u306b\u5165\u308c\u308b\uff08\u30b3\u30fc\u30c9\u306b\u306f\u66f8\u304b\u306a\u3044\uff09
 * - \u671f\u9650\u5207\u308c\u30fb\u30ad\u30e3\u30f3\u30bb\u30eb\u3067\u300c\u5165\u91d1\u5f85\u3061\u300d\u306e\u307e\u307e\u6b8b\u3063\u305f\u30a2\u30ab\u30a6\u30f3\u30c8\u306f\u3001\u540c\u3058\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\u3067\u7533\u3057\u8fbc\u307f\u76f4\u305b\u308b
 */

// \u6599\u91d1\uff08\u7a0e\u8fbc\u30fb1\u5e74\u9593\u3002\u66f4\u65b0\u3082\u540c\u3058\u6599\u91d1\uff09
const PRICE = 1100;
const PLAN_CODE = 'STD';
// \u304a\u652f\u6255\u3044\u65b9\u6cd5\u306e\u540d\u524d
const PAYMENT_METHODS = { bank_transfer: '\u9280\u884c\u632f\u8fbc' };
const PAYMENT_DEFAULT = 'bank_transfer';
const PAYMENT_DAYS = 7; // \u652f\u6255\u671f\u9650\uff08\u65e5\uff09
const APPLY_LIMIT_PER_HOUR = 30; // 1\u6642\u9593\u306b\u53d7\u3051\u4ed8\u3051\u308b\u7533\u8fbc\u306e\u4e0a\u9650\uff08\u3044\u305f\u305a\u3089\u30fb\u9023\u7d9a\u9001\u4fe1\u306e\u9632\u6b62\uff09

/** \u7533\u8fbc\u756a\u53f7\u3092\u4f5c\u308b\uff08\u4f8b\uff1aRE-20261114-K7Q2\uff09 */
function makeApplicationId_() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // \u898b\u9593\u9055\u3048\u3084\u3059\u3044 O/0/I/1 \u306f\u4f7f\u308f\u306a\u3044
  let rand = '';
  for (let i = 0; i < 4; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
  const date = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
  return 'RE-' + date + '-' + rand;
}

/** Applications \u30b7\u30fc\u30c8\u3092\u8aad\u307f\u8fbc\u3093\u3067\u3001\u30aa\u30d6\u30b8\u30a7\u30af\u30c8\u306e\u914d\u5217\u306b\u3059\u308b */
function readApplications_() {
  const sheet = getSheet_(SHEET_APPLICATIONS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 15).getValues().map(function (r, i) {
    return {
      row: i + 2,
      applicationId: String(r[0]),
      userId: String(r[1]),
      email: String(r[2]),
      name: String(r[3]),
      plan: String(r[4]),
      amount: Number(r[5]),
      paymentMethod: String(r[6]),
      status: String(r[7]),
      createdAt: r[8] || null,
      expiresAt: r[9] || null,
      paidAt: r[10] || null,
      issuedAt: r[11] || null,
      cancelledAt: r[12] || null,
      note: String(r[13] || ''),
      remindedAt: r[14] || null
    };
  });
}

/** \u7533\u3057\u8fbc\u307f\u3092\u53d7\u3051\u4ed8\u3051\u308b */
function apply_(req) {
  // \u30ed\u30dc\u30c3\u30c8\u5bfe\u7b56\uff1a\u898b\u3048\u306a\u3044\u6b04\uff08website\uff09\u306b\u4f55\u304b\u5165\u3063\u3066\u3044\u305f\u3089\u3001\u53d7\u3051\u4ed8\u3051\u305f\u3075\u308a\u3092\u3057\u3066\u4f55\u3082\u3057\u306a\u3044
  if (String(req.website || '').trim()) return { ok: true };

  const name = String(req.name || '').trim();
  const email = String(req.email || '').trim().toLowerCase();
  const password = String(req.password || '');

  // ---- \u5165\u529b\u30c1\u30a7\u30c3\u30af ----
  if (!name || name.length > 50) return { ok: false, message: '\u304a\u540d\u524d\u309250\u6587\u5b57\u4ee5\u5185\u3067\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return { ok: false, message: '\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\u306e\u5f62\u5f0f\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002' };
  }
  if (password.length < 8 || password.length > 64) {
    return { ok: false, message: '\u30d1\u30b9\u30ef\u30fc\u30c9\u306f8\u301c64\u6587\u5b57\u3067\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002' };
  }

  // ---- 1\u6642\u9593\u3042\u305f\u308a\u306e\u4e0a\u9650 ----
  const cache = CacheService.getScriptCache();
  const hourKey = 'applycount_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHH');
  const count = Number(cache.get(hourKey) || 0);
  if (count >= APPLY_LIMIT_PER_HOUR) {
    return { ok: false, message: '\u305f\u3060\u3044\u307e\u304a\u7533\u3057\u8fbc\u307f\u304c\u96c6\u4e2d\u3057\u3066\u3044\u307e\u3059\u3002\u3057\u3070\u3089\u304f\u3057\u3066\u304b\u3089\u3082\u3046\u4e00\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002' };
  }
  cache.put(hourKey, String(count + 1), 3600);

  // ---- \u767b\u9332\uff08\u540c\u6642\u306b\u7533\u3057\u8fbc\u307f\u304c\u6765\u3066\u3082\u91cd\u306a\u3089\u306a\u3044\u3088\u3046\u3001\u9806\u756a\u306b\u51e6\u7406\u3059\u308b\uff09 ----
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let application;
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PAYMENT_DAYS * 24 * 60 * 60 * 1000);
    const salt = generateSalt_();
    let userId;

    const existing = findUserByEmail_(email);
    if (existing) {
      // \u5229\u7528\u4e2d\u30fb\u505c\u6b62\u4e2d\u306e\u30a2\u30ab\u30a6\u30f3\u30c8\u306f\u3001\u65b0\u3057\u304f\u7533\u3057\u8fbc\u3081\u306a\u3044
      if (existing.status !== 'pending') {
        return {
          ok: false,
          message: '\u3053\u306e\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\u306f\u3059\u3067\u306b\u767b\u9332\u3055\u308c\u3066\u3044\u307e\u3059\u3002\u5229\u7528\u671f\u9650\u306e\u66f4\u65b0\u306f\u3001\u30ed\u30b0\u30a4\u30f3\u5f8c\u306e\u30de\u30a4\u30da\u30fc\u30b8\u304b\u3089\u304a\u7533\u3057\u8fbc\u307f\u304f\u3060\u3055\u3044\u3002'
        };
      }

      // \u300c\u5165\u91d1\u5f85\u3061\u300d\u306e\u30a2\u30ab\u30a6\u30f3\u30c8\uff1a\u304a\u652f\u6255\u3044\u5f85\u3061\u306e\u7533\u8fbc\u304c\u307e\u3060\u6709\u52b9\u306a\u3089\u3001\u4e8c\u91cd\u306e\u7533\u3057\u8fbc\u307f\u3092\u9632\u3050
      const apps = readApplications_().filter(function (a) { return a.userId === existing.userId; });
      const open = apps.filter(function (a) {
        if (a.status === 'paid') return true;
        return a.status === 'awaiting_payment' && a.expiresAt && new Date(a.expiresAt).getTime() > now.getTime();
      });
      if (open.length) {
        return {
          ok: false,
          message: '\u3053\u306e\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\u3067\u306f\u3001\u304a\u652f\u6255\u3044\u5f85\u3061\u306e\u304a\u7533\u3057\u8fbc\u307f\uff08' + open[0].applicationId + '\uff09\u304c\u3042\u308a\u307e\u3059\u3002\u53d7\u4ed8\u30e1\u30fc\u30eb\u306b\u66f8\u304b\u308c\u305f\u652f\u6255\u671f\u9650\u307e\u3067\u306b\u304a\u652f\u6255\u3044\u304f\u3060\u3055\u3044\u3002'
        };
      }

      // \u671f\u9650\u304c\u904e\u304e\u305f\u306e\u306b\u3001\u307e\u3060\u300c\u5165\u91d1\u5f85\u3061\u300d\u306e\u307e\u307e\u306e\u7533\u8fbc\u306f\u3001\u3053\u3053\u3067\u300c\u671f\u9650\u5207\u308c\u300d\u306b\u3059\u308b\uff08\u671f\u9650\u5207\u308c\u30e1\u30fc\u30eb\u306f\u9001\u3089\u306a\u3044\uff09
      const appSheet = getSheet_(SHEET_APPLICATIONS);
      const stamp = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
      apps.filter(function (a) { return a.status === 'awaiting_payment'; }).forEach(function (a) {
        appSheet.getRange(a.row, 8).setValue('expired');
        appSheet.getRange(a.row, 14).setValue((a.note ? a.note + '\n' : '') + '[' + stamp + ' \u671f\u9650\u5207\u308c\uff08\u7533\u3057\u8fbc\u307f\u76f4\u3057\u306e\u305f\u3081\uff09]');
      });

      // \u671f\u9650\u5207\u308c\u30fb\u30ad\u30e3\u30f3\u30bb\u30eb\u3067\u6b8b\u3063\u3066\u3044\u305f\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u3001\u65b0\u3057\u3044\u5185\u5bb9\u3067\u4f7f\u3044\u76f4\u3059\uff08C\uff1apasswordHash\u3001D\uff1asalt\u3001E\uff1aname\uff09
      userId = existing.userId;
      getSheet_(SHEET_USERS).getRange(existing.row, 3, 1, 3).setValues([[hashPassword_(password, salt), salt, name]]);
    } else {
      userId = Utilities.getUuid();
      getSheet_(SHEET_USERS).appendRow([
        userId, email, hashPassword_(password, salt), salt, name,
        'user',      // role
        'pending',   // status\uff08\u5165\u91d1\u5f85\u3061\uff09
        '',          // validUntil\uff08\u767a\u884c\u6642\u306b\u5165\u308c\u308b\uff09
        now, '', ''  // createdAt, activatedAt, lastLoginAt
      ]);
    }

    application = {
      applicationId: makeApplicationId_(),
      plan: PLAN_CODE,
      amount: PRICE,
      payment: PAYMENT_DEFAULT,
      expiresAt: expiresAt
    };
    getSheet_(SHEET_APPLICATIONS).appendRow([
      application.applicationId, userId, email, name, application.plan, application.amount,
      application.payment, 'awaiting_payment', now, expiresAt, '', '', '', '', ''
    ]);
  } finally {
    lock.releaseLock();
  }

  sendApplyMails_(name, email, application);

  return {
    ok: true,
    applicationId: application.applicationId,
    expiresAt: application.expiresAt.toISOString()
  };
}

/**
 * \u632f\u8fbc\u5148\u306e\u6848\u5185\uff08\u53d7\u4ed8\u30e1\u30fc\u30eb\u30fb\u30ea\u30de\u30a4\u30f3\u30c9\u30e1\u30fc\u30eb\u3067\u4f7f\u3046\uff09
 * \u632f\u8fbc\u5148\u306f\u3001\u30b9\u30af\u30ea\u30d7\u30c8 \u30d7\u30ed\u30d1\u30c6\u30a3 BANK_INFO\uff08\u4f8b\uff1a\u300c\u3007\u3007\u9280\u884c \u3007\u3007\u652f\u5e97 \u666e\u901a 1234567 \u30ca\u30ab\u30e0\u30e9 \u30ea\u30ad\u300d\uff09
 */
function bankLines_(applicationId) {
  const bank = String(PropertiesService.getScriptProperties().getProperty('BANK_INFO') || '').trim();
  const code = String(applicationId || '').slice(-4);
  if (!bank) return ['\u632f\u8fbc\u5148\u306e\u53e3\u5ea7\u306f\u3001\u8ffd\u3063\u3066\u30e1\u30fc\u30eb\u3067\u304a\u77e5\u3089\u305b\u3057\u307e\u3059\u3002'];
  return [
    '\u25a0 \u632f\u8fbc\u5148\u3000\uff1a' + bank,
    '',
    '\u632f\u8fbc\u540d\u7fa9\uff08\u304a\u540d\u524d\uff09\u306e\u524d\u306b\u3001\u7533\u8fbc\u756a\u53f7\u306e\u6700\u5f8c\u306e4\u6587\u5b57\u300c' + code + '\u300d\u3092\u4ed8\u3051\u3066\u304f\u3060\u3055\u3044\u3002',
    '\uff08\u4f8b\uff1a' + code + ' \u30e4\u30de\u30c0 \u30bf\u30ed\u30a6\uff09',
    '\u632f\u8fbc\u624b\u6570\u6599\u306f\u3001\u304a\u5ba2\u69d8\u306e\u3054\u8ca0\u62c5\u3068\u306a\u308a\u307e\u3059\u3002',
    '',
    '\u3010ATM\u3067\u306e\u632f\u308a\u8fbc\u307f\u65b9\u3011',
    '1. \u9280\u884c\u306eATM\u3067\u300c\u632f\u8fbc\u300d\u3092\u9078\u3073\u307e\u3059\u3002',
    '2. \u4e0a\u306e\u300c\u632f\u8fbc\u5148\u300d\u306e\u9280\u884c\u30fb\u652f\u5e97\u30fb\u53e3\u5ea7\u306e\u7a2e\u985e\uff08\u666e\u901a\uff09\u30fb\u53e3\u5ea7\u756a\u53f7\u3092\u5165\u308c\u307e\u3059\u3002',
    '3. \u91d1\u984d\u3092\u5165\u308c\u307e\u3059\uff08\u4e0a\u306e\u300c\u91d1\u984d\u300d\u3068\u540c\u3058\uff09\u3002',
    '4. \u632f\u8fbc\u540d\u7fa9\uff08\u3042\u306a\u305f\u306e\u540d\u524d\uff09\u306e\u524d\u306b\u300c' + code + '\u300d\u3092\u5165\u308c\u307e\u3059\u3002',
    '5. \u5185\u5bb9\u3092\u78ba\u304b\u3081\u3066\u3001\u304a\u91d1\u3092\u6255\u3044\u307e\u3059\uff08\u73fe\u91d1\u304b\u3001\u30ad\u30e3\u30c3\u30b7\u30e5\u30ab\u30fc\u30c9\uff09\u3002',
    '6. \u660e\u7d30\u66f8\uff08\u30ec\u30b7\u30fc\u30c8\uff09\u306f\u3001\u30a2\u30ab\u30a6\u30f3\u30c8\u304c\u5c4a\u304f\u307e\u3067\u6368\u3066\u306a\u3044\u3067\u304f\u3060\u3055\u3044\u3002',
    '\u203b \u30b3\u30f3\u30d3\u30cb\u306eATM\u306f\u3001\u30ad\u30e3\u30c3\u30b7\u30e5\u30ab\u30fc\u30c9\u304c\u306a\u3044\u3068\u632f\u308a\u8fbc\u3081\u306a\u3044\u3053\u3068\u304c\u3042\u308a\u307e\u3059\u3002\u73fe\u91d1\u306e\u3068\u304d\u306f\u3001\u9280\u884c\u306eATM\u3092\u4f7f\u3063\u3066\u304f\u3060\u3055\u3044\u3002',
    '\u203b \u308f\u304b\u3089\u306a\u3044\u3068\u304d\u306f\u3001\u9280\u884c\u306e\u7a93\u53e3\u3067\u3001\u3053\u306e\u30e1\u30fc\u30eb\u3092\u898b\u305b\u3066\u304f\u3060\u3055\u3044\u3002',
    '',
    '[How to pay at an ATM]',
    '1. At a bank ATM, choose "\u632f\u8fbc" (Transfer).',
    '2. Enter the bank, branch, account type (\u666e\u901a = ordinary) and account number shown in "\u632f\u8fbc\u5148" above.',
    '3. Enter the amount shown in "\u91d1\u984d" above.',
    '4. Before your name (\u632f\u8fbc\u540d\u7fa9), enter "' + code + '". Your name is entered in katakana. Example: ' + code + ' \u30e4\u30de\u30c0 \u30bf\u30ed\u30a6',
    '5. Check the details and pay (cash or cash card).',
    '6. Keep the receipt (\u660e\u7d30\u66f8) until you receive your account email.',
    '* Convenience store ATMs often accept transfers only with a cash card. To pay in cash, please use a bank ATM.',
    '* If you are not sure, show this email to the staff at the bank counter.'
  ];
}

/** \u3010\u78ba\u8a8d\u7528\u3011\u632f\u8fbc\u5148\uff08BANK_INFO\uff09\u304c\u5165\u3063\u3066\u3044\u308b\u304b\u3092\u30ed\u30b0\u306b\u51fa\u3059 */
function checkBankInfo() {
  const bank = PropertiesService.getScriptProperties().getProperty('BANK_INFO');
  Logger.log('BANK_INFO\uff1a' + (bank ? '\u5165\u3063\u3066\u3044\u307e\u3059' : '\u307e\u3060\u3067\u3059\uff08\u30b9\u30af\u30ea\u30d7\u30c8 \u30d7\u30ed\u30d1\u30c6\u30a3\u306b\u5165\u308c\u3066\u304f\u3060\u3055\u3044\uff09'));
  Logger.log(bankLines_('RE-20261114-AB12').join('\n'));
}

/** \u53d7\u4ed8\u30e1\u30fc\u30eb\uff08\u7533\u8fbc\u8005\u3042\u3066\uff09\u3068\u3001\u65b0\u7740\u901a\u77e5\uff08\u7ba1\u7406\u8005\u3042\u3066\uff09\u3092\u9001\u308b */
function sendApplyMails_(name, email, a) {
  const deadline = Utilities.formatDate(a.expiresAt, 'Asia/Tokyo', 'yyyy\u5e74M\u6708d\u65e5 HH:mm');
  const amount = a.amount.toLocaleString('ja-JP');

  MailApp.sendEmail({
    to: email,
    subject: '\u3010R-ESUME\u3011\u304a\u7533\u3057\u8fbc\u307f\u3092\u53d7\u3051\u4ed8\u3051\u307e\u3057\u305f\uff08' + a.applicationId + '\uff09',
    name: 'R-ESUME',
    body: [
      name + ' \u69d8',
      '',
      'R-ESUME \u306b\u304a\u7533\u3057\u8fbc\u307f\u3044\u305f\u3060\u304d\u3001\u3042\u308a\u304c\u3068\u3046\u3054\u3056\u3044\u307e\u3059\u3002',
      '\u4ee5\u4e0b\u306e\u5185\u5bb9\u3067\u304a\u7533\u3057\u8fbc\u307f\u3092\u53d7\u3051\u4ed8\u3051\u307e\u3057\u305f\u3002',
      '',
      '\u25a0 \u7533\u8fbc\u756a\u53f7\uff1a' + a.applicationId,
      '\u25a0 \u30b5\u30fc\u30d3\u30b9\uff1aR-ESUME \u5c65\u6b74\u66f8\u4f5c\u6210\uff081\u5e74\u9593\uff09' + (a.renewal ? '\uff08\u5229\u7528\u671f\u9593\u306e\u66f4\u65b0\uff09' : ''),
      '\u25a0 \u91d1\u984d\u3000\u3000\uff1a' + yen_(amount) + '\uff08\u7a0e\u8fbc\u30fb1\u5e74\u9593\uff09',
      '\u25a0 \u304a\u652f\u6255\u3044\uff1a' + PAYMENT_METHODS[a.payment],
      '\u25a0 \u652f\u6255\u671f\u9650\uff1a' + deadline,
      '',
    ].concat(bankLines_(a.applicationId)).concat([
      '',
      '\u304a\u652f\u6255\u3044\u3092\u78ba\u8a8d\u3057\u305f\u3042\u3068\u3001\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u767a\u884c\u3057\u3066\u30e1\u30fc\u30eb\u3067\u304a\u77e5\u3089\u305b\u3057\u307e\u3059\u3002',
      '\u30ed\u30b0\u30a4\u30f3\u306b\u306f\u3001\u304a\u7533\u3057\u8fbc\u307f\u6642\u306b\u8a2d\u5b9a\u3057\u305f\u30d1\u30b9\u30ef\u30fc\u30c9\u3092\u304a\u4f7f\u3044\u304f\u3060\u3055\u3044\u3002',
      '',
      '\u203b \u652f\u6255\u671f\u9650\u3092\u904e\u304e\u308b\u3068\u3001\u304a\u7533\u3057\u8fbc\u307f\u306f\u81ea\u52d5\u7684\u306b\u53d6\u308a\u6d88\u3055\u308c\u307e\u3059\u3002',
      '\u203b \u3053\u306e\u30e1\u30fc\u30eb\u306b\u5fc3\u5f53\u305f\u308a\u304c\u306a\u3044\u5834\u5408\u306f\u3001\u3053\u306e\u30e1\u30fc\u30eb\u3092\u7834\u68c4\u3057\u3066\u304f\u3060\u3055\u3044\u3002',
      '',
      '----------------------------------------',
      'R-ESUME\uff5c\u7559\u5b66\u751f\u5411\u3051\u81ea\u52d5\u5c65\u6b74\u66f8\u4f5c\u6210\u30b7\u30b9\u30c6\u30e0',
      'https://jprojectsriki-cpu.github.io/r-esume/frontend/user/'
    ]).join('\n')
  });

  const adminEmail = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL');
  if (adminEmail) {
    MailApp.sendEmail({
      to: adminEmail,
      subject: '\u3010R-ESUME\u7ba1\u7406\u3011\u65b0\u3057\u3044\u304a\u7533\u3057\u8fbc\u307f\uff08' + a.applicationId + '\uff09',
      name: 'R-ESUME',
      body: [
        '\u65b0\u3057\u3044\u304a\u7533\u3057\u8fbc\u307f\u304c\u3042\u308a\u307e\u3057\u305f\u3002',
        '',
        '\u7533\u8fbc\u756a\u53f7\uff1a' + a.applicationId,
        '\u304a\u540d\u524d\u3000\uff1a' + name,
        '\u30e1\u30fc\u30eb\u3000\uff1a' + email,
        '\u91d1\u984d\u3000\u3000\uff1a' + yen_(amount),
        '\u304a\u652f\u6255\u3044\uff1a' + PAYMENT_METHODS[a.payment],
        '\u652f\u6255\u671f\u9650\uff1a' + deadline
      ].join('\n')
    });
  }
}

/**
 * \u3010\u30c6\u30b9\u30c8\u7528\u3011\u7533\u8fbc\u306e\u52d5\u4f5c\u78ba\u8a8d
 * \u7ba1\u7406\u8005\u306e\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\u306b\u300c+retest\u300d\u3092\u4ed8\u3051\u305f\u30a2\u30c9\u30ec\u30b9\u3067\u7533\u3057\u8fbc\u3080
 * \uff08Gmail\u306f\u300c\u540d\u524d+\u597d\u304d\u306a\u6587\u5b57@gmail.com\u300d\u5b9b\u306e\u30e1\u30fc\u30eb\u3082\u3001\u672c\u4eba\u306e\u53d7\u4fe1\u7bb1\u306b\u5c4a\u304f\uff09
 */
function testApply() {
  const adminEmail = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL');
  const testEmail = adminEmail.replace('@', '+retest@');

  const res1 = apply_({ name: '\u30c6\u30b9\u30c8 \u592a\u90ce', email: testEmail, password: 'testpass123' });
  Logger.log('\u2460 1\u56de\u76ee\u306e\u7533\u8fbc \u2192 ' + JSON.stringify(res1));

  const res2 = apply_({ name: '\u30c6\u30b9\u30c8 \u592a\u90ce', email: testEmail, password: 'testpass123' });
  Logger.log('\u2461 \u540c\u3058\u30e1\u30fc\u30eb\u30672\u56de\u76ee \u2192 ' + JSON.stringify(res2));

  const res3 = apply_({ name: '\u30c6\u30b9\u30c8', email: 'x@example.com', password: 'short' });
  Logger.log('\u2462 \u30d1\u30b9\u30ef\u30fc\u30c9\u304c\u77ed\u3044 \u2192 ' + JSON.stringify(res3));

  const res4 = apply_({ name: '\u30ed\u30dc\u30c3\u30c8', email: 'bot@example.com', password: 'testpass123', website: 'http://spam' });
  Logger.log('\u2463 \u30ed\u30dc\u30c3\u30c8\uff08\u898b\u3048\u306a\u3044\u6b04\u306b\u5165\u529b\u3042\u308a\uff09 \u2192 ' + JSON.stringify(res4) + '\uff08ok:true \u3067\u3082\u4f55\u3082\u767b\u9332\u3055\u308c\u306a\u3044\uff09');
}

/**
 * \u3010\u30c6\u30b9\u30c8\u5f8c\u306e\u7247\u3065\u3051\u3011\u30e1\u30fc\u30eb\u306b\u300c+retest\u300d\u3092\u542b\u3080\u7533\u8fbc\u3068\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u3001Applications \u3068 Users \u304b\u3089\u524a\u9664\u3059\u308b
 */
function cleanupTestApply() {
  let removed = 0;
  [[SHEET_APPLICATIONS, 3], [SHEET_USERS, 2]].forEach(function (def) {
    const sheet = getSheet_(def[0]);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    const emails = sheet.getRange(2, def[1], lastRow - 1, 1).getValues();
    for (let i = emails.length - 1; i >= 0; i--) {
      if (String(emails[i][0]).toLowerCase().indexOf('+retest@') !== -1) {
        sheet.deleteRow(i + 2);
        removed++;
      }
    }
  });
  Logger.log('\u30c6\u30b9\u30c8\u7528\u306e\u884c\u3092 ' + removed + ' \u884c\u524a\u9664\u3057\u307e\u3057\u305f\u3002');
}


/** \u91d1\u984d\u3092\u300c\u00a51,100\u300d\u306e\u5f62\u306b\u3059\u308b */
function yen_(n) {
  return '\u00a5' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
