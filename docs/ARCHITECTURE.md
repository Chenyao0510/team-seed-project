# ARCHITECTURE.md -- システム設計

## スタック

| レイヤ        | 技術                                                       |
| ------------ | --------------------------------------------------------- |
| 言語          | TypeScript (frontend) / Python 3.13 (backend)             |
| フロント      | Vite + React 19 + Tailwind CSS v4 + Framer Motion         |
| バック        | FastAPI + uvicorn                                         |
| LLM          | Gemini API (google-genai SDK, JSON Mode / Search Grounding) |
| 画像生成      | Gemini 画像生成モデル「nano banana」(`gemini-2.5-flash-image`) + OpenCV クロマキー透過 |
| 永続化        | なし（インメモリ。必要なら JSON ファイル）                    |
| パッケージ管理 | pnpm (frontend) / pip + requirements.txt (backend)        |

## システム概要

ステートレスな FastAPI バックエンドが、フロントから渡された **State JSON** を受け取り、Gemini を呼び出して **更新後 State JSON** を返す。フロントは画面演出と介入 UI に集中し、状態の真の所有者は State JSON 自体。

State スキーマの実体は `DECISIONS.md` D01 を Source of Truth とする（Debate State と Integration State の 2 種）。

## レイヤ図

```text
+----------------------------------------------------+
|             Frontend (Vite + React)               |
|  Screen 0 (Setup: テーマ + 初期メンバー編成)        |
|     ↓ アバター事前生成完了                          |
|  Screen 1 (Debate Stage: ギャルゲ風横並び + 介入)    |
|     ↓ 「議論を整理する」                            |
|  Screen 2 (Integration Map: Bento UI + stagger)     |
|              ↑ useReducer で State を保持           |
+----------------------------------------------------+
              │  fetch POST  (JSON State)
              ▼
+----------------------------------------------------+
|              Backend (FastAPI)                     |
|  /api/add_character: 動的アバター生成パイプライン     |
|                      (Screen 0 と Screen 1 で共有)   |
|  /api/next_turn    : Debate ターン更新              |
|  /api/reflection   : Reflection Turn 構造化要約生成  |
|  /api/summarize    : Integration Map 生成           |
|  /api/health       : ヘルスチェック                  |
|  /api/tts          : VOICEVOX 音声合成 (GET)         |
|  /static/avatars/* : 生成アバター画像の配信          |
+----------------------------------------------------+
              │
       ┌──────┴──────────────────────┐
       ▼                              ▼
+----------------+    +----------------------------+
|   Gemini API   |    |  Gemini 画像生成 (nano       |
| (テキスト /     |    |  banana, gemini-2.5-flash- |
|  Search        |    |  image)                    |
|  Grounding)    |    |  + OpenCV クロマキー透過     |
+----------------+    +----------------------------+
```

## レイヤ境界

### Frontend (`frontend/`)

- UI / 演出 / ユーザー入力の処理のみを担当する
- ドメインロジックや LLM 呼び出しは持たない
- State はトップレベルコンポーネントの `useReducer` で保持し、子へ props で渡す
- アニメーション（Screen 遷移・stagger 構築）は Framer Motion に集約する
- バック呼び出しは `fetch` をラップした薄い `apiClient` モジュールに集約する

### Backend (`backend/`)

- ステートレス。リクエストごとに State JSON を受け取り、新しい State を返す
- ルーティング (`main.py`) と業務ロジック (`app/`) を分離
- Gemini 呼び出しは `app/gemini_client.py` に閉じる（テキスト生成 + Search Grounding、
  nano banana 画像生成の両方）
- 画像生成パイプラインは `app/avatar_pipeline.py` に閉じ、背景透過は `app/background_removal.py`
  （OpenCV クロマキー）に分離する
- pydantic で State スキーマを定義し、入出力で必ず検証する

### Gemini との境界

- `responseMimeType: "application/json"` または `responseSchema` を指定する
- パース失敗時のフォールバックを `try/except` で必ず持つ
- API キーは `.env` の `GEMINI_API_KEY` から読み込み、コード直書き禁止

### 画像生成（nano banana + OpenCV）との境界

- 画像生成 (`app/gemini_client.py`) と背景透過 (`app/background_removal.py`) を
  それぞれ単一モジュールに閉じる。タイムアウト・リトライ・フェイルセーフを必ず実装
- 失敗時は `app/avatar_pipeline.py` が円形プレースホルダーアバターを生成して返し、UI を壊さない
- 生成画像は `backend/static/avatars/` に保存し、`/static/avatars/...` で配信する
- API キーは `.env` の `GEMINI_API_KEY` から読み込む（テキスト生成と画像生成で共通）

