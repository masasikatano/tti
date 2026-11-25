/* indicators.js — SMA/EMA と各テクニカル指標の実装
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

  // RSI(Wilder 平滑化、数値系列版)
  function RSI_SERIES(values, period) {
    var n = values.length;
    var out = new Array(n).fill(null);
    if (n <= period) return out;
    var gain = 0, loss = 0, i;
    for (i = 1; i <= period; i++) {
      var d = values[i] - values[i - 1];
      if (d >= 0) gain += d; else loss -= d;
    }
    var avgG = gain / period, avgL = loss / period;
    out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    for (i = period + 1; i < n; i++) {
      d = values[i] - values[i - 1];
      avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
      avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
      out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
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

  // ConnorsRSI 用: UpDown streak(連騰落日数。上昇日は+1累積、下落日は-1累積、同値は0)
  function STREAK(data) {
    var c = closes(data), n = c.length;
    var out = new Array(n).fill(null);
    if (!n) return out;
    out[0] = 0;
    for (var i = 1; i < n; i++) {
      if (c[i] > c[i - 1]) out[i] = (out[i - 1] > 0 ? out[i - 1] : 0) + 1;
      else if (c[i] < c[i - 1]) out[i] = (out[i - 1] < 0 ? out[i - 1] : 0) - 1;
      else out[i] = 0;
    }
    return out;
  }

  // PercentRank: 当日値が過去period本中で下から何%か(0〜100)。同値は0.5として数える
  function PERCENT_RANK(values, period) {
    var n = values.length;
    var out = new Array(n).fill(null);
    for (var i = period - 1; i < n; i++) {
      var cur = values[i], less = 0, eq = 0;
      for (var j = i - period + 1; j <= i; j++) {
        if (values[j] < cur) less++;
        else if (values[j] === cur) eq++;
      }
      out[i] = period <= 1 ? 50 : (less + 0.5 * (eq - 1)) / (period - 1) * 100;
    }
    return out;
  }

  // ConnorsRSI = (RSI(終値,rsiPeriod) + RSI(streak,streakPeriod) + PercentRank(1日変化率,rankPeriod)) / 3
  function CONNORS_RSI(data, rsiPeriod, streakPeriod, rankPeriod) {
    var c = closes(data), n = c.length;
    var rsiC = RSI_SERIES(c, rsiPeriod);
    var streak = STREAK(data);
    var rsiS = RSI_SERIES(streak, streakPeriod);
    var roc = new Array(n).fill(null);
    for (var i = 1; i < n; i++) roc[i] = c[i] - c[i - 1];
    var pr = PERCENT_RANK(roc.slice(1), rankPeriod);
    var rank = new Array(n).fill(null);
    for (i = 1; i < n; i++) rank[i] = pr[i - 1];
    var out = new Array(n).fill(null);
    for (i = 0; i < n; i++) {
      if (rsiC[i] === null || rsiS[i] === null || rank[i] === null) continue;
      out[i] = (rsiC[i] + rsiS[i] + rank[i]) / 3;
    }
    return { connors: out, rsiClose: rsiC, rsiStreak: rsiS, pctRank: rank, streak: streak };
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

  // ストキャスティクス: RSV=(C−LLV)/(HHV−LLV)×100、%K=RSVのslowing日SMA、%D=%KのdPeriod日SMA
  function STOCH(data, kPeriod, slowing, dPeriod) {
    var h = highs(data), l = lows(data), c = closes(data), n = data.length;
    var rsv = new Array(n).fill(null);
    for (var i = kPeriod - 1; i < n; i++) {
      var hh = -Infinity, ll = Infinity;
      for (var j = i - kPeriod + 1; j <= i; j++) { if (h[j] > hh) hh = h[j]; if (l[j] < ll) ll = l[j]; }
      rsv[i] = hh === ll ? 50 : (c[i] - ll) / (hh - ll) * 100;
    }
    // RSVのslowing日SMA(先頭は部分平均で埋める)
    function smaPartial(v, p) {
      var out = new Array(n).fill(null), sum = 0, cnt = 0;
      for (var i = 0; i < n; i++) {
        if (v[i] !== null) { sum += v[i]; cnt++; if (cnt > p) { sum -= v[i - p]; } }
        if (cnt >= p) out[i] = sum / p;
        else if (cnt > 0) out[i] = sum / cnt;
      }
      return out;
    }
    var k = smaPartial(rsv, slowing);
    var start = k.findIndex(function (v) { return v !== null; });
    var d = new Array(n).fill(null);
    if (start >= 0) {
      var sub = SMA(k.slice(start), dPeriod);
      for (var i = start; i < n; i++) d[i] = sub[i - start];
    }
    return { k: k, d: d };
  }

  // Williams %R: (HHV−C)/(HHV−LLV)×−100。範囲は−100〜0で、RSV−100と一致
  function WILLIAMS_R(data, period) {
    var h = highs(data), l = lows(data), c = closes(data), n = data.length;
    var out = new Array(n).fill(null);
    for (var i = period - 1; i < n; i++) {
      var hh = -Infinity, ll = Infinity;
      for (var j = i - period + 1; j <= i; j++) { if (h[j] > hh) hh = h[j]; if (l[j] < ll) ll = l[j]; }
      out[i] = hh === ll ? -50 : (hh - c[i]) / (hh - ll) * -100;
    }
    return out;
  }

  // KDJ: RSVをα=1/3の指数平滑で%K、%D、J=3%K−2%D(中国発のストキャスティクス発展形)
  function KDJ(data, period) {
    var h = highs(data), l = lows(data), c = closes(data), n = data.length;
    var k = new Array(n).fill(null), d = new Array(n).fill(null), j = new Array(n).fill(null);
    if (n < period) return { k: k, d: d, j: j };
    var kv = 50, dv = 50;
    for (var i = 0; i < n; i++) {
      if (i >= period - 1) {
        var hh = -Infinity, ll = Infinity;
        for (var m = i - period + 1; m <= i; m++) { if (h[m] > hh) hh = h[m]; if (l[m] < ll) ll = l[m]; }
        var rsv = hh === ll ? 50 : (c[i] - ll) / (hh - ll) * 100;
        kv = (2 * kv + rsv) / 3;
        dv = (2 * dv + kv) / 3;
        k[i] = kv; d[i] = dv; j[i] = 3 * kv - 2 * dv;
      }
    }
    return { k: k, d: d, j: j };
  }

  // スーパートレンド: 基本バンド=(H+L)/2 ± mult×ATR、終値で追従・反転判定
  function SUPERTREND(data, period, mult) {
    var h = highs(data), l = lows(data), c = closes(data), n = data.length;
    var atr = ATR(data, period, "wilder");
    var upper = new Array(n).fill(null), lower = new Array(n).fill(null);
    var line = new Array(n).fill(null), dir = new Array(n).fill(null);
    var fub = null, flb = null, sd = 1;
    for (var i = period; i < n; i++) {
      if (atr[i] === null) continue;
      var mid = (h[i] + l[i]) / 2;
      var bub = mid + mult * atr[i], blb = mid - mult * atr[i];
      fub = (fub !== null && bub < fub || c[i - 1] > fub) ? bub : (fub === null ? bub : fub);
      flb = (flb !== null && blb > flb || c[i - 1] < flb) ? blb : (flb === null ? blb : flb);
      if (c[i] > fub) sd = 1; else if (c[i] < flb) sd = -1;
      upper[i] = fub; lower[i] = flb; dir[i] = sd;
      line[i] = sd === 1 ? flb : fub;
    }
    return { upper: upper, lower: lower, line: line, dir: dir };
  }

  // ケルトナーチャネル: 中心=終値EMA、帯=中心 ± mult×ATR
  function KELTNER(data, emaPeriod, atrPeriod, mult, method) {
    var mid = EMA(closes(data), emaPeriod);
    var atr = ATR(data, atrPeriod, method || "sma");
    var n = data.length;
    var upper = new Array(n).fill(null), lower = new Array(n).fill(null);
    for (var i = 0; i < n; i++) {
      if (mid[i] === null || atr[i] === null) continue;
      upper[i] = mid[i] + mult * atr[i];
      lower[i] = mid[i] - mult * atr[i];
    }
    return { mid: mid, upper: upper, lower: lower };
  }

  // OBV: sign(終値の前日差)×出来高 の累積
  function OBV(data) {
    var c = closes(data), v = vols(data), n = data.length;
    var out = new Array(n).fill(null);
    var acc = 0;
    for (var i = 0; i < n; i++) {
      if (i === 0) { out[i] = 0; continue; }
      if (c[i] > c[i - 1]) acc += v[i];
      else if (c[i] < c[i - 1]) acc -= v[i];
      out[i] = acc;
    }
    return out;
  }

  // Chaikin A/D: 収支比率CLV=((C−L)−(H−C))/(H−L)に出来高を掛けて累積
  function CHAIKIN_AD(data) {
    var h = highs(data), l = lows(data), c = closes(data), v = vols(data), n = data.length;
    var out = new Array(n).fill(null);
    var acc = 0;
    for (var i = 0; i < n; i++) {
      var range = h[i] - l[i];
      var clv = range === 0 ? 0 : ((c[i] - l[i]) - (h[i] - c[i])) / range;
      acc += clv * v[i];
      out[i] = acc;
    }
    return out;
  }

  // TTM Squeeze: ボリンジャーバンドがケルトナーチャネル内に収まる状態をドットで示し、
  // モメンタム(終値 − 典型価のn日SMA、一般的な公開実装の式)でブレイク方向を補助する。
  function TTM(data, bbPeriod, bbSigma, atrPeriod, atrMult) {
    var n = data.length;
    var bb = BOLL(data, bbPeriod, bbSigma);
    var kc = KELTNER(data, bbPeriod, atrPeriod, atrMult, "sma");
    var tp = new Array(n);
    for (var i = 0; i < n; i++) tp[i] = (data[i].high + data[i].low + data[i].close) / 3;
    var tpSMA = SMA(tp, bbPeriod);
    var momentum = new Array(n).fill(null), squeeze = new Array(n).fill(null);
    for (i = 0; i < n; i++) {
      if (tpSMA[i] !== null) momentum[i] = data[i].close - tpSMA[i];
      if (bb.upper[i] !== null && kc.upper[i] !== null) {
        squeeze[i] = (bb.upper[i] <= kc.upper[i] && bb.lower[i] >= kc.lower[i]) ? 1 : 0;
      }
    }
    return { bb: bb, kc: kc, squeeze: squeeze, momentum: momentum };
  }

  // VPA(Volume Price Analysis): スプレッド(値幅)と出来高の組み合わせでバー単位の需給を判定。
  // 買いシグナル: (a)下落傾向中の「狭い実体+高出来高」=売り圧の吸収 (b)高出来高の陽線=蓄積の確認
  // 売りシグナル: (a)上昇傾向中の「狭い実体+高出来高」=上げ疲れ/配分 (b)高出来高の陰線=供給の出現
  // マーカーは買い=当日安値、売り=当日高値に打つ(価格ペイン上で見やすい位置)。
  function VPA(data, period, volMult, bodyRatio) {
    var c = closes(data), n = data.length;
    var v = vols(data);
    var spreads = data.map(function (d) { return d.high - d.low; });
    var volAvg = SMA(v, period), spreadAvg = SMA(spreads, period), priceSMA = SMA(c, period);
    var buy = new Array(n).fill(null), sell = new Array(n).fill(null);
    var volRatio = new Array(n).fill(null);
    for (var i = period; i < n; i++) {
      if (volAvg[i] === null || spreadAvg[i] === null || priceSMA[i] === null) continue;
      var d = data[i];
      var spread = d.high - d.low;
      var body = Math.abs(d.close - d.open);
      if (volAvg[i] === 0 || spreadAvg[i] === 0) continue;
      var vr = d.volume / volAvg[i];
      volRatio[i] = vr;
      if (vr < volMult) continue; // 「努力(出来高)」が平均を大きく上回る日だけ判定する
      var narrowBody = spread > 0 && body / spread <= bodyRatio;
      if (narrowBody) {
        // 結果(値動き)に対して努力(出来高)が見合わない=どちらかの圧力が相殺されている
        if (d.close < priceSMA[i]) buy[i] = d.low;   // 下落中に下がらない=買い圧で吸収
        else if (d.close > priceSMA[i]) sell[i] = d.high; // 上昇中に上がらない=売り圧で抑止
      } else {
        // 出来高を伴ってしっかり動いたバー=その方向への「確認」
        if (d.close > d.open && d.close > c[i - 1]) buy[i] = d.low;
        else if (d.close < d.open && d.close < c[i - 1]) sell[i] = d.high;
      }
    }
    return { buy: buy, sell: sell, volRatio: volRatio };
  }

  // Force Index(Elder): (終値−前日終値)×出来高。短期=RAW、長期=RAWのEMA
  function FORCE_INDEX(data, emaPeriod) {
    var c = closes(data), v = vols(data), n = data.length;
    var raw = new Array(n).fill(null);
    for (var i = 1; i < n; i++) raw[i] = (c[i] - c[i - 1]) * v[i];
    var ema = EMA(raw.map(function (x) { return x === null ? 0 : x; }), emaPeriod);
    // ウォームアップ期間(rawがnullの範囲)はEMAもnullに戻す
    for (var j = 0; j < n; j++) if (raw[j] === null || j < emaPeriod) ema[j] = null;
    return { raw: raw, ema: ema };
  }

  // 2系列のクロス点(GC=上抜け/DC=下抜け)を {golden: [...], dead: [...]} で返す
  function CROSS_POINTS(a, b) {
    var golden = [], dead = [];
    for (var i = 1; i < a.length; i++) {
      if (a[i] === null || b[i] === null || a[i - 1] === null || b[i - 1] === null) continue;
      if (a[i - 1] <= b[i - 1] && a[i] > b[i]) golden.push(i);
      else if (a[i - 1] >= b[i - 1] && a[i] < b[i]) dead.push(i);
    }
    return { golden: golden, dead: dead };
  }

  // Mansfield相対力: RS=(銘柄終値÷ベンチマーク終値)の期間SMA乖離率[%]。
  // 0より上=市場平均を上回る強さ、下=下回る弱さ。Stan Weinstein 流の定番式。
  function MANSFIELD(priceCloses, benchCloses, period) {
    var n = priceCloses.length;
    var out = new Array(n).fill(null);
    if (!benchCloses || benchCloses.length !== n) return out;
    var rs = new Array(n);
    for (var i = 0; i < n; i++) rs[i] = benchCloses[i] === 0 ? 0 : priceCloses[i] / benchCloses[i];
    var ma = SMA(rs, period);
    for (i = 0; i < n; i++) {
      if (ma[i] === null || ma[i] === 0) continue;
      out[i] = (rs[i] / ma[i] - 1) * 100;
    }
    return out;
  }

  global.Indicators = {
    closes: closes, highs: highs, lows: lows, vols: vols,
    SMA: SMA, EMA: EMA, RSI: RSI, RSI_SERIES: RSI_SERIES, STREAK: STREAK, PERCENT_RANK: PERCENT_RANK, CONNORS_RSI: CONNORS_RSI, CCI: CCI, MACD: MACD,
    ADX: ADX, BOLL: BOLL, ATR: ATR, TR: TR, VWMA: VWMA,
    STOCH: STOCH, KDJ: KDJ, WILLIAMS_R: WILLIAMS_R, SUPERTREND: SUPERTREND, KELTNER: KELTNER, OBV: OBV, CHAIKIN_AD: CHAIKIN_AD, TTM: TTM, CROSS_POINTS: CROSS_POINTS, VPA: VPA, FORCE_INDEX: FORCE_INDEX, MANSFIELD: MANSFIELD
  };
})(window);
