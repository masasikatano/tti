/* data.js — 価格データの生成・読み込み
 * 疑似ランダムウォーク生成モード(デフォルト)と、
 * 実データモード(data/series/*.json の日次終値)を提供する。
 *
 * 【重要】実データモードでは、元データが「日次終値のみ」のため、
 * High/Low/出来高は終値から疑似生成する(下の pseudoOHLCV 参照)。
 * そのため ATR/CCI/ADX/BOLL/VWMA など High/Low/出来高に依存する指標は
 * 実データモードでも精度上の注意が必要(シミュレーター画面上にも注記する)。
 */
(function (global) {
  "use strict";

  // Box–Muller による標準正規乱数
  function gauss() {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  // 疑似ランダムウォークで日次 OHLCV を生成する
  function generateRandomWalk(n, opts) {
    opts = opts || {};
    var start = opts.start || 10000;
    var drift = opts.drift || 0.0003;   // 1日あたりの期待ドリフト
    var vol = opts.vol || 0.012;        // 1日あたりのボラティリティ
    var out = [];
    var close = start;
    var d = opts.startDate ? new Date(opts.startDate) : new Date(2016, 8, 1);
    for (var i = 0; i < n; i++) {
      var prevClose = close;
      close = prevClose * (1 + drift + vol * gauss());
      var ohlcv = pseudoOHLCV(prevClose, close, i);
      out.push({
        date: fmt(d),
        open: ohlcv.open, high: ohlcv.high, low: ohlcv.low,
        close: close, volume: ohlcv.volume
      });
      d = nextDay(d);
    }
    return out;
  }

  function fmt(d) {
    var y = d.getFullYear(), m = ("0" + (d.getMonth() + 1)).slice(-2), dd = ("0" + d.getDate()).slice(-2);
    return y + "-" + m + "-" + dd;
  }
  function nextDay(d) {
    var x = new Date(d.getTime());
    do { x.setDate(x.getDate() + 1); } while (x.getDay() === 0 || x.getDay() === 6);
    return x;
  }

  /* 終値ペア(prevClose, close)から High/Low/出来高を疑似生成する。
   * 疑似生成ロジック:
   *  - open: 前日終値と当日終値の間をランダムに内分
   *  - high/low: max(open, close) / min(open, close) に対し、
   *    当日の変動率に比例する乱数幅を上(下)に足す
   *  - volume: 終値変動率の絶対値が大きい日ほど出来高が多い、正の乱数
   * 実データモードではこの値が「終値由来の推定」である点に注意。
   */
  function pseudoOHLCV(prevClose, close, i) {
    var r = Math.abs(close - prevClose) / prevClose;
    var open = prevClose + (close - prevClose) * Math.random();
    var up = Math.max(open, close), dn = Math.min(open, close);
    var amp = r * (0.3 + Math.random() * 0.8);
    var high = up * (1 + amp * Math.random());
    var low = dn * (1 - amp * Math.random());
    var volume = Math.round(1e6 * (0.5 + 3 * Math.random() + 120 * r * Math.random()));
    return { open: open, high: high, low: low, volume: volume };
  }

  // 実データ(JSON の points[] = {date, value})を日次終値として読み込み、OHLCV を疑似付与する
  function loadSeries(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("データ読み込み失敗: " + url);
      return res.json();
    }).then(function (json) {
      var pts = json.points || [];
      var out = [];
      for (var i = 0; i < pts.length; i++) {
        var close = pts[i].value;
        var prevClose = i > 0 ? pts[i - 1].value : close;
        var ohlcv = pseudoOHLCV(prevClose, close, i);
        out.push({
          date: pts[i].date,
          open: ohlcv.open, high: ohlcv.high, low: ohlcv.low,
          close: close, volume: ohlcv.volume
        });
      }
      return { meta: json, data: out };
    });
  }

  // 末尾 count 件に絞る(チャート描画の軽量化用)
  function tail(arr, count) {
    return count && arr.length > count ? arr.slice(arr.length - count) : arr;
  }

  global.DataModule = {
    gauss: gauss,
    generateRandomWalk: generateRandomWalk,
    loadSeries: loadSeries,
    pseudoOHLCV: pseudoOHLCV,
    tail: tail
  };
})(window);
