# PATCH_GUIDE.md（全プロジェクト共通の差分指示ルール）

## 目的
行番号に頼らず、**検索できる目印（アンカー）**で場所を一意に特定し、壊さず安全に差分を適用する。

## 用語
- **ファイル**: 変更対象のパス
- **範囲（スコープ）**: 関数名/クラス名/HTMLセクションなど「この中で探す」囲い
- **アンカー**: 検索で一意に見つけるための**既存の1行**（完全一致推奨）
- **出現番号**: 同じアンカーが複数ある時の指定（`1つ目 / 2つ目 / 最後`）
- **位置**: `BEFORE / AFTER / REPLACE / REPLACE_RANGE / DELETE`

---

## 依頼フォーマット（コピペして使う）

### 1) 追加（INSERT）
```
対象: <path/to/file.js>
範囲: function <name>(...)  // 例: function syncAll()
アンカー: <existing line text>  // 例: const result = await fetch(
出現番号: 1つ目            // 2つ目 / 最後 でも可
位置: BEFORE               // または AFTER
挿入コード:
<コードブロック>
セーフティ: アンカーが見つからない/複数曖昧なら STOP して選択肢を提示
```

### 2) 置換（REPLACE）
```
対象: <path/to/file.js>
範囲: function <name>(...)
アンカー: <existing line text>
位置: REPLACE
置換コード:
<コードブロック>
セーフティ: アンカーが複数なら STOP
```

### 3) 範囲置換（REPLACE_RANGE）
```
対象: <path/to/file.js>
範囲: function <name>(...)
範囲開始: <start line text>   // 例: const resp = await fetch(
範囲終了: <end line text>     // 例: return await resp.json();
位置: REPLACE_RANGE
置換コード:
<コードブロック>
セーフティ: 開始/終了は各1回だけに一致しない場合 STOP
```

### 4) 削除（DELETE）
```
対象: <path/to/file.js>
範囲: function <name>(...)
アンカー: <existing line text>
位置: DELETE
セーフティ: 曖昧なら STOP
```

---

## 返答の期待フォーマット（AIからの返答はこう返ってくる）
```
確認:
- ファイル: ...
- 範囲: ...（行 40–120）
- アンカー: "...（行 78, 出現 1/1）"

適用:
- 行78の直後（AFTER）に以下を挿入してください

<コードブロック>

備考:
- アンカーが見つからない場合は中断してください（STOP）
```

---

## セーフティ（絶対に壊さないための約束）
- **曖昧なら STOP**（AI側が勝手に別候補へ挿入しない）
- いつでも**出現番号**で一意化（`1つ目/2つ目/最後`）
- どうしても迷う箇所は、**コミットSHA＋行番号**をフォールバックで指定  
  例: `代替: commit=9f2c1a7 の 112行目の直後`

---

## アンカーの選び方（JS向け）
- 関数宣言：`export async function syncAll(`  
- 明確な定数：`const DRIVE_LOCK_KEY = "drive-lock"`  
- 特定の1行：`const result = await fetch(`  
- 置換/範囲用：開始行と終了行を**そのまま1行コピー**して指定

※ **相対表現（上の方/最初あたり/const集のあと）は禁止**。必ず**検索できる文字列**で。

---

## アンカーコメント（任意の上級オプション）
長期的に何度も触る“ホットスポット”には、一度だけ**標識コメント**を入れると以後が楽。

**導入依頼の例（初回だけ実施）**
```
対象: assets/js/drive/sync.js
範囲: function syncAll()
アンカー: export async function syncAll(
位置: BEFORE
挿入コード:
<// @anchor:syncAll:begin>
続けて、関数定義の終わりの直前に:
<// @anchor:syncAll:end>
セーフティ: うまく見つからなければ STOP
```

以後の差分依頼は：
```
アンカー: @anchor:syncAll:begin
位置: AFTER
```

**命名規則**：`@anchor:<領域名>:<用途>`（半角英数・一意）

---

## Git運用（確実に“同じもの”を見る）
- フェーズの区切りで **commit & push**  
- `handover.md` に **参照SHA** を記録  
- 指示は「まずアンカー」、曖昧/不一致時は **`commit=<SHA> の <行番号>`** でフォールバック  
- 「最新（ブランチ先頭）」は稀に反映遅延あり → **厳密時は SHA 固定**

---

## ミニチートシート
- **INSERT**：`アンカー + BEFORE/AFTER + 挿入コード`  
- **REPLACE**：`アンカー + REPLACE + 置換コード`  
- **REPLACE_RANGE**：`範囲開始 + 範囲終了 + 置換コード`  
- **曖昧対処**：`出現番号` or `SHA+行番号`  
- **禁止語**：最初らへん／上の方／なるべく上 等の相対表現

---

### サンプル（実運用で一発OK）
```
対象: assets/js/drive/sync.js
範囲: function syncAll()
アンカー: const result = await fetch(
出現番号: 1つ目
位置: BEFORE
挿入コード:
<console.time("syncAll");>
セーフティ: 複数一致または未検出なら STOP
```
