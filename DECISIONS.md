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
    {"name": "string", "avatar_url": "string", "gender": "male | female | robot | null"}
  ],
  "chat_history": [
    {"speaker": "string", "text": "string", "avatar_url": "string"}
  ],
  "turn_count": 0,
  "user": {"name": "string", "avatar_url": "string"}
}
```

`characters` はステージ上に並ぶ参加者 roster。`active_character` はこの roster のいずれかの `name` を指す。`chat_history` は過去発話の追記ログで、Setup 直後は空配列。`turn_count` は `/api/next_turn` が呼ばれるたびにバックエンドが+1する整数で、Reflection Turn (T26/T27) の発火判定に使う。`user` はステージ右端に固定表示されるユーザー自身の表示情報で、`name` は介入発言の話者名（既定 `あなた`）、`avatar_url` は Screen 0 で登録したアバター。

**スキーマ進化メモ (T13)**: 初期は `characters` なしだったが、初期状態（誰もまだ発言していない）で参加者の roster を保持する場所がないため追加。`chat_history` から逆引きする方式は「発言前の参加者」を表現できず、ステージ描画にも不便だった。

**スキーマ進化メモ (T58)**: ユーザー自身のアバターを Screen 0 で登録できるようにするため `user` を追加。従来はフロントのハードコード placeholder だったが、これだとユーザー介入発言 (`speaker = あなた`、roster 外) の `chat_history.avatar_url` をバックエンドが解決できなかった。`user` を State に持たせることで `_avatar_for` が roster 外の話者でもユーザーアバターを引けるようになる。後方互換のため pydantic 上は `user` を optional（既定 `name=あなた` / `avatar_url=""`）とし、未登録でも従来通り動作する。

**スキーマ進化メモ (T69)**: `CharacterRef.gender` を追加（D17）。`/api/tts` の話者割り当てを名前ハッシュではなく性別カテゴリ別プールで行うため、キャラ追加時 (`/api/add_character`) に AI に判定させた結果を State に持たせる。`null` 許容で後方互換（未指定なら従来のハッシュフォールバックを使う）。

### Integration State (Screen 2) スキーマ

```json
{
  "central_concept": "string",
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

**スキーマ進化メモ (T59)**: Screen 2 を Bento UI 中心ノード型のレイアウトに刷新するため
`central_concept` を追加（D15）。これは Bento の中心に表示する短い名詞句で、`theme`
（=自由入力の疑問文・センテンス）をそのまま中心に置くと十字 Bento のレイアウトが
破綻するため、LLM に**短い名詞句**として明示的に生成させる必要がある。
バックエンドでは `max_length=12`（CJK 文字想定。半角換算ではない）で pydantic 検証し、
LLM の出力が長すぎる場合・フォールバック時は `theme` から末尾の疑問符・助詞を剥がした
素朴正規化を適用する（実装は `backend/app/summarize.py`）。

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

## D12: Turn Counter で Reflection Turn を決定論的に発火する

**判断**: Debate State に `turn_count: int`（既定 0）を追加する。`/api/next_turn` は
ターンを進めるたびに `turn_count` を+1して返す。フロントは `turn_count` を
`REFLECTION_INTERVAL`（=3）で割った余りが 0 になったタイミングで Reflection Panel
(T26) を表示する。

**理由**:

- Semantic な「議論が膠着しているか」の判定は Gemini への追加問い合わせや複雑な
  ヒューリスティクスが必要になり、ハッカソン尺・D02（マルチエージェント禁止）の
  方針に合わない
- ターン数というシンプルな整数カウンタであれば、バックエンドの1ステートフィールド
  追加だけで「決定論的かつ安定したタイミング」での Reflection 発火を実現できる
- T26 ではフロントのローカル state でターン数を暫定集計していたが、画面リロードや
  複数タブでの不整合のリスクがあり、State (single source of truth, D01) に
  含めることで解消する
- ユーザー介入 (`onIntervene`) は `/api/next_turn` を経由しないため `turn_count` は
  増加しない。「ユーザー介入はカウントしない」という T26 の方針を自然に継承する

**影響範囲**:

- `backend/app/models.py`: `DebateState.turn_count: int = Field(default=0, ge=0)`
- `backend/app/debate.py`: `advance_turn` が `turn_count=state.turn_count + 1` を返す
- `frontend/src/types/state.ts`: `DebateState.turn_count: number`
- `frontend/src/lib/buildDebateState.ts`: 初期値 `turn_count: 0`
- `frontend/src/screens/DebateStage.tsx`: ローカル `turnCount` 集計を廃止し、
  `newState.turn_count % REFLECTION_INTERVAL === 0` で Reflection Panel を表示
- `fixtures/debate_state_sample.json`: `turn_count` を追加

---

## D13: Reflection Turn の構造化要約を `/api/reflection` で生成する

**判断**: T26 で見送った2つの退避項目（動的 facilitator / 論点×立場×キャラクタアイコンの
構造化要約）に対応するため、専用エンドポイント `POST /api/reflection` を新設する。
入力は Debate State、出力は以下の Reflection Summary（Debate State 自体は変更しない）:

```json
{
  "facilitator_comment": "string",
  "blocks": [
    {
      "topic": "string",
      "stances": [
        {
          "label": "string",
          "summary": "string",
          "characters": ["string"]
        }
      ]
    }
  ]
}
```

`facilitator_comment` は参加者外AI（ファシリテーター）による中立の要約一言。
「足りない視点」「追加すべき人物」など今後の進行に関する提案は禁止する
（PROGRESS.md T26 の制約）。`blocks[].stances[].characters` は roster (`characters[].name`)
の部分集合のみを許可し、roster 外の名前はバックエンド側でフィルタする。

Gemini 呼び出しは D04 (JSON Mode, `responseSchema=ReflectionSummary`) に従う。失敗時は
決定論的フォールバック（`facilitator_comment` に静的中立コピー、`blocks=[]`）を返し、
UI は既存の論点一覧 + 参加者一覧表示にグレースフルに退避する（D09/D10/D11 のフェイル
セーフ方針を継承）。

**理由**:

- `/api/next_turn` は毎ターン呼ばれるため、3ターンに1回しか使わない reflection 用の
  追加 LLM 呼び出しを含めると全ターンが遅延する。専用エンドポイントに分離することで
  next_turn の責務とレイテンシを汚さない
- Reflection Summary は Debate State と独立した「ビュー専用」データであり、D01 の
  Debate State スキーマに含めるとスキーマが肥大化する
- `blocks=[]` のフォールバックにより、Gemini が失敗・空応答でも Reflection Panel は
  既存の論点一覧 + 参加者一覧表示で壊れず動作する

**影響範囲**:

- `backend/app/models.py`: `ReflectionStance` / `ReflectionBlock` / `ReflectionSummary` を追加
- `backend/app/gemini_client.py`: `generate_reflection` / `_build_reflection_prompt` を追加
- `backend/app/reflection.py`（新規）: `build_reflection` オーケストレーション
  （roster 外キャラ名のフィルタ + フォールバック）
- `backend/app/routes.py`: `POST /api/reflection` を追加
- `backend/app/config.py`: `REFLECTION_TIMEOUT_SECONDS` を追加
- `frontend/src/types/state.ts`: `ReflectionStance` / `ReflectionBlock` / `ReflectionSummary` を追加
- `frontend/src/api/client.ts`: `reflection(state)` を追加
- `frontend/src/screens/DebateStage.tsx`: `maybeShowReflection` で `/api/reflection` を
  呼び出し、`ReflectionPanel` を facilitator 一言 + `blocks` 駆動に変更。
  「人物追加」ボタンを活性化し既存 `AddCharacterModal`（T25）を再利用
- `fixtures/reflection_summary_sample.json`（新規）/
  `backend/tests/fixtures/__init__.py`（`load_reflection_summary`）/
  `frontend/src/mocks/index.ts`（`reflectionSummarySample`）

---

## D14: `/api/summarize` のレポート生成セマンティクス

**判断**: T31 `/api/summarize` は、Debate State を受け取り、Gemini
(`gemini-2.5-flash`) に `responseSchema=IntegrationState` で構造化生成させて
Integration State をそのまま返す。失敗時はバックエンド側で決定的な
フォールバック Integration State を構築して返す。

プロンプトでは以下を明示する:
- `chat_history` のうち `characters` (roster) に含まれない発言者は「ユーザー介入」
  として扱い、`user_catalyst` と `connective_value_praise` の素材にする
- `connective_value_praise` はユーザーを称賛するトーンで書き、不安・劣等感を煽る
  表現を禁止する（CONSTRAINTS.md「ユーザーの不安や劣等感を煽る演出・文言は入れない」）
- `before_question` はテーマを素朴な問いに、`after_question` は議論を経て進化した
  問いに（Before → After を明示）
- `structure_map` は 2〜4 個のカテゴリでまとめ、ユーザー介入により強調された要素は
  `highlighted_element_index` で示す

フォールバック (`app/summarize.py::_fallback_integration`) は、`current_points`
を1カテゴリの elements にし、`chat_history` 末尾の roster 外発言を user_catalyst に
採用、ユーザー介入があれば `highlighted_element_index` を末尾要素に振る。介入が
無い場合は中立的な称賛文を返す。

**理由**:

- Screen 2 は「答え」ではなく「問いの構造とその進化」を持ち帰らせる画面なので、
  Before/After 構造を LLM 側で一撃生成させるのが最も簡潔（D02 の方針継承）
- ユーザー介入の扱いを `chat_history` の roster 外発言で判定する規約は、
  T23/T24 (`/api/next_turn`) と同じで一貫性が保てる
- フォールバックを決定的に作っておくことで、ハッカソン中の Gemini 失敗・スキーマ
  逸脱でも Screen 2 が UI ごと崩れない（D09/D10/D11 のフェイルセーフ方針を継承）

**影響範囲**:

- `backend/app/models.py`: `StructureCategory` / `IntegrationState` を追加
- `backend/app/gemini_client.py`: `generate_summary` + `_build_summarize_prompt` を追加
- `backend/app/summarize.py`（新規）: `build_integration` オーケストレーション + フォールバック
- `backend/app/routes.py`: `POST /api/summarize` を追加
- `backend/app/config.py`: `SUMMARIZE_HISTORY_PROMPT_LIMIT` / `SUMMARIZE_TIMEOUT_SECONDS` を追加
- `backend/tests/test_summarize.py`（新規）: 正常系・フォールバック2種・422 の4テスト

---

## D15: Screen 2 を「中心ノード + 周辺カード + 介入トレース」の Bento UI に刷新する

**判断**: Screen 2 (Integration Map) のレイアウトを、現状の素朴な平置きカードグリッド
から、以下の構造に刷新する（PROGRESS.md T59 仕様の Bento UI 化）:

1. **Growth Header**: 上部に Before / After を小さく表示する（主役ではない）
2. **Structure Map (主役)**: 画面中央に `central_concept` を置く中心ノードを配置し、
   その周囲に `structure_map[].category_name` を要素数 (2〜4) に応じた決定論的な
   レイアウトで配置する。中心と各カードは SVG パスで接続する
3. **User Intervention Trace**: `★ あなたの介入「{user_catalyst}」` ラベルから、
   `highlighted_element_index` が**最初に**セットされたカテゴリへ、さらにその
   element へと sequential に発光させる。介入が無い（どのカテゴリにも
   `highlighted_element_index` が無い）場合はトレース表示自体を**非表示**にする
4. **Feedback Line**: `connective_value_praise` を 1〜2 行で簡潔に表示する
   （バックエンド側で既に短文生成済みのものを信用してそのまま表示）

**レイアウト戦略 (`frontend/src/lib/integrationLayout.ts`)**:

カテゴリ数 → CSS Grid `grid-template-areas` + SVG パス座標 + 強調カテゴリ位置 を
返す純関数として実装する。`structure_map.length` ごとの配置:

- **2 カテゴリ**: 中心の左右
- **3 カテゴリ**: 上 + 左下 + 右下（三角配置）
- **4 カテゴリ**: 上下左右（仕様例の十字）

5 以上は backend D14 で 2〜4 個に絞られる前提だが、Front 側でも防御的に上位 4 件で
切る（決定論的、ソート順は配列順）。Bento 全体は親 `aspect-[16/10]` の固定比率
コンテナにし、SVG `viewBox` も同比率で固定することで `pathLength` アニメと
セル座標の整合を保つ。

**アニメ方針 (Framer Motion 12)**:

順序は以下で固定（T59 仕様）。stage 間隔は既存 `STAGGER_DELAY_SECONDS = 0.35` を踏襲:

1. Growth Header (Before → After を同時 fade-in)
2. 中心ノード pop-in (`scale: 0.8 → 1`, spring)
3. 周辺カード stagger pop-in (`variants` + `staggerChildren`)
4. 関係線 (`<motion.path pathLength={0 → 1}>` で順次描画)
5. ★ User Catalyst ラベル fade-in
6. 介入トレース sequential chain (`useAnimate()` の scope アニメ + `animate(sequence)`
   で 中心 → 該当カテゴリ → 該当 element を順次発光)
7. Feedback Line fade-in

「強調カテゴリ」は `structure_map` を先頭から走査して
`highlighted_element_index` が定義されている最初の要素とする（複数あっても 1 件のみ
矢印を伸ばす）。無ければ stage 5–6 をスキップして 7 へ直行する。

**理由**:

- T59 仕様「結論ではなく構造を持ち帰る」体験のためには、関係性を視覚化する Bento UI が
  必須。既存の平置きグリッドでは「カード間の関係」が表現できない
- `central_concept` をスキーマに加えることで、`theme` の自由入力（疑問文・長文）の
  影響を Bento レイアウトから切り離せる（CONSTRAINTS: マジックナンバー禁止に対応する
  ためのデータ駆動）
- カテゴリ数 → レイアウト の写像を `integrationLayout.ts` に純関数として閉じ込めることで、
  SVG パス座標と Grid セル座標の整合を保ちつつ、コンポーネント側はレイアウト計算から
  解放される
- アニメ順序を D01 の State に依存しない決定論的な stage indexing に閉じ込めることで、
  毎回同じ「構造が組み上がる」体験を再現できる（仕様: ランダム表示禁止）

**影響範囲**:

- `DECISIONS.md`: D01 Integration State スキーマに `central_concept` を追加（同 PR で実施）
- `docs/PROJECT.md`: Screen 2 章を T59 仕様で書き換え
- `docs/ARCHITECTURE.md`: Screen 2 / `/api/summarize` 周りの記述を追従
- `fixtures/integration_state_sample.json`: `central_concept` を追加
- `backend/app/models.py`: `IntegrationState.central_concept: str = Field(..., max_length=12)`
- `backend/app/gemini_client.py`: `_build_summarize_prompt` に「central_concept は
  Bento 中心ラベル用の**短い名詞句** (~12文字以内、句読点禁止)」の指示を追加
- `backend/app/summarize.py`: `_fallback_integration` で `theme` から末尾「？/?/とは/は/
  だろうか」等を剥がす素朴正規化で `central_concept` を生成。長さ超過時は先頭 12 文字
  に丸める
- `backend/tests/test_summarize.py`: 既存 4 ケースに `central_concept` 検証を追加
- `frontend/src/types/state.ts`: `IntegrationState.central_concept: string` を追加
- `frontend/src/components/integration/` (新設):
  - `GrowthHeader.tsx` / `CenterNode.tsx` / `StructureCard.tsx`
  - `ConnectionLines.tsx` (SVG, `pathLength` アニメ)
  - `InterventionTrace.tsx` (`useAnimate` sequential chain)
  - `FeedbackLine.tsx`
- `frontend/src/lib/integrationLayout.ts` (新設): カテゴリ数 → grid-areas + SVG パス
  座標 + 強調カテゴリ座標を返す純関数
- `frontend/src/screens/IntegrationMap.tsx`: 上記を組み合わせて stage 演出を司令塔。
  デスクトップ前提（最低想定 1280×800）で `aspect-[16/10]` の固定比率コンテナとする
- フロントテスト基盤（vitest / RTL）は T59 では**導入しない**（α 判断）。動作確認は
  `?mock=integration` での目視 + 既存バックエンド E2E (`backend/tests/test_e2e_scenario.py`)

---

## D16: 事前生成キャラクターテンプレートをセットアップで提供する

**判断**: 代表的人物 8 体（オバマ / イーロン / ソクラテス / アインシュタイン /
キュリー / 龍馬 / ジョブズ / ガンジー）を一度 D09/D10 のパイプラインで生成して
PNG をリポジトリに commit し、SetupScreen 右側パネルから 1 クリックで members に
追加できるようにする（`addCharacter` API はスキップ）。

**理由**:

- デモ時の最大ボトルネック「初期メンバー全員のアバター生成待ち（4〜5 人で 3〜5 分）」
  をテンプレ選択時は 0 秒にできる
- 動的生成 (D09/D10) は残す。テンプレは「速い選択肢」、自由入力もそのまま使える
- DB 禁止 (D03) のため一覧は Python の静的リスト + 静的 PNG で済ませる
- avatar_url の文字列形式は既存と同じ静的 URL なので D01 スキーマ変更は不要

**影響範囲**:

- `backend/app/character_templates.py`（新規）: 静的リスト (slug / name)
- `backend/scripts/seed_templates.py`（新規）: 既存パイプラインを回して
  `backend/static/templates/<slug>.png` を出力する 1 ショット
- `backend/static/templates/*.png`（新規・commit）: 事前生成 PNG（PNG 不在の
  テンプレは API から除外して UI を壊さない）
- `backend/app/routes.py`: `GET /api/character_templates`
- `backend/tests/test_character_templates.py`（新規・最小 2 ケース）
- `frontend/src/api/client.ts`: `getCharacterTemplates()`
- `frontend/src/components/setup/CharacterTemplatePanel.tsx`（新規）
- `frontend/src/screens/SetupScreen.tsx`: 2 カラム化 + テンプレ追加分岐

---

## D17: TTS 話者を性別カテゴリ別プールで決定する (T69)

**判断**: VOICEVOX の `speaker_id` を、キャラクターの性別カテゴリ
（`male` / `female` / `robot`）別に区切ったプールから選ぶ。キャラ追加時
（`/api/add_character`）に Gemini に性別を判定させ、`CharacterRef.gender`
として State に保存する。`/api/tts` 呼び出し時はフロントが `gender` をクエリで渡す。
プールは以下を固定とする:

- 男性 (3): 玄野武宏=11, 白上虎太郎=12, 青山龍星=13
- 女性 (3): 四国めたん=2, 春日部つむぎ=8, 小夜/SAYO=46
- ロボット (1): ナースロボ_タイプT=47

`gender` 未指定（古い State など）の場合は従来通り名前ハッシュで全プール総和から
1つ選ぶフォールバックを残す。

**理由**:

- 従来 (T67) は名前ハッシュで `[2, 3, 8, 11, 13, 14, 20]` から決めていたため、
  男性キャラに女声・女性キャラに男声が当たる事故が頻発し体験を損ねていた
- AI に「人間か / ロボか / 性別」を判定させるのが最も自然な振り分け方法。
  ドラえもん等の明らかな非人間キャラを `robot` プールに送ることで「機械音声」と
  「人間音声」の区別が体験上重要 (ユーザー要望)
- 同性別プール内では従来同様の名前ハッシュ分散を使うことで、同じ性別キャラ間で
  声が被るリスクを最小化（決定論的なので同じキャラには毎回同じ声が当たる）
- 性別判定の失敗時は `male` フォールバック（中立よりは男声を割り当てる方が
  違和感が小さい経験則）。判定が極端に外れても、音声プロパティだけの差なので
  UI は壊れない

**影響範囲**:

- `DECISIONS.md`: D01 `CharacterRef` スキーマに `gender` を追加（本ファイル）
- `docs/ARCHITECTURE.md`: `/api/tts` の入力に `gender` を追記、`/api/add_character`
  のレスポンスに `gender` を追記
- `fixtures/debate_state_sample.json`: 各 `characters[i]` に `gender` を追加
- `backend/app/models.py`: `Gender = Literal["male", "female", "robot"]`,
  `CharacterRef.gender: Gender | None = None`,
  `AddCharacterResponse.gender: Gender`, `CharacterTemplate.gender: Gender`
- `backend/app/gemini_client.py`: `classify_gender(name: str) -> Gender` を追加。
  `responseSchema` で enum を強制
- `backend/app/routes.py`: `add_character` で `classify_gender` を呼ぶ。
  `/api/tts` に `gender` クエリパラメータを追加
- `backend/app/character_templates.py`: `_TEMPLATE_CATALOG` を
  `(slug, name, gender)` に拡張
- `backend/app/tts.py`: `SPEAKER_POOLS` で性別→speaker_id プールを定義し、
  `get_speaker_id(name, gender)` が性別プールから決定論的に選ぶ
- `backend/tests/test_tts.py`（新規）: 性別→プール選択の決定性、未指定時の
  フォールバック
- `backend/tests/test_classify_gender.py`（新規）: モック Gemini で
  分類が `Gender` literal に収まることを保証
- `backend/tests/test_add_character.py`: `AddCharacterResponse.gender` を検証
- `backend/tests/test_character_templates.py`: テンプレに `gender` が含まれることを検証
- `frontend/src/types/state.ts`: `Character.gender?: 'male' | 'female' | 'robot'`
- `frontend/src/api/client.ts`: `AddCharacterResponse` / `CharacterTemplate` に
  `gender` を追加
- `frontend/src/screens/SetupScreen.tsx`: `SetupMember` に `gender` を持たせ、
  `addCharacter` / テンプレ追加双方から伝播
- `frontend/src/lib/buildDebateState.ts`: `characters[i].gender` を埋める
- `frontend/src/screens/DebateStage.tsx`: TTS URL に `gender` を付与
  （`state.characters.find(c => c.name === speaker)?.gender`）

---

## D18: TTS をサーバー LRU + in-flight coalescing で再合成スキップ (T71)

**判断**: `/api/tts` の内部に「(text, speaker_id) → wav bytes」の LRU キャッシュ
（最大 128 エントリ）を持たせる。さらに同一キーの in-flight リクエストを
1 つの `asyncio.Future` で共有する coalescing を入れて、フロント prefetch (T70) と
本番再生のリクエストがほぼ同時に到達しても VOICEVOX を 1 回しか叩かないようにする。
フロント側の Blob URL キャッシュ (T70) は引き続き保持し、二段構えにする。

**理由**:

- 同じ text + 同じ speaker_id なら VOICEVOX の出力は決定的。再合成しないだけで
  数百 ms〜数秒の遅延を消せる
- フロント prefetch だけだと初回ターン・ユーザー介入直後・ユーザーがすぐ「次へ」を
  押した場合に miss する（T70 解説参照）。サーバーキャッシュを足すと、prefetch が
  間に合わなかったケースでも 2 回目以降のリクエスト（巻き戻し再生、再ロード等）が
  即返る
- in-flight coalescing は「prefetch のレスポンスが返る前に本番リクエストが来た」
  ケースで効く。2 本の HTTP リクエストが同じ Future を await するので、VOICEVOX の
  合成は 1 回だけ
- LRU 上限 128 は 1 セッションで生じうるユニーク発話数（数十）の数倍。1 wav あたり
  数十〜数百 KB なので最大でも数十 MB に収まる
- 失敗時は cache にも in-flight にも入れず、次のリトライに任せる（D04 のフォールバック
  と同じ思想：失敗を握り潰さない）

**理由（採用しなかった代替案）**:

- `functools.lru_cache`: 非同期関数に直接かけられない（sync 関数化すると VOICEVOX
  通信が別スレッド化する）。OrderedDict 直書きの方が薄くて読める
- Redis / SQLite: D03（DB 入れない）に反する。プロセス内 LRU で十分
- フロントだけで完結させる: ブラウザリロードで失われる。サーバ側もキャッシュした方が
  デモのリトライに強い

**影響範囲**:

- `DECISIONS.md`: 本ファイル（D17 と並ぶ TTS 関連判断）
- `docs/ARCHITECTURE.md`: `/api/tts` 行に LRU + coalescing を追記
- `backend/app/tts.py`:
  - `_TTS_CACHE_MAXSIZE = 128`, `_tts_cache: OrderedDict[(text, speaker_id), bytes]`,
    `_inflight: dict[(text, speaker_id), Future[bytes]]`
  - `_cache_get` / `_cache_put` (LRU)
  - `_fetch_voicevox`: VOICEVOX への素の HTTP 往復（キャッシュを見ない）
  - `_synth_cached`: cache → in-flight → 新規 fetch の三段
  - `generate_tts`: `_synth_cached` を呼んで `Response` を返す
- `backend/tests/test_tts.py`:
  - `_reset_tts_cache` autouse fixture でモジュール状態を毎回クリーン化
  - キャッシュ命中・別キー分離・LRU 追い出し・recent access 保護・
    coalescing・失敗時 in-flight 掃除・generate_tts ハッピーパスの 7 ケース

---

## 追加判断の書き方

新しい判断は `D10`, `D11`, ... と連番で追加し、`判断 / 理由 / 影響範囲` を書く。
