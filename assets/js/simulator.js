/* simulator.js — シミュレーター制御。
 * タブ切替・パラメータスライダー(200ms debounce)・データ再生成・
 * 疑似ランダムウォーク/実データモード切替・2ペイン再描画。
 * 詳細ページから ?indicator=rsi のように直接タブを指定できる。
 */
(function () {
  "use strict";

  var N_POINTS = 500; // 疑似モードの生成日数(描画は末尾250点)
  var VIEW = 250;

  var state = {
    mode: "random",          // "random" | "real"
    series: "us_sp500",      // 実データの銘柄
    data: [],                // [{date, open, high, low, close, volume}]
    meta: null,              // 実データのメタ情報
    indicator: "rsi",
    params: {}
  };

  // ---- 指標定義(タブ・スライダー・描画) ----
  // priceMode: "overlay" = 指標を上ペインに重ねる / "separate" = 下ペインに表示
  var DEFS = {
    rsi: {
      label: "RSI",
      params: [{ key: "period", label: "期間", min: 5, max: 50, step: 1, def: 14 }],
      priceMode: "separate",
      fixedY: [0, 100],
      build: function (d, p) {
        var r = Indicators.RSI(d, p.period);
        return {
          ind: [
            Charts.line("RSI(" + p.period + ")", r, "#2563eb", { width: 2 }),
            Charts.line("上限 70", r.map(function () { return 70; }), "#dc2626", { dash: [6, 4], width: 1 }),
            Charts.line("下限 30", r.map(function () { return 30; }), "#16a34a", { dash: [6, 4], width: 1 })
          ],
          indTitle: "RSI(0〜100)"
        };
      }
    },
    cci: {
      label: "CCI",
      params: [{ key: "period", label: "期間", min: 5, max: 50, step: 1, def: 20 }],
      priceMode: "separate",
      build: function (d, p) {
        var r = Indicators.CCI(d, p.period);
        return {
          ind: [
            Charts.line("CCI(" + p.period + ")", r, "#7c3aed", { width: 2 }),
            Charts.line("+100", r.map(function () { return 100; }), "#dc2626", { dash: [6, 4], width: 1 }),
            Charts.line("-100", r.map(function () { return -100; }), "#16a34a", { dash: [6, 4], width: 1 }),
            Charts.line("0", r.map(function () { return 0; }), "#94a3b8", { dash: [2, 4], width: 1 })
          ],
          indTitle: "CCI"
        };
      }
    },
    macd: {
      label: "MACD",
      params: [
        { key: "fast", label: "短期EMA", min: 3, max: 20, step: 1, def: 12 },
        { key: "slow", label: "長期EMA", min: 10, max: 60, step: 1, def: 26 },
        { key: "signal", label: "シグナル", min: 3, max: 20, step: 1, def: 9 }
      ],
      priceMode: "separate",
      build: function (d, p) {
        var m = Indicators.MACD(d, p.fast, p.slow, p.signal);
        var histColor = m.histogram.map(function (v) { return v === null ? "#94a3b8" : (v >= 0 ? "rgba(220,38,38,0.55)" : "rgba(22,163,74,0.55)"); });
        var hist = Charts.bar("ヒストグラム", m.histogram, "#94a3b8");
        hist.backgroundColor = histColor;
        return {
          ind: [
            hist,
            Charts.line("MACD(" + p.fast + "," + p.slow + ")", m.macd, "#2563eb", { width: 2 }),
            Charts.line("シグナル(" + p.signal + ")", m.signal, "#dc2626", { width: 1.6 })
          ],
          indTitle: "MACD / シグナル / ヒストグラム"
        };
      }
    },
    adx: {
      label: "ADX",
      params: [{ key: "period", label: "期間(Wilder固定)", min: 5, max: 30, step: 1, def: 14 }],
      priceMode: "separate",
      fixedY: [0, 100],
      build: function (d, p) {
        var r = Indicators.ADX(d, p.period);
        return {
          ind: [
            Charts.line("ADX(" + p.period + ")", r.adx, "#0f172a", { width: 2.2 }),
            Charts.line("+DI", r.pdi, "#dc2626", { width: 1.4 }),
            Charts.line("-DI", r.ndi, "#16a34a", { width: 1.4 }),
            Charts.line("25(トレンド判定目安)", r.adx.map(function () { return 25; }), "#94a3b8", { dash: [6, 4], width: 1 })
          ],
          indTitle: "ADX / +DI / -DI(0〜100)"
        };
      }
    },
    boll: {
      label: "BOLL",
      params: [
        { key: "period", label: "期間", min: 5, max: 50, step: 1, def: 20 },
        { key: "sigma", label: "σ倍率", min: 0.5, max: 4, step: 0.1, def: 2.0 }
      ],
      priceMode: "overlay",
      build: function (d, p) {
        var b = Indicators.BOLL(d, p.period, p.sigma);
        var width = b.mid.map(function (m, i) { return m === null ? null : (b.upper[i] - b.lower[i]) / m * 100; });
        return {
          price: [
            Charts.line("±" + p.sigma + "σ", b.upper, "#f59e0b", { dash: [6, 4], width: 1.4 }),
            Charts.line("中心線 SMA(" + p.period + ")", b.mid, "#dc2626", { width: 1.4 }),
            Charts.line("-" + p.sigma + "σ", b.lower, "#f59e0b", { dash: [6, 4], width: 1.4 })
          ],
          ind: [Charts.line("バンド幅(%)", width, "#7c3aed", { width: 1.8 })],
          indTitle: "バンド幅 (上−下)/中心 ×100 [%]"
        };
      }
    },
    atr: {
      label: "ATR",
      params: [
        { key: "period", label: "期間", min: 5, max: 30, step: 1, def: 14 },
        { key: "method", label: "平滑化", type: "select", options: [["sma", "SMA"], ["wilder", "Wilder"]], def: "wilder" }
      ],
      priceMode: "separate",
      build: function (d, p) {
        var r = Indicators.ATR(d, p.period, p.method);
        return {
          ind: [Charts.line("ATR(" + p.period + ", " + (p.method === "sma" ? "SMA" : "Wilder") + ")", r, "#0891b2", { width: 2 })],
          indTitle: "ATR(価格と同じ単位の日次変動幅)"
        };
      }
    },
    vwma: {
      label: "VWMA",
      params: [
        { key: "period", label: "VWMA期間", min: 5, max: 60, step: 1, def: 20 },
        { key: "smaPeriod", label: "比較SMA期間", min: 5, max: 60, step: 1, def: 20 }
      ],
      priceMode: "overlay",
      build: function (d, p) {
        var r = Indicators.VWMA(d, p.period, p.smaPeriod);
        var v = Indicators.vols(d);
        return {
          price: [
            Charts.line("SMA(" + p.smaPeriod + ")", r.sma, "#f59e0b", { width: 1.6 }),
            Charts.line("VWMA(" + p.period + ")", r.vwma, "#dc2626", { width: 2 })
          ],
          ind: [Charts.bar("出来高(疑似)", v, "#94a3b8")],
          indTitle: "出来高(※終値由来の疑似生成)"
        };
      }
    }
  };
  var ORDER = ["rsi", "cci", "macd", "adx", "boll", "atr", "vwma"];

  // ---- debounce(約200ms) ----
  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 200);
    };
  }

  // ---- データ取得 ----
  function loadData() {
    var notice = document.getElementById("data-notice");
    if (state.mode === "random") {
      state.data = DataModule.generateRandomWalk(N_POINTS, {});
      state.meta = null;
      notice.textContent = "疑似ランダムウォークデータ(ランダム生成)を使用中。再生成すると別系列になります。";
      notice.style.display = "block";
      render();
    } else {
      notice.textContent = "実データ読み込み中…";
      DataModule.loadSeries("data/series/" + state.series + ".json").then(function (r) {
        state.data = r.data;
        state.meta = r.meta;
        notice.innerHTML = "実データモード:「" + r.meta.name + "」(出典: " + r.meta.source +
          ")の日次終値を使用中。<b>High/Low/出来高は終値から疑似生成しているため</b>、ATR/CCI/ADX/BOLL/VWMAなどの水準は参考値です。";
        notice.style.display = "block";
        render();
      }).catch(function (e) {
        notice.textContent = "読み込みエラー: " + e.message + "(HTTPサーバー経由で開いてください)";
      });
    }
  }

  // ---- 描画 ----
  function currentView() {
    return DataModule.tail(state.data, VIEW);
  }

  function render() {
    var def = DEFS[state.indicator];
    var p = state.params[state.indicator];
    var d = currentView();
    if (state.mode === "real") {
      // 実データは基準=100の%表示。BOLL/VWMAなど上ペイン重ね指標と
      // 価格のスケールがズレないよう、指標計算に使うOHLCも先に100倍する。
      d = d.map(function (x) {
        return { date: x.date, open: x.open * 100, high: x.high * 100, low: x.low * 100, close: x.close * 100, volume: x.volume };
      });
    }
    var labels = d.map(function (x) { return x.date; });
    var closes = d.map(function (x) { return x.close; });
    var unit = state.mode === "real" ? "基準=100" : "円";

    var priceDs = [];
    var indDs = [];
    var priceTitle, indTitle = def.label;

    if (def.priceMode === "overlay") {
      var built = def.build(d, p);
      priceDs = [Charts.line("終値", closes, "#2563eb", { width: 1.6 })].concat(built.price);
      priceTitle = "終値(" + unit + ")と指標";
      indDs = built.ind; indTitle = built.indTitle;
    } else {
      priceDs = [Charts.line("終値(" + unit + ")", closes, "#2563eb", { width: 1.6 })];
      priceTitle = "終値";
      var sep = def.build(d, p);
      indDs = sep.ind; indTitle = sep.indTitle;
    }

    var charts = Charts.create("priceChart", "indicatorChart", labels, priceDs, indDs, priceTitle, indTitle);
    if (def.fixedY) {
      charts.indicator.options.scales.y.min = def.fixedY[0];
      charts.indicator.options.scales.y.max = def.fixedY[1];
      charts.indicator.update();
    }
  }

  var renderDebounced = debounce(render, 200);

  // ---- UI構築 ----
  function buildTabs() {
    var box = document.getElementById("tabs");
    box.innerHTML = "";
    ORDER.forEach(function (key) {
      var btn = document.createElement("button");
      btn.textContent = DEFS[key].label;
      btn.dataset.key = key;
      btn.className = key === state.indicator ? "active" : "";
      btn.addEventListener("click", function () { selectIndicator(key); });
      box.appendChild(btn);
    });
  }

  function selectIndicator(key) {
    state.indicator = key;
    Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (b) {
      b.className = b.dataset.key === key ? "active" : "";
    });
    renderExplain(key);
    buildParams();
    render();
  }

  // ---- 解説パネル(content.js のコンテンツを描画) ----
  function renderExplain(key) {
    var c = window.IndicatorContent[key];
    var box = document.getElementById("explain");
    document.getElementById("explain-title").textContent = c.title;

    var html = "";
    html += '<p><span class="tag">' + c.tag + '</span></p>';
    html += '<p class="lead">' + c.lead + '</p>';
    html += '<h2>計算式</h2><div class="formula">' + escapeHtml(c.formula) + '</div>';
    html += '<p>' + c.explain + '</p>';
    html += '<h2>' + c.cmp.caption + '</h2><div class="table-scroll"><table class="cmp">';
    html += "<tr>" + c.cmp.headers.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr>";
    c.cmp.rows.forEach(function (r) {
      html += "<tr><th>" + r[0] + "</th>";
      if (r.length === 2) {
        html += '<td colspan="' + (c.cmp.headers.length - 1) + '">' + r[1] + "</td>";
      } else {
        html += r.slice(1).map(function (cell) { return "<td>" + cell + "</td>"; }).join("");
      }
      html += "</tr>";
    });
    html += "</table></div>";
    html += '<h2>よくある誤解</h2><div class="card"><p style="margin:0">' + c.myth + "</p></div>";
    box.innerHTML = html;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function buildParams() {
    var def = DEFS[state.indicator];
    var box = document.getElementById("params");
    box.innerHTML = "";
    if (!state.params[state.indicator]) {
      var init = {};
      def.params.forEach(function (pd) { init[pd.key] = pd.def; });
      state.params[state.indicator] = init;
    }
    var p = state.params[state.indicator];
    def.params.forEach(function (pd) {
      var div = document.createElement("div");
      div.className = "param";
      var lab = document.createElement("label");
      var name = document.createElement("span");
      name.textContent = pd.label;
      var val = document.createElement("span");
      val.className = "val";
      val.textContent = fmtVal(p[pd.key], pd);
      lab.appendChild(name); lab.appendChild(val);
      div.appendChild(lab);
      var input;
      if (pd.type === "select") {
        input = document.createElement("select");
        pd.options.forEach(function (opt) {
          var o = document.createElement("option");
          o.value = opt[0]; o.textContent = opt[1];
          input.appendChild(o);
        });
        input.value = p[pd.key];
        input.addEventListener("change", function () {
          p[pd.key] = input.value;
          renderDebounced();
        });
      } else {
        input = document.createElement("input");
        input.type = "range";
        input.min = pd.min; input.max = pd.max; input.step = pd.step;
        input.value = p[pd.key];
        input.addEventListener("input", function () {
          p[pd.key] = parseFloat(input.value);
          // VWMAの比較SMA期間は、ユーザーが未着手ならVWMA期間と連動
          if (state.indicator === "vwma" && pd.key === "period" && !vwmaSmaTouched) {
            p.smaPeriod = p.period;
            buildParams();
          }
          if (state.indicator === "vwma" && pd.key === "smaPeriod") vwmaSmaTouched = true;
          val.textContent = fmtVal(p[pd.key], pd);
          renderDebounced();
        });
      }
      div.appendChild(input);
      box.appendChild(div);
    });
  }
  var vwmaSmaTouched = false;

  function fmtVal(v, pd) {
    if (pd.type === "select") return v === "sma" ? "SMA" : "Wilder";
    return pd.step < 1 ? Number(v).toFixed(1) : String(v);
  }

  function init() {
    // クエリ ?indicator=rsi で初期タブ指定
    var q = new URLSearchParams(location.search).get("indicator");
    if (q && DEFS[q]) state.indicator = q;

    buildTabs();
    renderExplain(state.indicator);
    buildParams();

    document.getElementById("mode").addEventListener("change", function (e) {
      state.mode = e.target.value;
      document.getElementById("series-wrap").style.display = state.mode === "real" ? "" : "none";
      loadData();
    });
    document.getElementById("series").addEventListener("change", function (e) {
      state.series = e.target.value;
      loadData();
    });
    document.getElementById("regen").addEventListener("click", function () {
      loadData();
    });

    loadData();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
