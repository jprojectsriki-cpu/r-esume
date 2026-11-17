/* R-ESUME 性格診断（STAGE 1・2026-11-17 作り直し）：AIは使わず、点数の計算だけで「強み」と「合いそうな業種」を出す。
   12問・3択（はい＝2／どちらでもない＝1／いいえ＝0）。
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

  // 質問12問。axes の先頭が主な軸（2倍）、2つ目があれば補助の軸（1倍）。key は音声ファイルの名前
  var QUESTIONS = [
    { id: 1, key: 'p_q01', axes: ['P'], ja: '{初対面|しょたいめん}の{人|ひと}とも、すぐに{話|はな}せる？' },
    { id: 2, key: 'p_q02', axes: ['P', 'T'], ja: '{人|ひと}の{役|やく}に{立|た}つと、うれしい？' },
    { id: 3, key: 'p_q03', axes: ['H'], ja: 'じっと{座|すわ}っているより、{体|からだ}を{動|うご}かすほうが{好|す}き？' },
    { id: 4, key: 'p_q04', axes: ['H'], ja: 'ものを{作|つく}ったり、{運|はこ}んだりするのが{好|す}き？' },
    { id: 5, key: 'p_q05', axes: ['D'], ja: '{数字|すうじ}や{文字|もじ}のまちがいに、よく{気|き}がつく？' },
    { id: 6, key: 'p_q06', axes: ['D', 'S'], ja: '{決|き}められた{手順|てじゅん}どおりに、{正確|せいかく}にやるのが{得意|とくい}？' },
    { id: 7, key: 'p_q07', axes: ['T'], ja: 'みんなで{協力|きょうりょく}して、{目標|もくひょう}をめざすのが{好|す}き？' },
    { id: 8, key: 'p_q08', axes: ['C'], ja: '{新|あたら}しいことに{挑戦|ちょうせん}するのが{好|す}き？' },
    { id: 9, key: 'p_q09', axes: ['C'], ja: '{目標|もくひょう}（{数字|すうじ}など）があると、やる{気|き}が{出|で}る？' },
    { id: 10, key: 'p_q10', axes: ['S'], ja: '{毎日|まいにち}{同|おな}じことを、コツコツ{続|つづ}けるのが{苦|く}にならない？' },
    { id: 11, key: 'p_q11', axes: ['L'], ja: '{日本語|にほんご}や{英語|えいご}など、ことばを{使|つか}うのが{好|す}き？' },
    { id: 12, key: 'p_q12', axes: ['L', 'P'], ja: '{外国|がいこく}の{人|ひと}や{文化|ぶんか}と{関|かか}わるのが{好|す}き？' }
  ];
  var CHOICES = [
    { v: 2, ja: 'はい' },
    { v: 1, ja: 'どちらでもない' },
    { v: 0, ja: 'いいえ' }
  ];

  // 業種。w＝軸ごとの重み（0〜3）。順番は同点のときの優先順。ex＝留学生がイメージしやすい職場の例
  var INDUSTRIES = [
    { id: 'food', ja: '{飲食|いんしょく}・{接客|せっきゃく}', en: 'Food service', ex: '{居酒屋|いざかや}、レストラン、カフェ、ファストフード、{回転|かいてん}ずし', w: { P: 3, H: 2, D: 0, T: 2, C: 1, S: 1, L: 1 } },
    { id: 'retail', ja: '{小売|こうり}・{販売|はんばい}', en: 'Retail and sales clerk', ex: 'コンビニ、スーパー、ドラッグストア、{携帯|けいたい}ショップ、{家電量販店|かでんりょうはんてん}、{免税店|めんぜいてん}', w: { P: 3, H: 1, D: 1, T: 2, C: 1, S: 1, L: 1 } },
    { id: 'hotel', ja: 'ホテル・{宿泊|しゅくはく}', en: 'Hotel and lodging', ex: 'ホテルのフロント、{旅館|りょかん}、ベッドメイキング、レストランの{配膳|はいぜん}', w: { P: 3, H: 1, D: 2, T: 2, C: 0, S: 1, L: 2 } },
    { id: 'care', ja: '{介護|かいご}', en: 'Nursing care', ex: '{介護施設|かいごしせつ}（{老人|ろうじん}ホーム）、デイサービス、グループホーム', w: { P: 2, H: 2, D: 1, T: 3, C: 0, S: 3, L: 0 } },
    { id: 'factory', ja: '{製造|せいぞう}・{工場|こうじょう}', en: 'Manufacturing and factory', ex: '{食品工場|しょくひんこうじょう}（お{弁当|べんとう}・パン）、{自動車部品|じどうしゃぶひん}の{工場|こうじょう}、{電子部品|でんしぶひん}の{工場|こうじょう}', w: { P: 0, H: 3, D: 3, T: 1, C: 0, S: 3, L: 0 } },
    { id: 'logistics', ja: '{物流|ぶつりゅう}・{倉庫|そうこ}', en: 'Logistics and warehouse', ex: '{倉庫|そうこ}の{仕分|しわ}け・ピッキング、{宅配|たくはい}の{配送|はいそう}センター、ネット{通販|つうはん}の{倉庫|そうこ}', w: { P: 0, H: 3, D: 2, T: 2, C: 0, S: 2, L: 0 } },
    { id: 'construction', ja: '{建設|けんせつ}', en: 'Construction', ex: '{建設現場|けんせつげんば}、{内装工事|ないそうこうじ}、{塗装|とそう}、{足場|あしば}の{組|く}み{立|た}て', w: { P: 0, H: 3, D: 1, T: 3, C: 1, S: 2, L: 0 } },
    { id: 'office', ja: 'IT・{事務|じむ}', en: 'IT and office work', ex: '{会社|かいしゃ}の{事務|じむ}、データ{入力|にゅうりょく}、プログラマー、ITサポート', w: { P: 0, H: 0, D: 3, T: 1, C: 2, S: 2, L: 1 } },
    { id: 'sales', ja: '{営業|えいぎょう}', en: 'Sales', ex: '{不動産会社|ふどうさんがいしゃ}、{人材会社|じんざいがいしゃ}、インターネット{回線|かいせん}の{営業|えいぎょう}', w: { P: 3, H: 0, D: 0, T: 1, C: 3, S: 0, L: 1 } },
    { id: 'language', ja: '{通訳|つうやく}・{翻訳|ほんやく}・{語学|ごがく}', en: 'Interpreting, translation and language', ex: '{通訳|つうやく}・{翻訳|ほんやく}の{会社|かいしゃ}、{観光案内所|かんこうあんないじょ}、{空港|くうこう}の{案内|あんない}、{日本語学校|にほんごがっこう}の{事務|じむ}', w: { P: 2, H: 0, D: 2, T: 0, C: 1, S: 0, L: 3 } }
  ];

  function questions() { return QUESTIONS.slice(); }
  function indById(id) { for (var i = 0; i < INDUSTRIES.length; i++) if (INDUSTRIES[i].id === id) return INDUSTRIES[i]; return null; }

  // answers: { 質問の番号: 0〜2（2＝はい） }。答えていない質問は計算に入れない。
  // 「全部はい」のような答え方のクセを消すため、自分の平均からの差で強みを決める。
  // 戻り値：axes＝軸ごとの 5〜100（50が自分の平均）、topAxes／topIndustries＝上位3つ
  function score(answers) {
    answers = answers || {};
    var sum = {}, max = {};
    QUESTIONS.forEach(function (q) {
      var a = answers[q.id];
      if (a === undefined || a === null || a === '') return;
      a = Number(a);
      if (!(a >= 0 && a <= 2)) return;
      q.axes.forEach(function (k, i) {
        var w = i === 0 ? 2 : 1;
        sum[k] = (sum[k] || 0) + a * w;
        max[k] = (max[k] || 0) + 2 * w;
      });
    });
    var Lv = {}, keys = [];
    AXIS_ORDER.forEach(function (k) { if (max[k]) { Lv[k] = sum[k] / max[k]; keys.push(k); } });
    if (!keys.length) return { axes: {}, topAxes: [], industries: [], topIndustries: [] };
    var mean = keys.reduce(function (t, k) { return t + Lv[k]; }, 0) / keys.length;
    var dev = {}, axes = {};
    keys.forEach(function (k) { dev[k] = Lv[k] - mean; axes[k] = Math.max(5, Math.min(100, Math.round(50 + dev[k] * 100))); });
    var topAxes = keys
      .map(function (k) { return { key: k, d: dev[k], i: AXIS_ORDER.indexOf(k) }; })
      .sort(function (a, b) { return b.d - a.d || a.i - b.i; })
      .slice(0, 3)
      .map(function (o) { return { key: o.key, pct: axes[o.key] }; });
    var industries = INDUSTRIES.map(function (ind, i) {
      var t = 0, n = 0;
      keys.forEach(function (k) { t += ind.w[k] * dev[k]; n += ind.w[k] * ind.w[k]; });
      return { id: ind.id, v: n ? t / Math.sqrt(n) : 0, i: i };
    }).sort(function (a, b) { return b.v - a.v || a.i - b.i; })
      .map(function (o) { return { id: o.id, pct: Math.max(5, Math.min(100, Math.round(50 + o.v * 100))) }; });
    return { axes: axes, topAxes: topAxes, industries: industries, topIndustries: industries.slice(0, 3) };
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

  var api = { AXES: AXES, AXIS_RUBY: AXIS_RUBY, AXIS_ORDER: AXIS_ORDER, QUESTIONS: QUESTIONS, CHOICES: CHOICES, SHORT_IDS: [], INDUSTRIES: INDUSTRIES,
              questions: questions, score: score, reason: reason, indById: indById, VERSION: 2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RPersonality = api;
})(typeof window !== 'undefined' ? window : this);
