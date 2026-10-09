/* charts.js — 上下2ペインのChart.js管理。
 * 上ペイン: 価格(BOLL/VWMAは指標を重ねる)
 * 下ペイン: RSI/CCI/MACD/ADX/ATR等の指標
 * 2つのcanvasは別インスタンスで、hover位置とtooltip、x軸範囲を連動させる。
 */
(function (global) {
  "use strict";

  var priceChart = null, indicatorChart = null, linking = false;

  function baseOpts(yTitle) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", labels: { boxWidth: 14, font: { size: 11 } } },
        tooltip: { enabled: true }
      },
      scales: {
        x: {
          type: "category",
          ticks: { maxTicksLimit: 8, font: { size: 10 } },
          grid: { display: false }
        },
        y: { title: { display: !!yTitle, text: yTitle || "", font: { size: 11 } } }
      }
    };
  }

  // hover / tooltip の連動:一方でhoverすると他方も同じx位置を示す
  function linkHover(self, other) {
    return function (evt, els, chart) {
      if (linking) return;
      linking = true;
      try {
        var points = chart.getElementsAtEventForMode(evt, "index", { intersect: false }, true);
        if (points.length && other) {
          var p = points[0];
          other.setActiveElements([{ datasetIndex: p.datasetIndex, index: p.index }]);
          other.tooltip.setActiveElements([{ datasetIndex: p.datasetIndex, index: p.index }], { x: 0, y: 0 });
          other.update("none");
        }
      } finally { linking = false; }
    };
  }

  // x軸表示範囲の連動(一方のpan/zoom等でmin/maxが変わったら他方に反映)
  function linkScales(a, b) {
    ["a", "b"].forEach(function (key, idx) {
      var chart = idx === 0 ? a : b, other = idx === 0 ? b : a;
      var orig = chart.options.scales.x.afterSetDimensions;
      chart.options.scales.x.afterSetDimensions = function (scale) {
        if (orig) orig.call(this, scale);
        if (linking || !other) return;
        // Chart.jsはフックにスケールを引数で渡す(thisはundefinedになりうる)
        var x = scale || this;
        // 相手ペインのxスケールが未初期化、または自分のmin/maxが未確定のタイミングは何もしない
        if (!x || typeof x.min !== "number" || typeof x.max !== "number") return;
        if (!other.scales || !other.scales.x) return;
        var mine = x.min + "-" + x.max;
        var theirs = other.scales.x.min + "-" + other.scales.x.max;
        if (mine !== theirs) {
          linking = true;
          other.options.scales.x.min = x.min;
          other.options.scales.x.max = x.max;
          other.update("none");
          linking = false;
        }
      };
    });
  }

  // 2ペイン生成。priceDatasets / indicatorDatasets は Chart.js dataset 配列。
  function create(priceCanvasId, indicatorCanvasId, labels, priceDatasets, indicatorDatasets, priceTitle, indicatorTitle) {
    destroy();
    var pctx = document.getElementById(priceCanvasId).getContext("2d");
    var ictx = document.getElementById(indicatorCanvasId).getContext("2d");
    var popts = baseOpts(priceTitle), iopts = baseOpts(indicatorTitle);
    popts.onHover = function (e, els, c) { linkHover(c, indicatorChart)(e, els, c); };
    iopts.onHover = function (e, els, c) { linkHover(c, priceChart)(e, els, c); };
    priceChart = new Chart(pctx, { type: "line", data: { labels: labels, datasets: priceDatasets }, options: popts });
    indicatorChart = new Chart(ictx, { type: "line", data: { labels: labels, datasets: indicatorDatasets }, options: iopts });
    linkScales(priceChart, indicatorChart);
    return { price: priceChart, indicator: indicatorChart };
  }

  function update(labels, priceDatasets, indicatorDatasets) {
    if (!priceChart) return;
    priceChart.data.labels = labels;
    priceChart.data.datasets = priceDatasets;
    priceChart.update();
    indicatorChart.data.labels = labels;
    indicatorChart.data.datasets = indicatorDatasets;
    indicatorChart.update();
  }

  function destroy() {
    if (priceChart) { priceChart.destroy(); priceChart = null; }
    if (indicatorChart) { indicatorChart.destroy(); indicatorChart = null; }
  }

  // dataset ヘルパー
  function line(label, data, color, opts) {
    opts = opts || {};
    return {
      type: "line", label: label, data: data,
      borderColor: color, backgroundColor: opts.fill ? hexA(color, 0.08) : color,
      borderWidth: opts.width || 1.6, pointRadius: 0, tension: 0,
      fill: !!opts.fill, borderDash: opts.dash || [], yAxisID: "y",
      spanGaps: false
    };
  }
  function bar(label, data, color) {
    return { type: "bar", label: label, data: data, backgroundColor: hexA(color, 0.55), borderColor: color, borderWidth: 1, yAxisID: "y" };
  }
  function hexA(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  function scalePct(data) {
    // 終値を先頭値で正規化して%表示するための変換
    var base = null;
    return data.map(function (c) { if (base === null && c != null) base = c; return base === null ? null : (c / base - 1) * 100; });
  }

  global.Charts = { create: create, update: update, destroy: destroy, line: line, bar: bar, hexA: hexA, scalePct: scalePct };
})(window);
