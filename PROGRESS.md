### `progress.md` (技術仕様・進捗・タスク)

```markdown
# PROGRESS.md -- アーキテクチャ・機能キュー・進捗トラッカー

## 1. Tech Stack & Processing Architecture

本プロジェクトは、複雑なマルチエージェントフレームワーク（LangGraph等）を**使用しない**。すべての状態管理と構造化データ生成は、単一のJSON Stateを介してGemini APIに直接委ねるシンプルなアーキテクチャとする。

* **Frontend:** React, Next.js (or Vite), Tailwind CSS v4, Framer Motion
* **Backend:** Node.js / Python API (Gemini APIのラッピング)
* **Core Mechanisms:**
    * **Gemini API Structured Output:** `/api/next_turn` や `/api/summarize` エンドポイントでは、過去の全ログ（State）をGeminiに渡し、JSONスキーマを強制して次の発言や構造マップを一撃で生成させる。
    * **Dynamic Avatar Generation Pipeline (人物追加機能):**
        ユーザーが任意の人物名を追加した際、以下のフローで画像を動的生成・透過処理してUIに反映する。
        1. ユーザーが名前を入力（例：「織田信長」）。
        2. バックエンドがGemini (Search Grounding等) を用いて、その人物の最適なビジュアルリファレンス（画像検索結果）を取得。
        3. 取得したリファレンスを元に、画像生成API (Nanobanana等) を叩き、アバター画像を生成。
        4. 生成された画像の背景透過処理を実行。
        5. FrontendへURLを返し、Screen 1のステージ（横並び）に新規追加。

---

## 2. 現在の状態

**ベースライン**: インフラ初期化完了
（リポジトリ構造・ドキュメント・Makefile・backend スケルトン・frontend Vite 雛形）

**直近の verify**: 未実施。最初のタスクで `make init && make verify-all` を通す。

## 3. 既知の問題
- `frontend/` に Tailwind CSS 未導入（タスク T02 で追加）
- Gemini API キー (`GEMINI_API_KEY`) の動作確認未実施
- frontend に vitest 未導入（`make test` は backend のみ実行）
- 画像生成API (Nanobanana) / 透過APIのキー設定および疎通未確認

---

## 4. タスクキュー

凡例: `[ ]` Todo / `[~]` In Progress / `[x]` Done

### Phase 0: ベースライン疎通
- [ ] **T01**: `make init` で全依存関係インストール、`make verify-all` がグリーン
  - 検証基準: `/api/health` が 200 を返す、frontend `vite build` が成功、pytest がグリーン
- [ ] **T02**: フロントに Tailwind CSS v4 を導入し、`@import "tailwindcss"` を有効化
  - 検証基準: 任意の Tailwind クラスが効くサンプル要素で確認

### Phase 1: 画面 1 (テーマ入力)
- [ ] **T11**: テーマ入力フォーム + 登場人物選択 UI
  - 検証基準: 選択結果を State JSON にまとめて表示できる
- [ ] **T12**: 画面 1 から画面 2 への遷移と State 引き継ぎ
  - 検証基準: 入力した State が画面 2 で参照可能

### Phase 2: 画面 2 (討論 + 介入)
- [ ] **T21**: ギャルゲ風横並びステージUI（登場人物カード + 中央テロップエリア）
  - 検証基準: モック State で発話が表示され、ユーザーアバターが右端に配置される
- [ ] **T22**: LINE風の過去ログUI（小さな丸アイコン付きスライドインパネル）
  - 検証基準: ログボタンを押すと、ログがモーダルで表示され、その中でアイコンが正しく表示される
- [ ] **T23**: 介入アクション（異議・観点・質問）の入力モード実装
  - 検証基準: キーボード入力が中央テロップに表示され、Stateに追記される
- [ ] **T24**: バック `/api/next_turn` 実装（State 受け取り → Gemini JSON構造化生成 → State 返却）
  - 検証基準: LangGraphなしで、Geminiが正しく次のキャラと発言、論点リストを更新して返す
- [ ] **T25**: 動的アバター生成パイプライン（人物追加アクション）の実装
  - 検証基準: 名前入力 → Gemini検索 → Nanobanana生成 → 透過処理 → 画面に追加のフローが通る

### Phase 3: 画面 3 (結論)
- [ ] **T31**: バック `/api/summarize` 実装（全履歴 → Gemini JSON統合レポート生成）
  - 検証基準: pytest で構造化レポート (Before/After/Bento UI用Map) が返る
- [ ] **T32**: 結論画面 UI（枠なしBento UI、staggerアニメーション、介入称賛）
  - 検証基準: Framer Motionでカードが順次構築され、T31のレスポンスを表示できる

### Phase 4: E2E 統合
- [ ] **T41**: 画面 1 → 2 → 3 のエンドツーエンドシナリオテスト
  - 検証基準: 1 シナリオを通しで実行し、State が破綻しない

---

## 5. セッションログ
セッション終了時にこのセクションへ追記する。

- `YYYY-MM-DD`: TBD

## 6. ハンドオフメモ
次セッションが最初に読むべきメモ:
- まずは T01 から。`make init` で全 deps を入れ、`make verify-all` がグリーンになることを確認する。
- 状態管理はLangGraphを使わず、すべてGeminiのStructured Outputに依存する設計方針に注意。