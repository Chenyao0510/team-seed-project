# CONSTRAINTS.md -- アーキテクチャ・プロダクト制約

実装に着手する前に、必ず本ファイルの MUST / MUST NOT を頭に入れること。

## MUST

### プロダクト体験

- ユーザーが AI 同士の議論に**リアルタイムで介入**（人物追加・異議・観点・質問）できる UI を体験の中心に据える
- 介入によって議論の流れが目に見えて変わる演出を入れる
- Integration Map 画面では「ユーザーの介入が問いの構造に与えた影響」を称賛する文言 (`connective_value_praise`) を入れる
- 出力する成果は「答え」ではなく「問いの進化（Before → After）」と「統合された構造」とする

### データフロー

- フロントとバックは**画面ごとに定義された State オブジェクト (JSON)** を POST のリクエスト/レスポンスでキャッチボールする
- State オブジェクトが**唯一の信頼できる情報源 (single source of truth)**
- スキーマは `DECISIONS.md` の D01 を Source of Truth とする（Debate State / Integration State の 2 種）

### Gemini API 呼び出し

- レスポンスは `responseMimeType: "application/json"` または `responseSchema` を必ず指定
- JSON パースは `try/except` で防御し、失敗時は再生成 or フォールバック
- API キーは `.env` の `GEMINI_API_KEY` から読み込む（コードへのハードコード禁止）

### コード品質

- TypeScript strict モード。`any` 禁止（必要ならコメントで理由を書く）
- Python は `pydantic` モデルで型付け
- 関数は <50 行、ファイルは <800 行を目安に保つ
- マジックナンバー禁止。命名定数を使う
- ミューテーションせず、新しいオブジェクトを返す

## MUST NOT

### プロダクト

- AI に思考・結論をすべて代行させるだけのチャット UI は作らない
- ユーザーの不安や劣等感を煽る演出・文言は入れない（「あなたの思考は浅い」等は NG）

### 技術選定

- マルチエージェントフレームワーク（LangGraph, CrewAI, AutoGen 等）の導入禁止
  - 自前 State オブジェクト管理で Vibe Coding を徹底する
- 状態管理ライブラリ（Redux, Zustand 等）は必要になるまで入れない
  - 最初は React の `useState` / `useReducer` + props ドリルで十分
- データベース (PostgreSQL, SQLite 等) を入れない
  - ハッカソン中はインメモリ + 必要なら JSON ファイル永続化

### 開発プロセス

- タスクの並行実装禁止（同時に進めるタスクは 1 つだけ）
- テスト未 Pass のままの「完了」報告禁止
- ベースラインが壊れた状態 (`make verify-all` 失敗) で新機能着手禁止
- ドキュメント未更新のままのアーキテクチャ変更禁止
