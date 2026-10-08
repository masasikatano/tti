/* indicators.js — SMA/EMA と 7指標の実装
 * すべて入力は [{date, open, high, low, close, volume}]。
 * ウォームアップ期間は null で埋め、描画時にスキップする(安全側)。
 */
(function (global) {
  "use strict";

  function closes(data) { return data.map(function (d) { return d.close; }); }
  function highs(data) { return data.map(function (d) { return d.high; }); }
  function lows(data) { return data.map(function (d) { return d.low; }); }
  function vols(data) { return data.map(function (d) { return d.volume; }); }

  // 単純移動平均
  function SMA(values, period) {
    var out = new Array(values.length).fill(null), sum = 0;
    for (var i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  // 指数移動平均(初期値は先頭 period 個のSMA)
  function EMA(values, period) {
    var out = new Array(values.length).fill(null);
    if (values.length < period) return out;
    var sum = 0, i;
    for (i = 0; i < period; i++) sum += values[i];
    var prev = sum / period;
    out[period - 1] = prev;
    var k = 2 / (period + 1);
    for (i = period; i < values.length; i++) {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  }

  // RSI(Wilder 平滑化)
  function RSI(data, period) {
    var c = closes(data), n = c.length;
    var out = new Array(n).fill(null);
    if (n <= period) return out;
    var gain = 0, loss = 0, i;
    for (i = 1; i <= period; i++) {
      var d = c[i] - c[i - 1];
      if (d >= 0) gain += d; else loss -= d;
    }
    var avgG = gain / period, avgL = loss / period;
    out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    for (i = period + 1; i < n; i++) {
      d = c[i] - c[i - 1];
      avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
      avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
      out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    }
    return out;
  }

  // CCI: 典型価(TP=(H+L+C)/3)とその期間SMAの差を、平均偏差×0.015 で割る
  function CCI(data, period) {
    var n = data.length;
    var out = new Array(n).fill(null), tp = new Array(n);
    for (var i = 0; i < n; i++) tp[i] = (data[i].high + data[i].low + data[i].close) / 3;
    var tpSMA = SMA(tp, period);
    for (i = period - 1; i < n; i++) {
      var mean = tpSMA[i], dev = 0;
      for (var j = i - period + 1; j <= i; j++) dev += Math.abs(tp[j] - mean);
      dev /= period;
      out[i] = dev === 0 ? 0 : (tp[i] - mean) / (0.015 * dev);
    }
    return out;
  }

  // MACD: EMA(short)-EMA(long)、シグナル=MACDのEMA、ヒストグラム=MACD-シグナル
  function MACD(data, fast, slow, signal) {
    var ef = EMA(closes(data), fast), es = EMA(closes(data), slow);
    var line = ef.map(function (v, i) { return v === null || es[i] === null ? null : v - es[i]; });
    var start = line.findIndex(function (v) { return v !== null; });
    var sig = new Array(line.length).fill(null);
    if (start >= 0) {
      var sub = EMA(line.slice(start), signal);
      for (var i = start; i < line.length; i++) sig[i] = sub[i - start];
    }
    var hist = line.map(function (v, i) { return v === null || sig[i] === null ? null : v - sig[i]; });
    return { macd: line, signal: sig, histogram: hist };
  }

  // ADX(Wilder 固定): TR, +DM/-DM, ±DI, DX, ADX
  function ADX(data, period) {
    var h = highs(data), l = lows(data), c = closes(data), n = data.length;
    var adx = new Array(n).fill(null), pdi = new Array(n).fill(null), ndi = new Array(n).fill(null);
    if (n <= period * 2) return { adx: adx, pdi: pdi, ndi: ndi };
    var tr = new Array(n).fill(null), pdm = new Array(n).fill(0), ndm = new Array(n).fill(0);
    for (var i = 1; i < n; i++) {
      tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
      var up = h[i] - h[i - 1], dn = l[i - 1] - l[i];
      if (up > dn && up > 0) pdm[i] = up;
      if (dn > up && dn > 0) ndm[i] = dn;
    }
    var atr = 0, sp = 0, sn = 0;
    for (i = 1; i <= period; i++) { atr += tr[i]; sp += pdm[i]; sn += ndm[i]; }
    atr /= period; sp /= period; sn /= period;
    function dis(atrV, spV, snV) {
      var p = 100 * spV / (atrV || 1e-12), m = 100 * snV / (atrV || 1e-12);
      return [p, m, 100 * Math.abs(p - m) / ((p + m) || 1e-12)];
    }
    var dx0 = dis(atr, sp, sn);
    pdi[period] = dx0[0]; ndi[period] = dx0[1];
    var adxPrev = dx0[2];
    adx[period * 2] = null; // 十分なDXが揃うまでは出さない
    var dxCount = 1, dxSum = dx0[2];
    for (i = period + 1; i < n; i++) {
      atr = (atr * (period - 1) + tr[i]) / period;
      sp = (sp * (period - 1) + pdm[i]) / period;
      sn = (sn * (period - 1) + ndm[i]) / period;
      var dx = dis(atr, sp, sn);
      pdi[i] = dx[0]; ndi[i] = dx[1];
      if (i < period * 2) { dxSum += dx[2]; dxCount++; }
      else if (i === period * 2) { adxPrev = (dxSum + dx[2]) / (dxCount + 1); adx[i] = adxPrev; }
      else { adxPrev = (adxPrev * (period - 1) + dx[2]) / period; adx[i] = adxPrev; }
    }
    return { adx: adx, pdi: pdi, ndi: ndi };
  }

  // ボリンジャーバンド: 終値SMA ± (母集団標準偏差 × σ)
  function BOLL(data, period, sigma) {
    var c = closes(data), n = c.length;
    var mid = new Array(n).fill(null), up = new Array(n).fill(null), lo = new Array(n).fill(null);
    for (var i = period - 1; i < n; i++) {
      var mean = 0, j;
      for (j = i - period + 1; j <= i; j++) mean += c[j];
      mean /= period;
      var v = 0;
      for (j = i - period + 1; j <= i; j++) v += (c[j] - mean) * (c[j] - mean);
      var sd = Math.sqrt(v / period);
      mid[i] = mean; up[i] = mean + sigma * sd; lo[i] = mean - sigma * sd;
    }
    return { mid: mid, upper: up, lower: lo };
  }

  // True Range 系列
  function TR(data) {
    var h = highs(data), l = lows(data), c = closes(data);
    var out = new Array(data.length).fill(null);
    for (var i = 1; i < data.length; i++) {
      out[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
    }
    return out;
  }

  // ATR: 平滑化方式 "sma" または "wilder"
  function ATR(data, period, method) {
    var tr = TR(data);
    var out = new Array(data.length).fill(null);
    if (method === "sma") {
      var sum = 0;
      for (var i = 1; i < tr.length; i++) {
        sum += tr[i];
        if (i > period) sum -= tr[i - period];
        if (i >= period) out[i] = sum / period;
      }
    } else {
      if (tr.length <= period) return out;
      var s = 0;
      for (i = 1; i <= period; i++) s += tr[i];
      var prev = s / period;
      out[period] = prev;
      for (i = period + 1; i < tr.length; i++) {
        prev = (prev * (period - 1) + tr[i]) / period;
        out[i] = prev;
      }
    }
    return out;
  }

  // VWMA: sum(C*V)/sum(V)、比較用SMAも同時に返す
  function VWMA(data, period, smaPeriod) {
    var c = closes(data), v = vols(data), n = data.length;
    var out = new Array(n).fill(null);
    var pv = 0, vv = 0;
    for (var i = 0; i < n; i++) {
      pv += c[i] * v[i]; vv += v[i];
      if (i >= period) { pv -= c[i - period] * v[i - period]; vv -= v[i - period]; }
      if (i >= period - 1) out[i] = vv === 0 ? null : pv / vv;
    }
    return { vwma: out, sma: SMA(c, smaPeriod || period) };
  }

  global.Indicators = {
    closes: closes, highs: highs, lows: lows, vols: vols,
    SMA: SMA, EMA: EMA, RSI: RSI, CCI: CCI, MACD: MACD,
    ADX: ADX, BOLL: BOLL, ATR: ATR, TR: TR, VWMA: VWMA
  };
})(window);
