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

## D10: アバター生成は Gemini nano banana + OpenCV クロマキーで実装する

**判断**: D09 の3段構成（参照取得 → 画像生成 → 背景透過）を、外部画像生成API/透過APIではなく
以下で実装する:

1. Gemini テキストモデル (`gemini-2.5-flash`) + Search Grounding で人物の外見プロンプトを生成
   （best-effort: タイムアウト時は Grounding 無しで再試行）
2. Gemini 画像生成モデル「nano banana」(`gemini-2.5-flash-image`) で、クロマキー用の
   単色緑背景を指定してアバター画像を生成
3. OpenCV (`cv2.inRange` によるクロマキー) で緑背景域をアルファ透過

生成したPNGは `backend/static/avatars/<sha1(name)[:12]>.png` に保存し、FastAPI の
`StaticFiles` で `/static/avatars/...` として配信する。`avatar_url` はこの静的URL
（`PUBLIC_BASE_URL` + パス）を返す。

テキスト生成・画像生成は同一の `.env` の `GEMINI_API_KEY` を使う。

各段で例外が発生した場合は、名前から決定的に色を選んだ円形プレースホルダー画像
（OpenCV で生成）にフォールバックし、UI を壊さない（D09 のフェイルセーフ方針を継承）。

**理由**:

- Nanobanana 等の外部画像生成APIや別の透過APIの契約・キー取得のコストを避け、既存の
  `GEMINI_API_KEY` のみで完結させられる
- nano banana に「単色背景で生成して」と指示できるため、クロマキーが安定して機能する
- OpenCV は既に依存に追加済みで、外部サービス呼び出し無しに透過処理が完了する

**影響範囲**:

- `backend/app/gemini_client.py`（新規）: Gemini テキスト/画像生成の単一ラッパ
- `backend/app/background_removal.py`（新規）: OpenCV クロマキー処理
- `backend/app/avatar_pipeline.py`（新規）: 3段オーケストレーション + 保存 + フォールバック
- `backend/main.py`: `/static` を `StaticFiles` でマウント
- `backend/requirements.txt`: `opencv-python`, `numpy` を追加
- `.env`: `PUBLIC_BASE_URL`（既定値 `http://localhost:8000`）を追加（任意・コード側にも既定値あり）

---

## D11: `/api/next_turn` のターン進行セマンティクス

**判断**: T24 `/api/next_turn` は、受け取った Debate State を以下の手順で1ターン進め、新しい
Debate State を返す（ミューテーションせず常に新規構築）。

1. 直前の `active_character` の `current_speech` を `chat_history` に追記する
   （`current_speech` が空、または既に末尾と同一の場合は追記しない）
2. Gemini (`gemini-2.5-flash`) に State を渡し、`responseSchema` で
   `active_character / current_speech / current_points / current_topic` を構造化生成させる
   （D04）。`status` は LLM に委ねず、Python 側で常に `"speaking"` に決定する
3. Gemini の `active_character` が `characters` (roster) に含まれない、または Gemini 呼び出し
   自体が失敗した場合は、roster 内で直前の話者の次の人物に決定的にローテーションする
   フォールバックを使う（`current_speech` は継続発言の汎用文、`current_points` / `current_topic`
   は据え置き）

プロンプトでは、`chat_history` 末尾の発言者が roster 外（=ユーザー介入）の場合、次の発言者は
その介入に正面から反応するよう指示する（CONSTRAINTS: 介入で議論の流れが変わる体験）。

**理由**:

- LangGraph 等を使わず（D02）、1回の Gemini 呼び出しと薄いオーケストレーション関数
  (`backend/app/debate.py`) で「次のキャラ選定・発言・論点更新」を一撃生成できる
- chat_history への追記をバックエンド側で行うことで、フロントは State をそのまま置き換える
  だけでよく、ログの整合性が保証される
- roster 内ローテーションのフォールバックにより、Gemini が失敗・不正な人物名を返しても
  UI が壊れず議論が必ず先に進む（D09/D10 のフェイルセーフ方針を継承）

**影響範囲**:

- `backend/app/models.py`: `DebateState` / `CharacterRef` / `ChatMessage` / `NextTurnLLMOutput` を追加
- `backend/app/gemini_client.py`: `generate_next_turn` を追加（`responseSchema=NextTurnLLMOutput`）
- `backend/app/debate.py`（新規）: `advance_turn` オーケストレーション
- `backend/app/routes.py`: `POST /api/next_turn` を追加
- `backend/app/config.py`: `CHAT_HISTORY_PROMPT_LIMIT` / `NEXT_TURN_TIMEOUT_SECONDS` を追加

---

## 追加判断の書き方

新しい判断は `D10`, `D11`, ... と連番で追加し、`判断 / 理由 / 影響範囲` を書く。
