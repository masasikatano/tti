/* marketprofile.js — ボリュームプロファイル(市場の構造)の集計。
 * 表示範囲の日次データから、価格×出来高の分布をビン分割して集計する。
 * 各日の出来高は、その日の[low, high]レンジが重なるビンに
 * 重なり幅に比例して線形分配する(疑似生成のため参考値)。
 */
(function (global) {
  "use strict";

  // data: [{date, open, high, low, close, volume}]、binCount: 価格帯の分割数
  // 戻り値: {bins:[{y, vol, low, high}], pocY, vaTop, vaBottom, maxVol}
  //   bins  : 下位価格帯から順。y=ビン中央値、vol=集計出来高、low/high=ビン境界
  //   pocY  : POC(出来高が最も多い価格帯の中央値)
  //   vaTop/vaBottom : バリューエリア(全体の70%を占める連続したビン群)の上下端
  //   maxVol: 最大ビン出来高(POCライン描画用)
  function aggregate(data, binCount) {
    var min = Infinity, max = -Infinity, i;
    for (i = 0; i < data.length; i++) {
      if (data[i].low < min) min = data[i].low;
      if (data[i].high > max) max = data[i].high;
    }
    if (!isFinite(min) || max <= min) return null;

    var binW = (max - min) / binCount;
    var vols = [], total = 0;
    for (i = 0; i < binCount; i++) vols.push(0);

    // 各日の出来高を、レンジ[low, high]と重なるビンに重なり幅で線形分配
    data.forEach(function (d) {
      var lo = Math.max(d.low, min), hi = Math.min(d.high, max);
      if (hi <= lo) return;
      var b0 = Math.max(0, Math.floor((lo - min) / binW));
      var b1 = Math.min(binCount - 1, Math.floor((hi - min) / binW));
      for (var b = b0; b <= b1; b++) {
        var bl = min + b * binW, bh = bl + binW;
        var w = Math.min(hi, bh) - Math.max(lo, bl);
        if (w > 0) vols[b] += d.volume * (w / (hi - lo));
      }
      total += d.volume;
    });

    var bins = vols.map(function (v, b) {
      var bl = min + b * binW;
      return { y: bl + binW / 2, vol: v, low: bl, high: bl + binW };
    });

    // POC = 出来高最大のビン(同量なら中央に近い方)
    var pocIdx = 0;
    bins.forEach(function (bin, b) {
      if (bin.vol > bins[pocIdx].vol) pocIdx = b;
    });

    // バリューエリア: POCから隣接ビン(上か下か出来高の多い方)を順に足して70%まで
    var target = total * 0.7, vaSum = bins[pocIdx].vol;
    var vaLo = pocIdx, vaHi = pocIdx;
    while (vaSum < target && (vaLo > 0 || vaHi < binCount - 1)) {
      var upVol = vaHi < binCount - 1 ? bins[vaHi + 1].vol : -1;
      var dnVol = vaLo > 0 ? bins[vaLo - 1].vol : -1;
      if (upVol >= dnVol) { vaHi++; vaSum += bins[vaHi].vol; }
      else { vaLo--; vaSum += bins[vaLo].vol; }
    }

    return {
      bins: bins,
      pocY: bins[pocIdx].y,
      vaTop: bins[vaHi].high,
      vaBottom: bins[vaLo].low,
      maxVol: bins[pocIdx].vol
    };
  }

  global.MarketProfile = { aggregate: aggregate };
})(window);
