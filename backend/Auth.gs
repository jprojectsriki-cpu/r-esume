/**
 * R-ESUME API - 認証まわり（パスワードのハッシュ化・管理者登録）
 */

// ハッシュを繰り返す回数（多いほど安全だが処理が遅くなる）
const HASH_ITERATIONS = 1000;

/** ランダムなソルトを作る（32文字の英数字） */
function generateSalt_() {
  return Utilities.getUuid().replace(/-/g, '');
}

/** パスワード + ソルト を SHA-256 で繰り返しハッシュ化し、16進数の文字列で返す */
function hashPassword_(password, salt) {
  const saltBytes = Utilities.newBlob(salt).getBytes();
  let bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, salt + password, Utilities.Charset.UTF_8);
  for (let i = 1; i < HASH_ITERATIONS; i++) {
    bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes.concat(saltBytes));
  }
  return bytes.map(function (b) {
    return ((b + 256) % 256).toString(16).padStart(2, '0');
  }).join('');
}

/** 入力されたパスワードが正しいかを確認する */
function verifyPassword_(password, salt, storedHash) {
  return hashPassword_(password, salt) === storedHash;
}

/**
 * 【1回だけ実行】最初の管理者アカウントを登録する
 * 事前に、スクリプト プロパティに ADMIN_EMAIL と ADMIN_PASSWORD を設定しておくこと
 */
function setupAdmin() {
  const props = PropertiesService.getScriptProperties();
  const email = String(props.getProperty('ADMIN_EMAIL') || '').trim().toLowerCase();
  const password = String(props.getProperty('ADMIN_PASSWORD') || '');

  if (!email || !password) {
    throw new Error('スクリプト プロパティに ADMIN_EMAIL と ADMIN_PASSWORD を設定してください。');
  }
  if (password.length < 8) {
    throw new Error('パスワードは8文字以上にしてください。');
  }

  const sheet = getSheet_(SHEET_USERS);

  // ハッシュ・ソルトが数値などに自動変換されないよう「書式なしテキスト」にする
  sheet.getRange('C:D').setNumberFormat('@');

  // 同じメールアドレスが登録済みでないか確認
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const emails = sheet.getRange(2, 2, lastRow - 1, 1).getValues()
      .map(function (r) { return String(r[0]).trim().toLowerCase(); });
    if (emails.indexOf(email) !== -1) {
      throw new Error('このメールアドレスはすでに登録されています。');
    }
  }

  const salt = generateSalt_();
  const now = new Date();
  sheet.appendRow([
    Utilities.getUuid(),            // userId
    email,                          // email
    hashPassword_(password, salt),  // passwordHash
    salt,                           // salt
    '管理者',                       // name
    'admin',                        // role
    'active',                       // status
    '',                             // validUntil（管理者は期限なし）
    now,                            // createdAt
    now,                            // activatedAt
    ''                              // lastLoginAt
  ]);

  // 使い終わったパスワードはプロパティから削除する
  props.deleteProperty('ADMIN_PASSWORD');
  Logger.log('管理者を登録しました: ' + email);
}


/** メールアドレスでユーザーを探す（見つからなければ null） */
function findUserByEmail_(email) {
  const sheet = getSheet_(SHEET_USERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const rows = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[1]).trim().toLowerCase() === email) {
      return {
        row: i + 2,
        userId: String(r[0]),
        email: String(r[1]),
        passwordHash: String(r[2]),
        salt: String(r[3]),
        name: String(r[4]),
        role: String(r[5]),
        status: String(r[6]),
        validUntil: r[7] || null
      };
    }
  }
  return null;
}


/* =========================================================
 * ログイン・ログアウト・ログイン状態の確認（あとから優先）
 * ========================================================= */

const SESSION_TTL_SEC = 6 * 60 * 60; // ログインの有効期間（キャッシュの上限が6時間）
const MAX_LOGIN_FAILS = 5;           // 連続で失敗できる回数
const LOCK_SEC = 15 * 60;            // 失敗が続いたときにログインできない時間

/** 利用期限を過ぎているか（管理者は期限なし。期限が空の人は、まだ期限がないので false） */
function isExpired_(role, validUntil) {
  if (role === 'admin' || !validUntil) return false;
  const t = new Date(validUntil).getTime();
  return !isNaN(t) && t < Date.now();
}

