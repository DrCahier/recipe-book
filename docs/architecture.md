# architecture.md（アーキテクチャ・雛形）

> 目的：**どこに何があるか**／**どう繋がっているか**を一目で把握する。

## システム概要
- 目的: <one-liner>
- 技術: <HTML/CSS/JS(Vite)/Drive API etc.>
- 依存: <外部API/SDK/ライブラリ>

## ディレクトリ構造（抜粋）
```
/ (root)
├─ index.html
├─ assets/
│  ├─ js/
│  │  ├─ drive/
│  │  │  ├─ sync.js      # 差分検出・同期キュー
│  │  │  └─ http.js      # API呼び出し
│  │  └─ ui/
│  │     └─ ...
│  └─ css/
│     └─ style.css
└─ docs/
   ├─ handover.md
   ├─ architecture.md
   ├─ runbook.md
   └─ PATCH_GUIDE.md
```

## モジュールの責務
- `drive/sync.js` : ローカル⇆Drive の同期、コンフリクト処理
- `drive/http.js` : 認証・再試行・HTTPラッパ
- `ui/*` : 入出力、状態表示

## データフロー（ざっくり）
UI → sync(queue) → http(fetch) → Drive  
Drive → http → sync(apply) → UI

## 設定/秘密情報
- `.env` : `DRIVE_CLIENT_ID` / `DRIVE_API_KEY` など（コミット禁止）
- 設定例は `.env.sample` を参照

## ビルド/起動
- セットアップ: `npm i`
- 開発起動: `npm run dev`
- ビルド: `npm run build`
- 静的配信: `/dist` 配下

## 決定記録（任意）
- ADR-001: 同期戦略の選定（概要）
- ADR-002: 認証フロー（GIS vs OAuth 等）
