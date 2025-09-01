# handover.md（引き継ぎノート・雛形）

> 目的：チャットを切り替える時に**必要最小限の文脈**を引き継ぐ。  
> 本ファイルは毎回**上書き更新**し、最新版だけを維持します。履歴は Git のコミットで追跡。

## メタ
- プロジェクト: <PROJECT_NAME>
- フェーズ: <PHASE_NAME>（例: Phase 2 → 3）
- 参照ブランチ: `<branch>`
- 参照コミット(SHA): `<commit_sha>`
- 作成日: <YYYY-MM-DD>
- 作成者: <AUTHOR>

## 現状サマリ
- 達成: （例）インポート/エクスポート安定化、UI 仕上げ
- 未解決: （例）Drive 同期で 401、リトライ/ロック未導入
- リスク/注意: （例）Service Worker のキャッシュ更新タイミング

## 次の一手（3つまで）
- [ ] ①
- [ ] ②
- [ ] ③

## 重要ファイル（最新版は Git を参照）
- `/index.html`
- `/assets/js/drive/sync.js`
- `/assets/js/drive/http.js`
- `/assets/css/style.css`

## 差分依頼は PATCH_GUIDE.md に準拠
次チャットでは冒頭に **「このプロジェクトは PATCH_GUIDE.md 準拠」** と宣言してください。

### 例：差分依頼（INSERT）
```
対象: assets/js/drive/sync.js
範囲: function syncAll()
アンカー: const result = await fetch(
出現番号: 1つ目
位置: BEFORE
挿入コード:
<コードブロック>
セーフティ: 複数一致 / 未検出は STOP
```

## 作業ログ（軽量）
- <YYYY-MM-DD> : <短い一行ログ>

## 参照リンク
- GitHub: <https://github.com/<owner>/<repo>>
- Issue/PR: <URL or #-refs>
- 関連ドキュメント: `architecture.md`, `runbook.md`, `PATCH_GUIDE.md`
