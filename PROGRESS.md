# PROGRESS.md -- 機能キュー・進捗トラッカー

## 現在の状態

**ベースライン**: インフラ初期化完了
（リポジトリ構造・ドキュメント・Makefile・backend スケルトン・frontend Vite 雛形）

**直近の verify**: 未実施。最初のタスクで `make init && make verify-all` を通す。

## 既知の問題

- `frontend/` に Tailwind CSS 未導入（タスク T02 で追加）
- Gemini API キー (`GEMINI_API_KEY`) の動作確認未実施
- frontend に vitest 未導入（`make test` は backend のみ実行）

## タスクキュー

凡例: `[ ]` Todo / `[~]` In Progress / `[x]` Done

### Phase 0: ベースライン疎通

- [ ] **T01**: `make init` で全依存関係インストール、`make verify-all` がグリーン
  - 検証基準: `/api/health` が 200 を返す（手動 `curl` で確認）、frontend `vite build` が成功、pytest がグリーン
- [ ] **T02**: フロントに Tailwind CSS v4 を導入し、`@import "tailwindcss"` を有効化
  - 検証基準: 任意の Tailwind クラスが効くサンプル要素で確認

### Phase 1: 画面 1 (テーマ入力)

- [ ] **T11**: テーマ入力フォーム + 登場人物選択 UI
  - 検証基準: 選択結果を State JSON にまとめて表示できる
- [ ] **T12**: 画面 1 から画面 2 への遷移と State 引き継ぎ
  - 検証基準: 入力した State が画面 2 で参照可能

### Phase 2: 画面 2 (討論 + 介入)

- [ ] **T21**: 横並びステージ演出 UI（登場人物カード + 中央吹き出し）
  - 検証基準: モック State で 2 ターン分の発話が表示される
- [ ] **T22**: 過去ログの隠蔽型スライドインパネル
  - 検証基準: トグルでログ表示 / 非表示が切り替わる
- [ ] **T23**: 介入ボタン群（反論・質問・観点追加）と入力モーダル
  - 検証基準: 介入内容が State の `interventions` に追記される
- [ ] **T24**: バック `/api/next_turn` 実装（State 受け取り → Gemini 呼び出し → 次ターン生成 → State 返却）
  - 検証基準: pytest で固定 State から JSON 構造が返ることを確認
- [ ] **T25**: ユーザー介入時の割り込みプロンプト処理
  - 検証基準: 介入後の次ターンが介入を踏まえた応答になる（手動確認）

### Phase 3: 画面 3 (結論)

- [ ] **T31**: バック `/api/summarize` 実装（全履歴 → リポート JSON 生成）
  - 検証基準: pytest で構造化レポート (Before/After/Praise) が返る
- [ ] **T32**: 結論画面 UI（巨大ジレンマ表示、Before/After、介入称賛、シェア導線）
  - 検証基準: T31 のレスポンスを表示できる

### Phase 4: E2E 統合

- [ ] **T41**: 画面 1 → 2 → 3 のエンドツーエンドシナリオテスト
  - 検証基準: 1 シナリオを通しで実行し、State が破綻しない

## セッションログ

セッション終了時にこのセクションへ追記する。

- `YYYY-MM-DD`: TBD

## ハンドオフメモ

次セッションが最初に読むべきメモ:

- まずは T01 から。`make init` で全 deps を入れ、`make verify-all` がグリーンになることを確認する
