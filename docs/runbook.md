# runbook.md（運用手順・雛形）

> 目的：**未来の自分**が最短で動かし、トラブルに対処できるようにする。

## セットアップ
1. Node をインストール（バージョン固定なら記載）
2. 依存を導入：`npm i`
3. `.env` を作成（`.env.sample` をコピーして値を埋める）
4. `npm run dev` で起動、`http://localhost:5173` を開く

## よく使う操作
- 全同期: DevTools で `Drive.syncAll()` を実行
- 認証更新: `Drive.auth.refresh()`
- ログ閲覧: DevTools Console / Network

## リリース手順（例）
1. `main` を更新し `npm run build`
2. `/dist` を配信先へアップロード
3. キャッシュバスティング確認（SW/HTTPキャッシュ）

## トラブルシュート
| 症状 | よくある原因 | 対処 |
|---|---|---|
| 401 認証エラー | セッション失効/アカウント違い | 再ログイン → `Drive.auth.refresh()` → 再試行 |
| CORS/COEP | サーバ設定不足 | 追加ヘッダ設定 or 相対パス統一 |
| SWが古い | 更新待ち | DevTools > Application > Unregister → Hard Reload |

## バックアップ/ロールバック
- Git のタグ `release-YYYYMMDD` を作成
- 問題時は直前タグへ戻して再配信

## 用語
- **handover**: チャット跨ぎのための要約ファイル
- **PATCH_GUIDE**: 差分の安全適用ルール