## データフロー: Screen 0 → Screen 1 (Setup 完了 → Debate 開始)

```text
1. ユーザーが Screen 0 でテーマと初期メンバー名を入力
2. Frontend が各メンバー名について POST /api/add_character を呼び、アバター URL と persona を取得
   - Gemini (Search Grounding) で人物の外見プロンプトを生成
   - nano banana (`gemini-2.5-flash-image`) で単色背景のアバターを生成
   - OpenCV クロマキーで背景透過し、`/static/avatars/...` に保存
   - 人物像・口調・専門・価値観を1〜2文にした `persona` を best-effort 生成 (T62 / D19)。失敗時は `""`
   - ユーザー自身のアバター (T58) は任意。画像アップロード (dataURL) か、メンバーと同じ `add_character` パイプラインでの生成のどちらかを選べる
3. 全員分の URL が揃ったら Frontend は Debate State の初期値（メンバー roster + `user`）を組み立てる
4. Screen 1 (Debate Stage) に遷移し、初期描画
```

## データフロー: 次ターン生成

```text
1. ユーザーが Screen 1 で「次のターンへ」or 介入ボタンを押す
2. Frontend が現在の Debate State JSON を POST /api/next_turn に送信
3. Backend が State を pydantic で検証
4. Backend が Gemini に State + システムプロンプトを渡し、構造化 JSON を取得
5. Backend が新しい active_character / 発言 (hook+body) / current_points / chat_history / turn_count を更新（characters は不変、追加は `/api/add_character` 経由のみ。turn_count は呼び出しごとに+1）
   - 発言は `current_hook` / `current_body` / `current_reasoning_target` / `current_concepts` の構造化形式 (D20)。`current_speech` は `hook + body` の合成導出値で TTS / archive 用
6. Backend が更新後 Debate State JSON を返却
7. Frontend が hook を即時表示 → 300〜600ms 後に body をタイプライターで描画、concepts を強調、reasoning_target を返信チップ表示 (D20)
```

## データフロー: 動的アバター追加（Screen 1 介入アクション）

```text
1. ユーザーが Screen 1 で「人物追加」を押し、名前を入力
2. Frontend が POST /api/add_character に名前を送信
3. Backend が Screen 0 と同じパイプライン（Gemini Search → nano banana 画像生成 → OpenCV 透過）を実行
4. Frontend が新キャラをステージ右側（ユーザーの左隣）に追加
```

## データフロー: 統合マップ生成

```text
1. ユーザーが Screen 1 で「議論を整理する」を押す
2. Frontend が Debate State JSON を POST /api/summarize に送信
3. Backend が Gemini に全履歴を渡し、Integration State JSON を生成
4. Backend が central_concept / before_question / after_question / structure_map / user_catalyst / connective_value_praise を返却
5. Frontend が Screen 2 に遷移し、Framer Motion で「中心ノード → 周辺カード → 関係線 → ユーザー介入トレース」を順次構築 (D15)
```

## API 契約

| メソッド | パス                  | 入力                   | 出力                       |
| ------- | -------------------- | --------------------- | ------------------------- |
| GET     | `/api/health`        | -                     | `{"status": "ok"}`        |
| POST    | `/api/add_character` | `{"name": "string"}`  | `{"avatar_url": "string", "gender": "male|female|robot", "persona": "string"}` (T69/T72) |
| GET     | `/api/character_templates` | -               | `[{slug, name, avatar_url, gender, persona}, ...]` (T5A / D16 / D17 / T69) |
| POST    | `/api/next_turn`     | Debate State          | 更新後 Debate State        |
| POST    | `/api/summarize`     | Debate State          | Integration State          |
| GET     | `/api/tts`           | `text`, `character_name`, `gender?` (T69) | `audio/wav` バイナリ。LRU + in-flight coalescing (T71) |

CORS: `http://localhost:5173` および `http://127.0.0.1:5173` を許可する。

## 主要決定の参照

- D01: 画面ごとの State JSON 方式（Debate / Integration の 2 種）→ `DECISIONS.md`
- D02: マルチエージェントフレームワーク不使用 → `DECISIONS.md`
- D04: Gemini JSON Mode → `DECISIONS.md`
- D08: Framer Motion 採用 → `DECISIONS.md`
- D09: 動的アバター生成パイプライン → `DECISIONS.md`
- D10: nano banana + OpenCV クロマキーによるアバター実装 → `DECISIONS.md`
- D15: Screen 2 Bento UI（中心ノード + 周辺カード + 介入トレース）→ `DECISIONS.md`
