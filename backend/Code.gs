/**
 * R-ESUME API - エントリポイント
 */

// シート名（スプレッドシートのタブ名と完全一致させる）
const SHEET_USERS = 'Users';
const SHEET_APPLICATIONS = 'Applications';

/**
 * GETリクエストの入口（動作確認用）
 */
function doGet(e) {
  return json_({ ok: true, message: 'R-ESUME API is running' });
}

/**
 * オブジェクトをJSONで返す共通関数
 */
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 名前を指定してシートを取得する（なければエラー）
 */
function getSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error(name + ' シートが見つかりません。シート名を確認してください。');
  return sheet;
}

/**
 * 動作確認：2つのシートの見出しを読み取ってログに出す
 */
function testSheets() {
  [SHEET_USERS, SHEET_APPLICATIONS].forEach(function (name) {
    const sheet = getSheet_(name);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    Logger.log(name + '（' + headers.length + '列）: ' + headers.join(', '));
  });
}

/**
 * POSTリクエストの入口
 * フロントからは { action: '○○', ... } の形のJSONを送ってもらう
 * （action は R-3 以降のステップで足していく）
 */
function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, message: 'リクエストの形式が正しくありません。' });
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
      case 'myRenewal':
        return json_(myRenewal_(req.token));
      case 'renew':
        return json_(renew_(req.token));
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
      case 'resumeList':
        return json_(resumeList_(req.token));
      case 'resumeGet':
        return json_(resumeGet_(req.token, String(req.resumeId || '')));
      case 'resumeCreate':
        return json_(resumeCreate_(req.token, req.title, String(req.copyFrom || '')));
      case 'resumeSave':
        return json_(resumeSave_(req.token, String(req.resumeId || ''), req.title, req.data));
      case 'resumeDelete':
        return json_(resumeDelete_(req.token, String(req.resumeId || '')));
      case 'qualList':
        return json_(qualList_(req.token));
      case 'adminQualSave':
        return json_(adminQualSave_(req.token, req.qual));
      case 'adminQualDelete':
        return json_(adminQualDelete_(req.token, String(req.qualId || '')));
      case 'adminUserDetail':
        return json_(adminUserDetail_(req.token, String(req.userId || '')));
      case 'adminResumeView':
        return json_(adminResumeView_(req.token, String(req.resumeId || '')));
      case 'noticeList':
        return json_(noticeList_(req.token));
      case 'adminNoticeList':
        return json_(adminNoticeList_(req.token));
      case 'adminNoticeSave':
        return json_(adminNoticeSave_(req.token, req.notice));
      case 'adminNoticeDelete':
        return json_(adminNoticeDelete_(req.token, String(req.noticeId || '')));
      case 'personaGet':
        return json_(personaGet_(req.token));
      case 'personaSave':
        return json_(personaSave_(req.token, req.persona));
      default:
        return json_({ ok: false, message: '不明な操作です。' });
    }
  } catch (err) {
    console.error(err);
    return json_({ ok: false, message: 'サーバーでエラーが発生しました。時間をおいてもう一度お試しください。' });
  }
}
