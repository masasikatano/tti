# GitHub Pages での公開方法

このプロジェクト(`index.html` / `simulator.html` を含む静的サイト)を GitHub Pages で公開する手順です。

## 前提条件

- GitHub アカウントを持っていること
- リポジトリが GitHub にプッシュ済みであること(まだの場合は下記の「リポジトリの作成とプッシュ」を先に行ってください)

## 方法 1: リポジトリの設定から公開(簡単)

1. GitHub でリポジトリのページを開き、**Settings** をクリック
2. 左メニューの **Pages** を選択
3. **Source** で `Deploy from a branch` を選択
4. **Branch** で `main`(または `master`)と `/ (root)` を選択し **Save**
5. 数分待つと `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます

## 方法 2: GitHub Actions で公開

`main` ブランチへのプッシュをトリガーに自動デプロイする場合:

1. Settings → Pages の **Source** を `GitHub Actions` に変更
2. リポジトリに `.github/workflows/pages.yml` を作成:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .
      - uses: actions/deploy-pages@v4
```

3. `main` にプッシュすると自動でデプロイされます

## リポジトリの作成とプッシュ(まだの場合)

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/<ユーザー名>/<リポジトリ名>.git
git push -u origin main
```

## 補足

- トップページは `index.html` なので、`https://<ユーザー名>.github.io/<リポジトリ名>/` を開くとそのまま表示されます
- `simulator.html` は `https://<ユーザー名>.github.io/<リポジトリ名>/simulator.html` でアクセスできます
- サイトが表示されるまで数分かかることがあります。反映されない場合はブラウザのキャッシュをクリアしてください
- ユーザー名と同じ名前のリポジトリ(`<ユーザー名>.github.io`)にプッシュすると、`https://<ユーザー名>.github.io/` 直下で公開されます
