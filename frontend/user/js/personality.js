/* R-ESUME 性格分析（R-11a）：AIは使わず、点数の計算だけで「強み」と「合いそうな業種」を出す。
   画面（会話）からは RPersonality.questions(mode) と RPersonality.score(answers, mode) だけ使う。 */
(function (root) {
  'use strict';

  // 7つの軸（強み）
  var AXES = {
    P: { ja: '人と話す・関わる', en: 'Talking with people' },
    H: { ja: '体や手を動かす', en: 'Working with your body and hands' },
    D: { ja: '細かく正確に進める', en: 'Being careful and accurate' },
    T: { ja: 'チームで協力する', en: 'Working in a team' },
    C: { ja: '新しいことに挑戦する', en: 'Taking on new challenges' },
    S: { ja: 'コツコツ続ける・落ち着いている', en: 'Steady and calm' },
    L: { ja: 'ことば・文化に興味がある', en: 'Interest in language and culture' }
  };
  var AXIS_ORDER = ['P', 'H', 'D', 'T', 'C', 'S', 'L'];

  // 質問16問。axes の先頭が主な軸（重み2）、2つ目があれば補助の軸（重み1）
  var QUESTIONS = [
    { id: 1, axes: ['P'], ja: '初対面の人とも、すぐに話せる。', en: 'I can easily talk with people I have just met.' },
    { id: 2, axes: ['P', 'T'], ja: '人の役に立つと、うれしい。', en: 'I feel happy when I am useful to others.' },
    { id: 3, axes: ['H'], ja: 'じっと座っているより、体を動かすほうが好き。', en: 'I prefer moving my body to sitting still.' },
    { id: 4, axes: ['H'], ja: 'ものを作ったり、直したりするのが好き。', en: 'I like making or fixing things.' },
    { id: 5, axes: ['D'], ja: '数字や文字の間違いに、よく気がつく。', en: 'I often notice mistakes in numbers or letters.' },
    { id: 6, axes: ['D', 'S'], ja: '決められた手順どおりに、正確にやるのが得意。', en: 'I am good at following set steps accurately.' },
    { id: 7, axes: ['T'], ja: 'グループで協力して、目標をめざすのが好き。', en: 'I like working with a group toward a goal.' },
    { id: 8, axes: ['T', 'P'], ja: '人が困っていたら、自分から声をかける。', en: 'When someone is in trouble, I speak to them first.' },
    { id: 9, axes: ['C'], ja: '新しいことに挑戦するのが好き。', en: 'I like trying new things.' },
    { id: 10, axes: ['C', 'P'], ja: 'いろいろな人に会う、変化のある仕事がいい。', en: 'I want a job with change, where I meet many people.' },
    { id: 11, axes: ['S'], ja: '毎日同じことを、コツコツ続けるのが苦にならない。', en: 'I do not mind doing the same thing steadily every day.' },
    { id: 12, axes: ['S', 'D'], ja: '落ち着いた環境で、集中して働きたい。', en: 'I want to work with focus in a calm place.' },
    { id: 13, axes: ['L'], ja: '日本語や英語など、ことばを使うのが好き。', en: 'I like using languages such as Japanese and English.' },
    { id: 14, axes: ['L'], ja: '外国と日本の文化の違いを、おもしろいと思う。', en: 'I find the differences between countries and Japan interesting.' },
    { id: 15, axes: ['S', 'P'], ja: '忙しいときも、あわてずに対応できる。', en: 'I can stay calm and respond even when busy.' },
    { id: 16, axes: ['C'], ja: '目標（数字など）があると、やる気が出る。', en: 'I get motivated when there is a target (such as a number).' }
  ];

  // 短い質問（業種が決まっている人用。強みを知るため）
  var SHORT_IDS = [1, 4, 5, 7, 9, 11, 13, 15];

  // 業種ごとの重み（0〜3）。順番は同点のときの優先順
  var INDUSTRIES = [
    { id: 'food', ja: '飲食・接客', en: 'Food service', w: { P: 3, H: 2, D: 0, T: 2, C: 1, S: 1, L: 1 } },
    { id: 'retail', ja: '小売・販売', en: 'Retail and sales clerk', w: { P: 3, H: 1, D: 1, T: 2, C: 1, S: 1, L: 1 } },
    { id: 'hotel', ja: 'ホテル・宿泊', en: 'Hotel and lodging', w: { P: 3, H: 1, D: 2, T: 2, C: 0, S: 1, L: 2 } },
    { id: 'care', ja: '介護', en: 'Nursing care', w: { P: 2, H: 2, D: 1, T: 3, C: 0, S: 3, L: 0 } },
    { id: 'factory', ja: '製造・工場', en: 'Manufacturing and factory', w: { P: 0, H: 3, D: 3, T: 1, C: 0, S: 3, L: 0 } },
    { id: 'logistics', ja: '物流・倉庫', en: 'Logistics and warehouse', w: { P: 0, H: 3, D: 2, T: 2, C: 0, S: 2, L: 0 } },
    { id: 'construction', ja: '建設', en: 'Construction', w: { P: 0, H: 3, D: 1, T: 3, C: 1, S: 2, L: 0 } },
    { id: 'office', ja: 'IT・事務', en: 'IT and office work', w: { P: 0, H: 0, D: 3, T: 1, C: 2, S: 2, L: 1 } },
    { id: 'sales', ja: '営業', en: 'Sales', w: { P: 3, H: 0, D: 0, T: 1, C: 3, S: 0, L: 1 } },
    { id: 'language', ja: '通訳・翻訳・語学', en: 'Interpreting, translation and language', w: { P: 2, H: 0, D: 2, T: 0, C: 1, S: 0, L: 3 } }
  ];

  function questions(mode) {
    if (mode !== 'short') return QUESTIONS.slice();
    return QUESTIONS.filter(function (q) { return SHORT_IDS.indexOf(q.id) >= 0; });
  }

  // answers: { 質問の番号: 1〜5 }（5＝そう思う）。答えていない質問は計算に入れない。
  // 戻り値：axes＝軸ごとの 0〜100（答えがない軸は入れない）、topAxes／topIndustries＝上位3つ
  function score(answers, mode) {
    answers = answers || {};
    var qs = questions(mode);
    var sum = {}, min = {}, max = {};
    qs.forEach(function (q) {
      var a = Number(answers[q.id]);
      if (!(a >= 1 && a <= 5)) return;
      q.axes.forEach(function (k, i) {
        var w = i === 0 ? 2 : 1;
        sum[k] = (sum[k] || 0) + a * w;
        min[k] = (min[k] || 0) + 1 * w;
        max[k] = (max[k] || 0) + 5 * w;
      });
    });
    var axes = {};
    AXIS_ORDER.forEach(function (k) {
      if (max[k]) axes[k] = Math.round((sum[k] - min[k]) / (max[k] - min[k]) * 100);
    });
    var topAxes = AXIS_ORDER.filter(function (k) { return k in axes; })
      .map(function (k, i) { return { key: k, pct: axes[k], i: i }; })
      .sort(function (a, b) { return b.pct - a.pct || a.i - b.i; })
      .slice(0, 3)
      .map(function (o) { return { key: o.key, pct: o.pct, ja: AXES[o.key].ja, en: AXES[o.key].en }; });
    var industries = INDUSTRIES.map(function (ind, i) {
      var tw = 0, ts = 0;
      AXIS_ORDER.forEach(function (k) {
        if (k in axes) { tw += ind.w[k]; ts += ind.w[k] * axes[k]; }
      });
      return { id: ind.id, ja: ind.ja, en: ind.en, pct: tw ? Math.round(ts / tw) : 0, i: i };
    }).sort(function (a, b) { return b.pct - a.pct || a.i - b.i; })
      .map(function (o) { return { id: o.id, ja: o.ja, en: o.en, pct: o.pct }; });
    return { axes: axes, topAxes: topAxes, industries: industries, topIndustries: industries.slice(0, 3) };
  }

  var api = { AXES: AXES, AXIS_ORDER: AXIS_ORDER, QUESTIONS: QUESTIONS, SHORT_IDS: SHORT_IDS, INDUSTRIES: INDUSTRIES, questions: questions, score: score };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RPersonality = api;
})(typeof window !== 'undefined' ? window : this);