/** ログイン：成功したらトークンを発行し、前の端末のトークンは無効にする */
function login_(email, password) {
  email = String(email || '').trim().toLowerCase();
  password = String(password || '');
  if (!email || !password) {
    return { ok: false, message: 'メールアドレスとパスワードを入力してください。' };
  }

  const cache = CacheService.getScriptCache();
  const failKey = 'loginfail_' + email;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_LOGIN_FAILS) {
    return { ok: false, message: 'ログインの失敗が続いたため、15分ほど時間をおいてからお試しください。' };
  }

  const user = findUserByEmail_(email);
  if (!user || !verifyPassword_(password, user.salt, user.passwordHash)) {
    cache.put(failKey, String(fails + 1), LOCK_SEC);
    return { ok: false, message: 'メールアドレスまたはパスワードが正しくありません。' };
  }

  if (user.status !== 'active') {
    return {
      ok: false,
      message: user.status === 'pending'
        ? 'アカウントはまだ発行されていません。お支払いの確認後、メールでお知らせします。'
        : 'このアカウントは現在ご利用いただけません。'
    };
  }

  cache.remove(failKey);

  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const validUntil = user.validUntil ? new Date(user.validUntil).toISOString() : null;
  const session = {
    userId: user.userId,
    email: user.email,
    name: user.name,
    role: user.role,
    validUntil: validUntil,
    expired: isExpired_(user.role, user.validUntil)
  };
  cache.put('session_' + token, JSON.stringify(session), SESSION_TTL_SEC);
  // 「このユーザーの今有効なトークン」を記録する（前の端末のトークンはこれで無効になる）
  cache.put('current_' + user.userId, token, SESSION_TTL_SEC);

  getSheet_(SHEET_USERS).getRange(user.row, 11).setValue(new Date()); // lastLoginAt

  return { ok: true, token: token, user: session };
}

/**
 * トークンを確認する
 * 戻り値：{ ok: true, user } または { ok: false, reason: 'expired' | 'replaced' | 'suspended', message }
 */
function checkSession_(token) {
  const cache = CacheService.getScriptCache();
  const raw = token ? cache.get('session_' + token) : null;
  if (!raw) {
    return { ok: false, reason: 'expired', message: 'ログインの有効期限が切れました。もう一度ログインしてください。' };
  }
  const session = JSON.parse(raw);
  const current = cache.get('current_' + session.userId);
  if (current === 'suspended') {
    cache.remove('session_' + token);
    return { ok: false, reason: 'suspended', message: 'このアカウントは現在ご利用いただけません。' };
  }
  if (current !== token) {
    cache.remove('session_' + token);
    return { ok: false, reason: 'replaced', message: '別の端末でログインされたため、ログアウトしました。' };
  }
  return { ok: true, user: session };
}

/** ログアウト：トークンを無効にする */
function logout_(token) {
  if (!token) return { ok: true };
  const cache = CacheService.getScriptCache();
  const raw = cache.get('session_' + token);
  if (raw) {
    const session = JSON.parse(raw);
    if (cache.get('current_' + session.userId) === token) cache.remove('current_' + session.userId);
  }
  cache.remove('session_' + token);
  return { ok: true };
}

/**
 * 【テスト用】ログインの動作確認
 * 事前に、スクリプト プロパティに TEST_PASSWORD（R-ESUME の管理者パスワード）を入れておくこと
 * ※ 入金待ちのテスト用アカウント（メールに +retest を含む）を一時的に作り、最後に削除する
 */
function testLogin() {
  const props = PropertiesService.getScriptProperties();
  const email = props.getProperty('ADMIN_EMAIL');
  const password = props.getProperty('TEST_PASSWORD');
  if (!password) throw new Error('スクリプト プロパティに TEST_PASSWORD を設定してください。');

  Logger.log('① 間違ったパスワード → ' + JSON.stringify(login_(email, password + 'x')));

  const pcA = login_(email, password);
  Logger.log('② 端末Aでログイン → ok: ' + pcA.ok + ' / role: ' + (pcA.user && pcA.user.role) + ' / expired: ' + (pcA.user && pcA.user.expired));
  Logger.log('③ 端末Aの確認 → ok: ' + checkSession_(pcA.token).ok);

  const pcB = login_(email, password);
  Logger.log('④ 端末Bでログイン → ok: ' + pcB.ok);
  Logger.log('⑤ 端末Aの確認 → ' + JSON.stringify(checkSession_(pcA.token)));
  Logger.log('⑥ 端末Bの確認 → ok: ' + checkSession_(pcB.token).ok);

  logout_(pcB.token);
  Logger.log('⑦ 端末Bでログアウト後 → reason: ' + checkSession_(pcB.token).reason);

  // 入金待ちのテスト用アカウントを一時的に作る
  const testEmail = email.replace('@', '+retest@');
  const salt = generateSalt_();
  getSheet_(SHEET_USERS).appendRow([
    Utilities.getUuid(), testEmail, hashPassword_('testpass123', salt), salt, 'テスト 太郎',
    'user', 'pending', '', new Date(), '', ''
  ]);
  Logger.log('⑧ 入金待ちのテスト太郎 → ' + JSON.stringify(login_(testEmail, 'testpass123')));

  // 間違ったパスワードを続けて入れると、15分ロックされる（テスト用アカウントで確かめる）
  for (let i = 0; i < MAX_LOGIN_FAILS; i++) login_(testEmail, 'wrong-password');
  Logger.log('⑨ 5回失敗のあと → ' + JSON.stringify(login_(testEmail, 'testpass123')));

  // 片づけ：ロックを解除し、テスト用アカウントを削除し、TEST_PASSWORD を消す
  CacheService.getScriptCache().remove('loginfail_' + testEmail);
  const t = findUserByEmail_(testEmail);
  if (t) getSheet_(SHEET_USERS).deleteRow(t.row);
  props.deleteProperty('TEST_PASSWORD');
  Logger.log('片づけ：テスト用アカウントと TEST_PASSWORD を削除しました');
}
