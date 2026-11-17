/* R-ESUME 性格診断（STAGE 1・2026-11-17 作り直し）：AIは使わず、点数の計算だけで「強み」と「合いそうな業種」を出す。
   14問・2択（「AとB、どっちが好き？」）。全部同じ答え方をしても差が出るように、強み同士をくらべる形にした（3版）。
   画面からは RPersonality.questions()・score(answers)・reason(industryId, axes) を使う。
   業種の id は前の版と同じ（ホーム・履歴書の会話で使っているため）。
   文章の {漢字|よみ} は、画面でふりがなにする。 */
(function (root) {
  'use strict';

  // 7つの軸（強み）。power は「なぜ合うか」のひとことに使う
  var AXES = {
    P: { ja: '人と話す・関わる', power: '人と{話|はな}す{力|ちから}', type: 'おしゃべり', en: 'Talking with people' },
    H: { ja: '体や手を動かす', power: '{体|からだ}を{動|うご}かす{力|ちから}', type: 'てきぱき', en: 'Working with your body and hands' },
    D: { ja: '細かく正確に進める', power: '{細|こま}かく{正確|せいかく}に{進|すす}める{力|ちから}', type: 'きっちり', en: 'Being careful and accurate' },
    T: { ja: 'チームで協力する', power: 'チームで{協力|きょうりょく}する{力|ちから}', type: 'なかま{思|おも}い', en: 'Working in a team' },
    C: { ja: '新しいことに挑戦する', power: '{新|あたら}しいことに{挑戦|ちょうせん}する{力|ちから}', type: 'チャレンジ', en: 'Taking on new challenges' },
    S: { ja: 'コツコツ続ける・落ち着いている', power: 'コツコツ{続|つづ}ける{力|ちから}', type: 'じっくり', en: 'Steady and calm' },
    L: { ja: 'ことば・文化に興味がある', power: 'ことばを{使|つか}う{力|ちから}', type: 'ことば{好|ず}き', en: 'Interest in language and culture' }
  };
  // 強みの名前（ふりがなつき）
  var AXIS_RUBY = {
    P: '{人|ひと}と{話|はな}す・{関|かか}わる', H: '{体|からだ}や{手|て}を{動|うご}かす', D: '{細|こま}かく{正確|せいかく}に{進|すす}める',
    T: 'チームで{協力|きょうりょく}する', C: '{新|あたら}しいことに{挑戦|ちょうせん}する', S: 'コツコツ{続|つづ}ける・{落|お}ち{着|つ}いている', L: 'ことば・{文化|ぶんか}に{興味|きょうみ}がある'
  };
  var AXIS_ORDER = ['P', 'H', 'D', 'T', 'C', 'S', 'L'];

  // 質問14問（2択「どっちが好き？」）。7つの強みが、それぞれ4回ずつ出る（P-H, H-D, D-T, T-C, C-S, S-L, L-P, P-D, H-T, D-C, T-S, C-L, S-P, L-H）。
  // 画面では A・B の左右（上下）をランダムに入れかえる
  var PAIRS = [
    { id: 1, a: { axis: 'P', ja: 'お{客|きゃく}さんと{話|はな}す{仕事|しごと}' }, b: { axis: 'H', ja: '{体|からだ}を{動|うご}かす{仕事|しごと}' } },
    { id: 2, a: { axis: 'H', ja: '{物|もの}を{運|はこ}んだり{作|つく}ったりする' }, b: { axis: 'D', ja: '{数字|すうじ}や{書類|しょるい}を、まちがえずにチェックする' } },
    { id: 3, a: { axis: 'D', ja: '{一人|ひとり}で{正確|せいかく}に{作業|さぎょう}を{進|すす}める' }, b: { axis: 'T', ja: 'みんなで{声|こえ}をかけ{合|あ}って{進|すす}める' } },
    { id: 4, a: { axis: 'T', ja: 'チームで{決|き}まったやり{方|かた}を{守|まも}る' }, b: { axis: 'C', ja: '{自分|じぶん}で{新|あたら}しいやり{方|かた}を{考|かんが}える' } },
    { id: 5, a: { axis: 'C', ja: '{毎日|まいにち}ちがうことが{起|お}きる{仕事|しごと}' }, b: { axis: 'S', ja: '{毎日|まいにち}{同|おな}じことを{落|お}ち{着|つ}いてする{仕事|しごと}' } },
    { id: 6, a: { axis: 'S', ja: '{静|しず}かな{場所|ばしょ}でコツコツ{働|はたら}く' }, b: { axis: 'L', ja: '{外国|がいこく}の{人|ひと}と、いろいろなことばで{話|はな}す' } },
    { id: 7, a: { axis: 'L', ja: '{日本語|にほんご}や{英語|えいご}を{使|つか}って、{通訳|つうやく}や{案内|あんない}をする' }, b: { axis: 'P', ja: '{初|はじ}めての{人|ひと}とも、すぐ{仲|なか}よくなる' } },
    { id: 8, a: { axis: 'P', ja: 'たくさんの{人|ひと}と{話|はな}す' }, b: { axis: 'D', ja: 'パソコンで{正確|せいかく}に{入力|にゅうりょく}する' } },
    { id: 9, a: { axis: 'H', ja: '{自分|じぶん}の{手|て}で{物|もの}を{作|つく}り{上|あ}げる' }, b: { axis: 'T', ja: '{仲間|なかま}を{助|たす}けて、チームで{目標|もくひょう}をめざす' } },
    { id: 10, a: { axis: 'D', ja: 'マニュアルどおりに{正確|せいかく}にやる' }, b: { axis: 'C', ja: '{目標|もくひょう}の{数字|すうじ}をめざしてチャレンジする' } },
    { id: 11, a: { axis: 'T', ja: 'みんなで{協力|きょうりょく}して{働|はたら}く' }, b: { axis: 'S', ja: '{一人|ひとり}で{黙々|もくもく}と{続|つづ}ける' } },
    { id: 12, a: { axis: 'C', ja: '{新|あたら}しいことに{挑戦|ちょうせん}する' }, b: { axis: 'L', ja: '{外国|がいこく}の{文化|ぶんか}を{学|まな}ぶ' } },
    { id: 13, a: { axis: 'S', ja: '{落|お}ち{着|つ}いて{同|おな}じ{作業|さぎょう}を{続|つづ}ける' }, b: { axis: 'P', ja: 'いろいろな{人|ひと}と{話|はな}す' } },
    { id: 14, a: { axis: 'L', ja: 'ことばを{使|つか}う{仕事|しごと}' }, b: { axis: 'H', ja: '{体|からだ}を{使|つか}う{仕事|しごと}' } }
  ];
  var QUESTIONS = PAIRS;   // 前の版の名前でも使えるように

  // 業種（9つ。営業は 2026-11-17 ユーザー指定で外した）。w＝軸ごとの重み（0〜3）。順番は同点のときの優先順。ex＝留学生がイメージしやすい職場の例
  var INDUSTRIES = [
    { id: 'food', ja: '{飲食|いんしょく}・{接客|せっきゃく}', en: 'Food service', ex: '{居酒屋|いざかや}、レストラン、カフェ、ファストフード、{回転|かいてん}ずし', w: { P: 3, H: 2, D: 0, T: 2, C: 1, S: 1, L: 1 } },
    { id: 'retail', ja: '{小売|こうり}・{販売|はんばい}', en: 'Retail and sales clerk', ex: 'コンビニ、スーパー、ドラッグストア、{携帯|けいたい}ショップ、{家電量販店|かでんりょうはんてん}、{免税店|めんぜいてん}、レンタカーの{受付|うけつけ}', w: { P: 3, H: 1, D: 1, T: 2, C: 1, S: 1, L: 1 } },
    { id: 'hotel', ja: 'ホテル・{宿泊|しゅくはく}', en: 'Hotel and lodging', ex: 'ホテルのフロント、{旅館|りょかん}、ベッドメイキング、レストランの{配膳|はいぜん}', w: { P: 3, H: 1, D: 2, T: 2, C: 0, S: 1, L: 2 } },
    { id: 'care', ja: '{介護|かいご}', en: 'Nursing care', ex: '{介護施設|かいごしせつ}（{老人|ろうじん}ホーム）、デイサービス、グループホーム', w: { P: 2, H: 2, D: 1, T: 3, C: 0, S: 3, L: 0 } },
    { id: 'factory', ja: '{製造|せいぞう}・{工場|こうじょう}', en: 'Manufacturing and factory', ex: '{食品工場|しょくひんこうじょう}（お{弁当|べんとう}・パン）、{自動車部品|じどうしゃぶひん}の{工場|こうじょう}、{電子部品|でんしぶひん}の{工場|こうじょう}', w: { P: 0, H: 3, D: 3, T: 1, C: 0, S: 3, L: 0 } },
    { id: 'logistics', ja: '{物流|ぶつりゅう}・{倉庫|そうこ}', en: 'Logistics and warehouse', ex: '{倉庫|そうこ}の{仕分|しわ}け・ピッキング、{宅配|たくはい}の{配送|はいそう}センター、ネット{通販|つうはん}の{倉庫|そうこ}', w: { P: 0, H: 3, D: 2, T: 2, C: 0, S: 2, L: 0 } },
    { id: 'construction', ja: '{建設|けんせつ}', en: 'Construction', ex: '{建設現場|けんせつげんば}、{内装工事|ないそうこうじ}、{塗装|とそう}、{足場|あしば}の{組|く}み{立|た}て', w: { P: 0, H: 3, D: 1, T: 3, C: 1, S: 2, L: 0 } },
    { id: 'office', ja: 'IT・{事務|じむ}', en: 'IT and office work', ex: '{会社|かいしゃ}の{事務|じむ}、データ{入力|にゅうりょく}、プログラマー、ITサポート', w: { P: 0, H: 0, D: 3, T: 1, C: 2, S: 2, L: 1 } },
    { id: 'language', ja: '{通訳|つうやく}・{翻訳|ほんやく}・{語学|ごがく}', en: 'Interpreting, translation and language', ex: '{通訳|つうやく}・{翻訳|ほんやく}の{会社|かいしゃ}、{観光案内所|かんこうあんないじょ}、{空港|くうこう}の{案内|あんない}、{日本語学校|にほんごがっこう}の{事務|じむ}', w: { P: 2, H: 0, D: 2, T: 0, C: 1, S: 0, L: 3 } }
  ];

  function questions() { return PAIRS.slice(); }
  function indById(id) { for (var i = 0; i < INDUSTRIES.length; i++) if (INDUSTRIES[i].id === id) return INDUSTRIES[i]; return null; }

  // answers: { 質問の番号: 選んだ強みの記号（'P' など） }。答えていない質問は数えない。
  // 強み＝選ばれた回数（0〜4）。2択なので、全部同じ答え方をしても、かならず差が出る。
  // 同じ回数の強みは、その強み同士を直接くらべた質問の答えで決め、それでも同じなら表の順。
  // 戻り値：axes＝強みごとの 0〜100（選ばれた回数×25）、topAxes／topIndustries＝上位3つ
  function score(answers) {
    answers = answers || {};
    var cnt = {}, seen = {}, win = {};   // win['P>H'] = true
    AXIS_ORDER.forEach(function (k) { cnt[k] = 0; seen[k] = 0; });
    var done = 0;
    PAIRS.forEach(function (q) {
      var c = answers[q.id];
      if (c !== q.a.axis && c !== q.b.axis) return;
      done++;
      seen[q.a.axis]++; seen[q.b.axis]++;
      cnt[c]++;
      var other = c === q.a.axis ? q.b.axis : q.a.axis;
      win[c + '>' + other] = true;
    });
    if (!done) return { axes: {}, topAxes: [], industries: [], topIndustries: [] };
    var axes = {};
    AXIS_ORDER.forEach(function (k) { axes[k] = seen[k] ? Math.round(cnt[k] / seen[k] * 100) : 0; });
    var mean = AXIS_ORDER.reduce(function (t, k) { return t + axes[k]; }, 0) / AXIS_ORDER.length;
    // 同じ回数のグループの中で、直接対決の勝ち数
    function h2h(k) { var n = 0; AXIS_ORDER.forEach(function (o) { if (o !== k && axes[o] === axes[k] && win[k + '>' + o]) n++; }); return n; }
    var order = AXIS_ORDER.slice().sort(function (a, b) {
      return axes[b] - axes[a] || h2h(b) - h2h(a) || AXIS_ORDER.indexOf(a) - AXIS_ORDER.indexOf(b);
    });
    var topAxes = order.slice(0, 3).map(function (k) { return { key: k, pct: axes[k] }; });
    // 業種：強みの「平均との差」×重み。重みの多い業種が有利にならないよう、重みの大きさでならす
    var tie = {}; order.forEach(function (k, i) { tie[k] = (order.length - i) * 0.001; });   // 同点の強みの順番を少しだけ反映
    var industries = INDUSTRIES.map(function (ind, i) {
      var t = 0, n = 0;
      AXIS_ORDER.forEach(function (k) { t += ind.w[k] * ((axes[k] - mean) / 100 + tie[k]); n += ind.w[k] * ind.w[k]; });
      return { id: ind.id, v: n ? t / Math.sqrt(n) : 0, i: i };
    }).sort(function (a, b) { return b.v - a.v || a.i - b.i; })
      .map(function (o) { return { id: o.id, pct: Math.max(5, Math.min(100, Math.round(50 + o.v * 100))) }; });
    var vals = AXIS_ORDER.map(function (k) { return axes[k]; });
    var flat = done === PAIRS.length && Math.max.apply(null, vals) === Math.min.apply(null, vals);   // どの強みも同じ（差が出なかった）
    return { axes: axes, topAxes: topAxes, industries: industries, topIndustries: industries.slice(0, 3), flat: flat };
  }

  // 「なぜ合うか」のひとこと：その業種で重み3（なければ2）の強みのうち、本人の点数が高い順に2つ
  function reason(industryId, axes) {
    var ind = indById(industryId); if (!ind) return '';
    axes = axes || {};
    var need = AXIS_ORDER.filter(function (k) { return ind.w[k] === 3; });
    if (!need.length) need = AXIS_ORDER.filter(function (k) { return ind.w[k] === 2; });
    need.sort(function (a, b) { return (axes[b] || 0) - (axes[a] || 0) || AXIS_ORDER.indexOf(a) - AXIS_ORDER.indexOf(b); });
    var p = need.slice(0, 2).map(function (k) { return AXES[k].power; });
    return (p.length === 2 ? p[0] + 'と、' + p[1] : p[0]) + 'が{生|い}かせます。';
  }

  var api = { AXES: AXES, AXIS_RUBY: AXIS_RUBY, AXIS_ORDER: AXIS_ORDER, PAIRS: PAIRS, QUESTIONS: QUESTIONS, SHORT_IDS: [], INDUSTRIES: INDUSTRIES,
              questions: questions, score: score, reason: reason, indById: indById, VERSION: 3 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RPersonality = api;
})(typeof window !== 'undefined' ? window : this);
