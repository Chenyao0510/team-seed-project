### `progress.md` (技術仕様・進捗・タスク)

```markdown
# PROGRESS.md -- アーキテクチャ・機能キュー・進捗トラッカー

## 1. Tech Stack & Processing Architecture

本プロジェクトは、複雑なマルチエージェントフレームワーク（LangGraph等）を**使用しない**。すべての状態管理と構造化データ生成は、単一のJSON Stateを介してGemini APIに直接委ねるシンプルなアーキテクチャとする。

* **Frontend:** React, Next.js (or Vite), Tailwind CSS v4, Framer Motion
* **Backend:** Node.js / Python API (Gemini APIのラッピング)
* **Core Mechanisms:**
    * **Gemini API Structured Output:** `/api/next_turn` や `/api/summarize` エンドポイントでは、過去の全ログ（State）をGeminiに渡し、JSONスキーマを強制して次の発言や構造マップを一撃で生成させる。
    * **Dynamic Avatar Generation Pipeline (アバター動的生成基盤):**
        Screen 0（初期メンバー編成）および Screen 1（人物追加アクション）で共通して使用される処理フロー。
        1. ユーザーが名前を入力（例：「織田信長」）。
        2. バックエンドがGemini (Search Grounding等) を用いて、その人物の最適なビジュアルリファレンス（画像検索結果）を取得。
        3. 取得したリファレンスを元に、画像生成API (Nanobanana等) を叩き、アバター画像を生成。
        4. 生成された画像の背景透過処理を実行。
        5. FrontendへURLを返し、UIに反映。

---

## 2. 現在の状態

**ベースライン**: インフラ初期化完了
（リポジトリ構造・ドキュメント・Makefile・backend スケルトン・frontend Vite 雛形）

**直近の verify**: 未実施。最初のタスクで `make init && make verify-all` を通す。

## 3. 既知の問題
- frontend に vitest 未導入（`make test` は backend のみ実行）
- `frontend/index.html` の `<title>` が `frontend` のまま（後続で `Insight Navigator` に変更）

### 並行作業の準備物（完了済）
- `fixtures/` にフロント・バック共有の State JSON サンプル配置
- `frontend/src/mocks/` から import 可能（backend 起動不要で描画開発できる）
- `backend/tests/fixtures/` で同じ JSON を pytest 検証
- 担当割り当て: 下記タスクキューに `[Front]` / `[Back]` / `[Both]` で明示
- 詳細ルールは `AGENTS.md` の「並行作業ルール」セクション参照

---

## 4. タスクキュー

凡例: `[ ]` Todo / `[~]` In Progress / `[x]` Done
凡例の担当: `[Front]` / `[Back]` / `[Both]`（要連携）

### Phase 0: ベースライン疎通
- [x] **T01** `[Both]`: `make init` で全依存関係インストール、`make verify-all` がグリーン
  - 検証基準: `/api/health` が 200 を返す、frontend `vite build` が成功、pytest がグリーン
  - 実績: 2026-06-13 セッションで `make verify-all` グリーン確認済 (frontend lint / tsc / ruff / pytest 1 passed / vite build 全通過)
- [x] **T02** `[Front]`: フロントに Tailwind CSS v4 を導入し、`@import "tailwindcss"` を有効化
  - 検証基準: 任意の Tailwind クラスが効くサンプル要素で確認
  - 実績: `tailwindcss@4.3.1` + `@tailwindcss/vite@4.3.1` 追加、`vite.config.ts` にプラグイン追加、`src/index.css` に `@import "tailwindcss";` 追加。`App.tsx` に smoke 要素 (`data-testid="tailwind-smoke"`) を仮置きし、build 出力 CSS に `.bg-emerald-500` / `.rounded-md` / `.font-bold` / `.text-white` 全 4 クラス含有を grep で確認。CSS サイズ 4.10 → 10.81 kB。smoke は T11 着手時に削除予定。

### Phase 1: Screen 0 (テーマ入力と初期化)
- [x] **T11** `[Front]`: テーマ入力フォーム + 初期登場人物入力 UI
  - 検証基準: 入力した人物名がリスト化されること
  - 実績: `frontend/src/screens/SetupScreen.tsx` を新設。テーマ入力 + メンバー入力（Enter キー or 「追加」ボタン）+ メンバー削除 + 「議論を開始する」ボタン（テーマあり & メンバー2名以上で活性）を実装。`SetupResult` 型と `onSubmit` callback を T13 用の接続点として export。`App.tsx` から Vite テンプレを削除し SetupScreen をレンダリング。未使用テンプレ資産（`App.css`、`src/assets/*`、`public/icons.svg`）を削除。`make verify-all` グリーン、`make dev-frontend` で HTTP 200 確認。
- [x] **T12** `[Both]`: 動的アバター生成パイプラインの実装と接続
  - Back: `/api/add_character` を実装（Gemini Search → nano banana 画像生成 → OpenCV クロマキー透過）
    - 実績: 2026-06-13 実装完了。`backend/app/{config,gemini_client,background_removal,avatar_pipeline,models,routes}.py`
      を追加し `/static/avatars/*` で配信。`make verify-all` グリーン、実APIで疎通確認済（詳細は `DECISIONS.md` D10）
  - Front: 各メンバー名で順に叩き、avatar_url を State に集約
    - 実績: 2026-06-13 実装完了。初期メンバー名からGemini検索→Nanobanana生成→透過処理が走り、画像URLの配列が返却されること
- [x] **T13** `[Front]`: Screen 0 から Screen 1 への遷移と State 引き継ぎ
  - 検証基準: 生成された画像URLを含むStateが Screen 1 に渡り、初期描画に利用されること
  - 実績:
    - Debate State スキーマに `characters: [{name, avatar_url}]` を追加（DECISIONS D01 / docs/ARCHITECTURE / fixtures / backend test_fixtures を同一 PR で更新）
    - `frontend/src/types/state.ts` に DebateState / IntegrationState 型を定義、mocks をその型に統一
    - `frontend/src/lib/buildDebateState.ts` に SetupResult → 初期 Debate State の組み立て関数（avatar_url はプレースホルダー、T12 で実 URL に置換予定）
    - `frontend/src/screens/DebateStage.tsx` を stub として追加（roster と avatar をグリッド表示、T21 で本格化）
    - `App.tsx` を `view: 'setup' | 'debate'` の useState で切替に変更、SetupScreen の onSubmit を配線
    - `make verify-all` グリーン (pytest 3 passed / vite build OK / dev server HTTP 200)

### Phase 2: Screen 1 (討論 + 介入)
- [x] **T21** `[Front]`: ギャルゲ風横並びステージUI（登場人物カード + 中央テロップエリア）
  - 検証基準: モック State (`frontend/src/mocks/debateStateSample`) で発話が表示され、ユーザーアバターが右端に配置される
  - 実績:
    - `DebateStage.tsx` を本実装に差し替え。3 ペイン構成 (Header / PointsPanel / Stage area)、ダーク stage 配色
    - `CharactersRow`: AI を `state.characters` 順に左から並べ、`active_character` のみ scale-110 + emerald 発光リングでハイライト。`status` ラベル (思考中 / 発言中 / 待機中) 表示
    - **ユーザーアバターを `justify-between` で右端固定**、amber リング・「あなた」表示で AI と視覚的に区別（プレースホルダー URL 使用、T12 で差し替え可能）
    - `TelopBox`: ギャルゲ風ボックスで `current_speech` をスピーカー名つきで表示、空時は status に応じたフォールバックメッセージ
    - `PointsPanel`: 左サイドに `current_points` をカード表示（空ハンドリング含む）
    - Header: 3 カラムで topic（左）/ theme（中央）/ 過去ログボタン（右、`onOpenHistory` を T22 用 callback として export）
    - `App.tsx` に `?mock=debate` URL ショートカット追加（`debateStateSample` で直接 DebateStage 描画 → 目視検証用、T41 完成時に削除）
    - 各要素に `data-testid` 付与（後続 vitest 用）
    - `make verify-all` グリーン、dev server `/` と `/?mock=debate` ともに HTTP 200 を確認
- [x] **T22** `[Front]`: LINE風の過去ログUI（小さな丸アイコン付きスライドインパネル）
  - 検証基準: トグルでログ表示/非表示が切り替わり、アイコンが正しく表示される。合わせて会話の開始・進行処理も動作すること。
  - 実績: 
    - `DebateStage.tsx` に `isHistoryOpen` stateと、右側からスライドインするDrawer UIを追加。`chat_history` の内容をLINE風（ユーザーは右配置＋緑吹き出し、AIは左配置＋グレー吹き出し）で表示するように実装。
    - また、会話を開始・進行するための処理を実装。初期状態で発言がない場合は自動的に `nextTurn` APIを叩き、以降は「次へ」ボタンで進行できるようにした。
- [x] **T23** `[Front]`: 介入アクション（異議・観点・質問）の入力モード実装
  - 検証基準: キーボード入力が中央テロップに表示され、Stateに追記される
  - 実績: 2026-06-13 実装完了。`DebateStage.tsx` に `ActionBar`（人物追加/異議を唱える/観点追加/質問/議論を整理する）を追加。
    人物追加・議論を整理するは T25/T31 までの無効プレースホルダー。異議・観点・質問クリックでテロップが
    `textarea` の入力モードに切替（見出し `あなた（{種別}）`、Cmd/Ctrl+Enter で送信・Esc でキャンセル）。
    送信時に `active_character: 'あなた'` / `current_speech: '（{種別}）{入力文}'` / `status: 'speaking'`
    で State を更新（`onIntervene` callback、`App.tsx` で配線）。`chat_history` への直接追記は行わず、
    D11 の `/api/next_turn` 側アーカイブ・roster外発言への反応ロジックに委ねる設計（スキーマ変更なし）。
    `make verify-all` グリーン、`?mock=debate` で playwright による動作確認済（入力表示・State反映・キャンセル）。
- [x] **T24** `[Back]`: `/api/next_turn` 実装（State 受け取り → Gemini JSON構造化生成 → State 返却）
  - 検証基準: LangGraphなしで、Geminiが正しく次のキャラと発言、論点リストを更新して返す（pytest で `backend/tests/fixtures` のサンプルから検証）
  - 実績: 2026-06-13 実装完了。`backend/app/models.py` に `DebateState` 系 pydantic モデルと
    `NextTurnLLMOutput`（Gemini responseSchema 用）を追加。`backend/app/gemini_client.py` に
    `generate_next_turn`（D04 JSON Mode）を追加。`backend/app/debate.py`（新規）で
    chat_history アーカイブ + roster ローテーションフォールバックのオーケストレーション
    `advance_turn` を実装し、`POST /api/next_turn` を `routes.py` に追加。詳細は
    `DECISIONS.md` D11。`backend/tests/test_next_turn.py` を新規追加（正常系・Gemini失敗
    フォールバック・不正State 422 の3テスト）。合わせて T13 由来の既存 TS 型エラー
    (`frontend/src/lib/buildDebateState.ts`) を修正。`make verify-all` グリーン
    (pytest 9 passed / ruff / tsc / vite build 全通過)。
- [x] **T25** `[Both]`: 人物追加モーダルUIとアバター生成パイプライン（T12）の再利用
  - Front: モーダル UI + `/api/add_character` 叩き + ステージへの追加描画
  - Back: T12 のパイプラインを再利用（API 変更なし）
  - 検証基準: 討論途中で名前を入力し、新規キャラがステージに追加されること
  - 実績: 2026-06-13 実装完了。
    - `DebateStage.tsx` の `ActionBar` 「人物追加」ボタンを活性化し、押下で `AddCharacterModal`
      を表示。モーダルは名前入力 + 重複チェック（`state.characters` の `name` 一覧と一致したら
      警告表示・送信ブロック）+ Enter 送信 / Esc キャンセル / クリックアウトでクローズ。
    - 送信時に `addCharacter(name)` (`/api/add_character`) を叩いて `avatar_url` を取得し、
      `onAddCharacter({name, avatar_url})` callback で親へ通知。送信中はオーバーレイクリックと
      ボタン操作を無効化。エラー時はモーダル内に rose 色のメッセージを表示しモーダル維持。
    - `App.tsx` で `onAddCharacter` を配線し、`state.characters` に新規キャラを append した
      新規 State をセット（ミューテーションなし）。`CharactersRow` は既に `state.characters` を
      `justify-between` で描画しているため、追加キャラは AI 群の末尾（ユーザーの左隣）に表示される。
    - スキーマ変更なし（D01）。バックは T12 で実装済の `/api/add_character` を再利用。
    - `make verify-all` グリーン（lint / tsc / ruff / pytest 9 passed / vite build 全通過）、
      `dev-frontend` で `/` と `/?mock=debate` 両方 HTTP 200 を確認。
- [x] **T26** `[Front]`: Reflection Turn UI（介入の余白表示）
  - 目的:
    - ユーザーへ介入を強制しない
    - AIから次の視点を誘導しない
    - 現在の議論構造を可視化し、人間が介入するか継続するかを選択できる状態を作る
    - 現状の内容をsummaryする
  - 実装:
    - 一定ターン数（例: 3ターン）ごとに Reflection Panel を表示
    - 表示内容は以下のみ
      - 現在の論点一覧
      - 現在フォーカス中の論点
      - 現在の問い
      - 現在の論理の要約をブロックごとに、論点のブロックの中で立場ごとにキャラクタのアイコンを入れる
    - AIによる「足りない視点」「追加すべき人物」の提案は禁止
    - ユーザーが以下を選択可能
      - 続きを見る
      - 人物追加
      - 観点追加
      - 異議を唱える
      - 議論を整理する
  - 検証基準:
    - Reflection Panel表示中も入力を強制されない
    - 「続きを見る」で討論が継続できる
  - 実績: 2026-06-13 実装完了。`DebateStage.tsx` に `ReflectionPanel`（オーバーレイ）を追加。
    `/api/next_turn` 成功ごとにフロント側でローカルに `turnCount` を集計（ユーザー介入はカウント
    しない）し、`REFLECTION_INTERVAL`（=3）ターンごとに表示。表示内容は「現在の問い」=`theme`、
    「フォーカス中の論点」=`current_topic`、「論点一覧」=`current_points`、「参加者」=
    `characters` のアイコン一列（既存 `DebateState` の範囲、スキーマ変更なし）。
    アクションは「続きを見る」（パネルを閉じて `nextTurn` を継続）、「観点追加」「異議を唱える」
    （既存 T23 の介入入力モードへ遷移）、「人物追加」「議論を整理する」（T25/T31 までの無効
    プレースホルダ）。`make verify-all` グリーン（playwright 未使用、dev server `/?mock=debate`
    で HTTP 200 を確認）。
    - **退避（未実装・後続タスク）**:
      - facilitator（参加者外AI）の一言は**静的な中立コピー**（視点提案なし）。後ほど
        facilitator を動的化（参加者外AIによる要約一言の生成）する。バック依存のため新規
        エンドポイント or `/api/next_turn` 拡張で対応する後続タスクが必要。
        → **2026-06-13 追加セッションで対応済み**（下記）。
      - 「論点 × 立場 × キャラクタアイコン」の構造化要約は現スキーマに無いため未実装。
        現在は参加者ロスターのアイコンを一列表示するのみ（立場分けなし）。reflection 用の
        構造化要約をバックで生成する後続タスクで対応する。
        → **2026-06-13 追加セッションで対応済み**（下記）。
      - `turnCount` はフロントのローカル state で集計（T27 の backend `turn_count` 未導入の
        ため）。T27 実装時に backend から返る `turn_count` ベースの判定へ差し替えること。
        → **T27 で対応済み**（下記）。
    - **追加実績（2026-06-13 / D13）**: 上記2点の退避項目を解消。新規
      `POST /api/reflection`（`backend/app/{models,gemini_client,reflection,routes,config}.py`）
      が Debate State から `ReflectionSummary`（`facilitator_comment` + 論点ごとの
      `blocks[].stances[].label/summary/characters`）を Gemini JSON Mode (D04) で生成し、
      Gemini 失敗時・roster外名は決定論的フォールバック/フィルタで UI を壊さない。
      `DebateStage.tsx` の `maybeShowReflection` が turn_count 発火時に `/api/reflection`
      を呼び、`ReflectionPanel` は facilitator 一言を表示し、`blocks` を論点×立場×
      キャラアイコンで描画（`blocks` 空時は従来の論点一覧+参加者一覧にフォールバック）。
      パネルの「人物追加」ボタンも活性化し T25 の `AddCharacterModal` を再利用。
      `fixtures/reflection_summary_sample.json` 新規、`backend/tests/test_reflection.py`
      (3 tests) 追加。`make verify-all` グリーン（pytest 13 passed）。
    - **追加実績（2026-06-13 / 認知負荷極小化の引き算UI改修）**: `ReflectionSummary`
      スキーマは変更せず、`ReflectionPanel` の表示をフロント側のみで再設計。
      `facilitator_comment`・「現在の問い」(`theme`)・「論点一覧」(`current_points`)・
      各 `stance.summary` の文章表示を削除（`stance.summary` は hover 時の `title`
      属性としてのみ保持）。最上部に「現在の論点：{current_topic}」を大きく表示し、
      `summary.blocks` を `VsRow`/`StanceChip` による対立構造マップ（`[アイコン] ラベル
      VS ラベル [アイコン]`、2立場時は左右ミラー表示）として描画。アクションは
      「このまま議論を見守る（次へ）」「介入する（異議/観点/質問）」の2button に縮小し、
      「介入する」選択後に異議/観点/質問の3択を表示する2段階構成。「人物追加」
      「議論を整理する」はパネルから削除（メインの `ActionBar` から操作可能）。
      モーダルは背景クリックで閉じない仕様を維持（トグル式にしない）。
      `make verify-all` グリーン（pytest 13 passed / lint / tsc / build 全通過）。
- [x] **T27** `[Back]`: Turn Counter の導入
  - 目的:
    - Semanticな「膠着状態判定」を行わず、決定論的にReflection Turnを発火させる
  - 実装:
    - DebateStateへ `turn_count` を追加
    - `/api/next_turn` 実行時にインクリメント
    - フロントエンドが一定ターンごとにReflection Turnを表示できるようにする
  - 検証基準:
    - turn_countが正常に増加する
    - Reflection Turnの表示タイミングが安定する
  - 実績: 2026-06-13 実装完了（D12）。`backend/app/models.py` の `DebateState` に
    `turn_count: int = Field(default=0, ge=0)` を追加、`backend/app/debate.py`
    `advance_turn` が `turn_count=state.turn_count + 1` を返す。`fixtures/debate_state_sample.json`
    / `frontend/src/types/state.ts` / `frontend/src/lib/buildDebateState.ts` を同期。
    `backend/tests/test_next_turn.py` の正常系・フォールバック両テストに
    `turn_count` インクリメントの assertion を追加。
    合わせて T26 の残作業として `DebateStage.tsx` のローカル `turnCount` 集計
    (`advanceTurnCount`) を撤去し、`nextTurn` の戻り値 `turn_count` を
    `REFLECTION_INTERVAL` で判定する `maybeShowReflection` に差し替え。
    T26 の他の退避2項目（動的facilitator・論点×立場×キャラアイコンの構造化要約）は
    新規バックエンド拡張が必要な未着手の後続タスクとして残存。
    `make verify-all` グリーン（pytest / ruff / tsc / vite build / lint 全通過）。

### Phase 3: Screen 2 (結論)
- [ ] **T31** `[Back]`: `/api/summarize` 実装（全履歴 → Gemini JSON統合レポート生成）
  - 検証基準: pytest で構造化レポート (Before/After/Bento UI用Map) が返る（`integration_state_sample.json` のスキーマに準拠）
- [ ] **T32** `[Front]`: 結論画面 UI（枠なしBento UI、staggerアニメーション、介入称賛）
  - 検証基準: モック State (`integrationStateSample`) を Framer Motion で順次構築でき、API 接続後も同様に動く
- [ ] **T33** `[Front]`: 構造のリアルタイム可視化
  - 目的:
    - ユーザーが議論ログを追い続けなくても議論の構造変化を把握できるようにする
  - 実装:
    - Screen1左サイドパネルを単なる最新論点一覧ではなく「現在の構造ビュー」として強化
    - Geminiが返す current_points の増減や変化をアニメーション表示
    - 新規論点が追加された場合は視覚的に強調
  - 検証基準:
    - 議論の進行に応じて論点構造が更新される
    - 長いログを読まなくても現在地が把握できる

### Phase 4: E2E 統合
- [ ] **T41** `[Both]`: Screen 0 → 1 → 2 のエンドツーエンドシナリオテスト
  - 検証基準: 1 シナリオを通しで実行し、アバター生成から最終マップ構築までStateが破綻しない

---

## 5. セッションログ
セッション終了時にこのセクションへ追記する。

- `2026-06-13`: T25 `[Both]` 人物追加モーダル UI 実装完了（バックは T12 `/api/add_character` を再利用、API/スキーマ変更なし）。`make verify-all` グリーン。
- `2026-06-13`: T24 `[Back]` `/api/next_turn` 実装完了（D11）。`make verify-all` グリーン。
- `2026-06-13`: T23 `[Front]` 介入アクション（異議・観点・質問）入力モード実装完了。`make verify-all` グリーン。
- `2026-06-13`: T26 `[Front]` Reflection Turn UI 実装完了。`turn_count` はフロントローカル集計の暫定実装、facilitator は静的コピー。`make verify-all` グリーン。
- `2026-06-13`: T27 `[Back]` Turn Counter 導入（D12）。`DebateState.turn_count` を追加し `/api/next_turn` で+1。T26 の暫定実装（ローカル `turnCount` 集計）を backend 由来の `turn_count` 判定に差し替え。`make verify-all` グリーン。
- `2026-06-13`: T26 `[Both]` 残作業（D13）。新規 `POST /api/reflection` で動的 facilitator 一言 + 論点×立場×キャラアイコンの構造化要約を生成。`DebateStage.tsx` の Reflection Panel を `blocks` 駆動に改修し、人物追加ボタンを活性化。`make verify-all` グリーン（pytest 13 passed）。
- `2026-06-13`: T26 `[Front]` Reflection Panel の認知負荷極小化（引き算UI改修）。`ReflectionSummary` スキーマは不変、フロント描画のみ変更。facilitator一言・現在の問い・論点一覧・各stance summaryの文章表示を削除（summaryはhoverのtitleのみ）。最上部に「現在の論点」を大きく表示し、`summary.blocks` を対立構造マップ（VS表示）で描画。アクションを「見守る（次へ）」/「介入する（異議/観点/質問）」の2button構成に縮小（人物追加・議論を整理するはパネルから削除）。モーダルは背景クリックで閉じない仕様を維持。`make verify-all` グリーン。
- `2026-06-13`: T26 `[Both]` Reflection Panel 微調整。(1) `_build_next_turn_prompt`（`gemini_client.py`）の `current_topic` 指示を「名詞句を『/』で区切った10〜20文字」に変更し、より端的な論点表現を促す。(2) `StanceChip` を改修し、`stance.summary` を hover 専用 (`title`) から、`label`（太字）の下に常時表示する `text-sm text-gray-400` の補足テキストに変更（VS構造のレイアウトは維持）。`fixtures/reflection_summary_sample.json` の `topic` を新形式に更新。`make verify-all` グリーン。
- `2026-06-13`: T26 `[Front]` Reflection Panel のアクション配色とVS構造を調整。(1) 「介入する」を emerald（強調）、「見守る」を枠線のみに変更し、介入の選択を誘導。(2) `StanceChip` の人物アイコンを横並び (`-space-x-2`) から縦並び (`flex-col -space-y-2`) に変更し、同じ立場の人物をまとめて配置。(3) `VsRow` を拡張し、立場が2つの場合は左右ミラーのVS表示を維持しつつ、3つ以上の場合は各立場を行として縦に積み、行間に "VS" 区切りを挟む構造に変更（3人目以降の立場も同形式で行を追加するだけで対応可能）。`make verify-all` グリーン。
- `2026-06-13`: T26 `[Front]` Reflection Panel をさらに微調整。(1) `VsRow` の3立場以上の表示で、各立場（同じ意見の人物グループ）を `border border-slate-700` の枠付きブロックとして視覚的に区切り、ブロックを縦に積んで間に "VS" 区切りを表示。(2) `ReflectionPanel` で `summary.blocks` を `slice(-2)` し、論点（topic）を直近2件のみ表示するように変更。(3) 介入ボタンの文言を「介入する（異議/観点/質問）」→「発言する（異議/観点/質問）」に変更。`make verify-all` グリーン。

## 6. ハンドオフメモ
次セッションが最初に読むべきメモ:
- T01 は完了済。各自 `make verify-all` がグリーンになることだけ確認してから着手する。
- T12（アバター生成パイプライン）はScreen 0とScreen 1(T25)で共通利用するため、再利用可能な関数・APIとして設計すること。
- 状態管理はLangGraphを使わず、すべてGeminiのStructured Outputに依存する設計方針に注意。
- フロント・バック並行作業のため、`fixtures/` の State JSON をスキーマ Source of Truth として扱う。スキーマ変更時は `DECISIONS.md` D01 → `docs/ARCHITECTURE.md` → `fixtures/*.json` を同一 PR で揃える。
- T13 で Debate State に `characters` フィールドを追加した。フロント `buildInitialDebateState()` は現状プレースホルダー URL を入れている。T12 でここを `/api/add_character` の戻り値に置き換える。
- フロント型は `frontend/src/types/state.ts`、Debate Stage 本体は T21 で `frontend/src/screens/DebateStage.tsx` を差し替える形で実装する（props 契約: `state: DebateState`）。
- T26 で Reflection Panel を実装し、T27 で `DebateState.turn_count`（D12）を導入してフロントのローカル集計を backend 由来の値に差し替え済み。Reflection の発火判定は `DebateStage.tsx` の `maybeShowReflection`（`turn_count % REFLECTION_INTERVAL === 0`）。
- 「論点×立場×キャラアイコン」の構造化要約は D13 で `POST /api/reflection`（`ReflectionSummary`）として実装済み。`maybeShowReflection` が発火時に呼び出す。Gemini 失敗時・`blocks` 空時は `blocks: []` のフォールバックを返す。
- Reflection Panel は認知負荷極小化のため `blocks` を文章ではなく VS 構造で描画する設計（2026-06-13 改修）。`summary.facilitator_comment` は API レスポンスに残るが UI には表示しない。`current_topic` をパネル最上部に大きく表示し、`summary.blocks` を `VsRow`/`StanceChip`（アイコン + label、`stance.summary` は hover の `title` のみ）で描画。`blocks` が空の場合はロスター一覧アイコンにフォールバック。アクションは「見守る（次へ）」/「介入する」の2button（介入選択後に異議/観点/質問の3択）。モーダルは背景クリックで閉じない。
