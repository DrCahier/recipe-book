<?php
// index.php（プロジェクトのトップ。index.html と同じ場所）
// ここで“レスポンスヘッダー”をサーバ側から付ける
header('Cross-Origin-Opener-Policy: same-origin-allow-popups');
header('Cross-Origin-Embedder-Policy: unsafe-none');
?>
<!doctype html>
<html lang="ja">
<head>
    <meta charset="utf-8">
    <title>レシピアプリ</title>
    <!-- ↓以下、いま使ってる index.html の <head> 内容を丸ごと貼り付け -->
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="manifest" href="/manifest.json">
    <link rel="stylesheet" href="/assets/css/style.css">
    <!-- 必要な <script> もこのまま -->
</head>
<body>
<!-- ↓ここに、いまの index.html の <body> を丸ごと貼り付け -->
<!-- 例：Driveに接続ボタン、各種UIなど -->
<button id="drive-connect">Driveに接続</button>
<button id="drive-pick-folder">保存先フォルダ</button>
<button id="drive-sync">Driveと同期</button>
<div id="drive-result"></div>

<!-- JSはこれまで通り。app.js は defer でOK -->
<script type="module" src="/assets/js/app.js" defer></script>
</body>
</html>
