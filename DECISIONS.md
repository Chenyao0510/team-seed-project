# DECISIONS.md -- 設計判断ログ

設計上の重要な選択と、その理由を記録する。後続セッションが背景を辿れるように。

---

## D01: 画面ごとの State JSON で全体を管理する

**判断**: フロント・バック間のやり取りは、**画面ごとに定義された State オブジェクト (JSON)** を毎回 POST でキャッチボールする方式とする。Screen 1 (Debate Stage) 用と Screen 2 (Integration Map) 用の 2 種類。本ファイルが State スキーマの Source of Truth。

**理由**:

- ハッカソン 24 時間で複雑な状態管理ライブラリやエージェントフレームワークを導入するコストが高い
- フロントとバックが「同じ State を見ている」ことが保証されると、デバッグが圧倒的に楽
- State がそのままセッションの保存形式 (JSON ダンプ) として使える
- 画面ごとに分けることで「Debate 中は描画と発話更新だけ」「Integration では構造マップに集中」と関心を分離できる

### Debate State (Screen 1) スキーマ

```json
{
  "theme": "string (不変)",
  "current_topic": "string",
  "active_character": "string",
  "status": "thinking | speaking | waiting",
  "current_speech": "string",
  "current_points": ["string"],
  "characters": [
    {"name": "string", "avatar_url": "string"}
  ],
  "chat_history": [
    {"speaker": "string", "text": "string", "avatar_url": "string"}
  ]
}
```

`characters` はステージ上に並ぶ参加者 roster。`active_character` はこの roster のいずれかの `name` を指す。`chat_history` は過去発話の追記ログで、Setup 直後は空配列。

**スキーマ進化メモ (T13)**: 初期は `characters` なしだったが、初期状態（誰もまだ発言していない）で参加者の roster を保持する場所がないため追加。`chat_history` から逆引きする方式は「発言前の参加者」を表現できず、ステージ描画にも不便だった。

### Integration State (Screen 2) スキーマ

```json
{
  "before_question": "string",
  "after_question": "string",
  "structure_map": [
    {
      "category_name": "string",
      "elements": ["string"],
      "highlighted_element_index": 0
    }
  ],
  "user_catalyst": "string",
  "connective_value_praise": "string"
}
```

pydantic でスキーマ化し、入出力で必ず検証する。Screen 0 (Setup) は遷移時にテーマと初期メンバー (名前 + アバター URL) を Debate State の初期値として渡す。

---

## D02: マルチエージェントフレームワークを使わない

**判断**: LangGraph, CrewAI, AutoGen 等は使わない。自前 State + Gemini への直 API 呼び出しで実装する。

**理由**:

- フレームワークの学習・デバッグコストがハッカソン尺に合わない
- 自前で書いた方が Vibe Coding（=エージェントに小さな修正を指示する）と相性が良い
- 介入や進行制御をフレームワーク仕様に縛られず自由に書ける

---

## D03: DB を入れない

**判断**: PostgreSQL / SQLite 等の DB は入れない。インメモリ + 必要なら JSON ファイル永続化で十分。

**理由**:

- ハッカソン尺。スキーマ設計とマイグレーションに時間を割く価値が低い
- セッションは短時間（数分〜数十分）。永続化要件が薄い

---

## D04: Gemini API の JSON Mode を使う

**判断**: Gemini 呼び出しは必ず `responseMimeType: "application/json"` または `responseSchema` を指定する。

**理由**:

- フリーテキストをパースするとフォーマット崩壊で潰れる
- Structured Outputs / JSON Mode を使えば pydantic で安全に検証できる
- 復元コストを最初から潰しておく方が、後でリカバリするより速い

---

## D05: 状態管理ライブラリは初期段階で入れない

**判断**: 最初は React の `useState` / `useReducer` + props ドリルで作る。Redux / Zustand 等は明確な必要性が出るまで入れない。

**理由**:

- 画面が Setup / Stage / Map の 3 つだけ
- 「画面ごとの State JSON」がメインの構造で、Reducer 一つで十分
- 過剰な抽象化を避ける (YAGNI)

---

## D06: パッケージマネージャは pnpm

**判断**: フロントは pnpm を使う。

**理由**:

- frontend 初期化時点で `pnpm-lock.yaml` が存在
- インストールが速くディスク効率が良い

---

## D07: Python 依存は requirements.txt 管理

**判断**: Poetry / uv 等は使わず、`requirements.txt` + `pip install` でシンプルに管理する。

**理由**:

- ハッカソン尺で十分。Pin の細かさより導入の速さを優先
- どの環境でも動く

---

## D08: アニメーションは Framer Motion で統一する

**判断**: フロントのアニメーション（画面遷移、stagger 構築、発話演出）は Framer Motion を使う。CSS transitions / 自前タイマー駆動は使わない。

**理由**:

- Integration Map の stagger 構築アニメが体験の核（「構造が組み上がる」演出）
- React 19 と相性が良く宣言的に書ける
- 介入時のキャラハイライト・テロップ切り替えも一貫した API で扱える

**影響範囲**: `frontend/` のみ。`make init` で `pnpm add framer-motion` を T02 / 関連タスクで行う。

---

## D09: 動的アバター生成パイプラインを 3 段階構成にする

**判断**: 「人物追加」機能のアバター生成は以下の 3 段で構築する:

1. Gemini Search Grounding で人物のビジュアルリファレンスを取得
2. 画像生成 API (Nanobanana 等) でアバター画像を生成
3. 背景透過処理を実行

各段でタイムアウト・リトライを設ける。最終的に失敗した場合はプレースホルダーアバターでフォールバックし、UI を壊さない。

**理由**:

- ユーザーが任意の人物名を入力しても横並びステージに違和感なく追加できる
- 1 段で失敗してもフェイルセーフがあれば体験が壊れない
- 各段を独立モジュール化することで、ハッカソン中にどこかを差し替え可能

**影響範囲**: `backend/app/avatar_pipeline.py` (新規予定)。`.env` に画像生成 API の認証情報を追加する必要がある。

---

## 追加判断の書き方

新しい判断は `D10`, `D11`, ... と連番で追加し、`判断 / 理由 / 影響範囲` を書く。
