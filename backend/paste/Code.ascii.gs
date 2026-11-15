/**
 * R-ESUME API - \u30a8\u30f3\u30c8\u30ea\u30dd\u30a4\u30f3\u30c8
 */

// \u30b7\u30fc\u30c8\u540d\uff08\u30b9\u30d7\u30ec\u30c3\u30c9\u30b7\u30fc\u30c8\u306e\u30bf\u30d6\u540d\u3068\u5b8c\u5168\u4e00\u81f4\u3055\u305b\u308b\uff09
const SHEET_USERS = 'Users';
const SHEET_APPLICATIONS = 'Applications';

/**
 * GET\u30ea\u30af\u30a8\u30b9\u30c8\u306e\u5165\u53e3\uff08\u52d5\u4f5c\u78ba\u8a8d\u7528\uff09
 */
function doGet(e) {
  return json_({ ok: true, message: 'R-ESUME API is running' });
}

/**
 * \u30aa\u30d6\u30b8\u30a7\u30af\u30c8\u3092JSON\u3067\u8fd4\u3059\u5171\u901a\u95a2\u6570
 */
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * \u540d\u524d\u3092\u6307\u5b9a\u3057\u3066\u30b7\u30fc\u30c8\u3092\u53d6\u5f97\u3059\u308b\uff08\u306a\u3051\u308c\u3070\u30a8\u30e9\u30fc\uff09
 */
function getSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error(name + ' \u30b7\u30fc\u30c8\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002\u30b7\u30fc\u30c8\u540d\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002');
  return sheet;
}

/**
 * \u52d5\u4f5c\u78ba\u8a8d\uff1a2\u3064\u306e\u30b7\u30fc\u30c8\u306e\u898b\u51fa\u3057\u3092\u8aad\u307f\u53d6\u3063\u3066\u30ed\u30b0\u306b\u51fa\u3059
 */
function testSheets() {
  [SHEET_USERS, SHEET_APPLICATIONS].forEach(function (name) {
    const sheet = getSheet_(name);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    Logger.log(name + '\uff08' + headers.length + '\u5217\uff09: ' + headers.join(', '));
  });
}

/**
 * POST\u30ea\u30af\u30a8\u30b9\u30c8\u306e\u5165\u53e3
 * \u30d5\u30ed\u30f3\u30c8\u304b\u3089\u306f { action: '\u25cb\u25cb', ... } \u306e\u5f62\u306eJSON\u3092\u9001\u3063\u3066\u3082\u3089\u3046
 * \uff08action \u306f R-3 \u4ee5\u964d\u306e\u30b9\u30c6\u30c3\u30d7\u3067\u8db3\u3057\u3066\u3044\u304f\uff09
 */
function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, message: '\u30ea\u30af\u30a8\u30b9\u30c8\u306e\u5f62\u5f0f\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002' });
  }

  try {
    switch (req.action) {
      case 'apply':
        return json_(apply_(req));
      case 'login':
        return json_(login_(req.email, req.password));
      case 'logout':
        return json_(logout_(req.token));
      case 'me':
        return json_(checkSession_(req.token));
      case 'forgot':
        return json_(forgotPassword_(req.email));
      case 'resetCheck':
        return json_(resetCheckToken_(req.token));
      case 'reset':
        return json_(resetPassword_(req.token, req.password));
      case 'adminList':
        return json_(adminList_(req.token));
      case 'adminIssue':
        return json_(adminIssue_(req.token, String(req.applicationId || '')));
      case 'adminCancel':
        return json_(adminCancel_(req.token, String(req.applicationId || ''), req.reason));
      case 'adminSetUser':
        return json_(adminSetUser_(req.token, String(req.userId || ''), String(req.status || '')));
      default:
        return json_({ ok: false, message: '\u4e0d\u660e\u306a\u64cd\u4f5c\u3067\u3059\u3002' });
    }
  } catch (err) {
    console.error(err);
    return json_({ ok: false, message: '\u30b5\u30fc\u30d0\u30fc\u3067\u30a8\u30e9\u30fc\u304c\u767a\u751f\u3057\u307e\u3057\u305f\u3002\u6642\u9593\u3092\u304a\u3044\u3066\u3082\u3046\u4e00\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002' });
  }
}
