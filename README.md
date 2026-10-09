# テクニカル指標学習アプリ (tti)

7つのテクニカル指標(RSI・CCI・MACD・ADX・BOLL・ATR・VWMA)を「目的別に整理して理解する」ためのインタラクティブな学習用Webアプリ。

## ページ構成

| ファイル | 内容 |
|---|---|
| `index.html` | 分類ダッシュボード(7指標をトレンド系・オシレーター系・ボラティリティ系の3カテゴリで表示。VWMAは移動平均系の性質が強いためトレンド系に分類) |
| `simulator.html` | シミュレーター。タブで指標を切替、`?indicator=rsi` のように直接指定も可。各指標の解説(計算式・比較表・よくある誤解)は折りたたみパネルに表示 |

ダッシュボードの各カードから `simulator.html?indicator=<key>` へ直接遷移する。

## シミュレーター

- 疑似ランダムウォーク生成モード(デフォルト)と実データモード(S&P500・TOPIX等の日次終値、`data/series/`)を切り替え可能
- High/Low/出来高は終値から疑似生成する(VWMA/ATR/BOLLなどの精度上の注意をUIに注記)
- パラメータをスライダーで変更すると指標ラインがリアルタイム変化(debounce 200ms)
- 2ペイン構成のChart.jsチャート(価格 + 指標、hover連動)
- 補助ライン(シグナルライン、ヒストグラム、±2σ、±DI、比較SMAなど)をすべて表示
- 解説パネルに各指標の計算式・比較表(RSI vs CCI / BOLL vs ATR / MACD vs ADX / VWMA vs SMA)・「よくある誤解」を表示(コンテンツは `assets/js/content.js`)

## 起動方法

このアプリはHTTP配信前提で、`file://` では実データモード(fetchによるJSON読み込み)とCDNのChart.jsが動作しません。プロジェクトルート(`/home/masasikatano/project/tti/`)で次のいずれかを実行してください。

**Pythonがある場合(推奨):**

```bash
cd /home/masasikatano/project/tti
python3 -m http.server 8000
```

**Node.jsがある場合:**

```bash
cd /home/masasikatano/project/tti
npx serve .
```

その後ブラウザで `http://localhost:8000/` を開き、トップページ `index.html`(ダッシュボード)が表示されます。

## 技術構成

- 純粋なHTML/CSS/JS(フレームワーク・ビルドツール不使用)
- Chart.js はCDNから読み込み
- `assets/css/style.css` — ハンドメイドCSS
- `assets/js/`
  - `indicators.js` — SMA/EMA と7指標の計算
  - `charts.js` — 2ペイン連動チャート
  - `data.js` — 疑似ランダムウォーク生成・実データ読み込み
  - `content.js` — 各指標の解説コンテンツ(計算式・比較表・誤解)
  - `simulator.js` — タブ・スライダー・データモード制御と描画
- 日本語UI・レスポンシブ対応
- HTTP配信前提(GitHub Pages公開予定)。`file://` では開かない想定
