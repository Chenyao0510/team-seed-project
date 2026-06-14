# PROGRESS.md -- アーキテクチャ・機能キュー・進捗トラッカー

## 1. 概要
本ファイルは「Insight Navigator」の残作業・機能追加・改善タスクを管理する。
過去の完了タスク（Phase 0〜4）については `PROGRESS_done.md` を参照のこと。

## 2. タスクキュー (Phase 5: UX向上・AI品質改善・追加機能)

凡例: `[ ]` Todo / `[~]` In Progress / `[x]` Done
担当: `[Front]` / `[Back]` / `[Both]`（要連携）

### フロントエンド (UX / UI / アニメーション)
- [x] **T51** `[Front]`: **強制介入ターンのUI改善**
  - 観点と対立の構造をより視覚的に分かりやすく整理し、見やすくする。
- [x] **T52** `[Both]`: **アバター背景透過の精度向上**
  - AIを用いて透過することによってきれいな透過を実現した。
- [ ] **T53** `[Front]`: **ユーザー介入操作のUI統合**
  - 議論画面において「質問」「観点追加」などの操作アクションを分かりやすくまとめる(集約する,ユーザ介入モーダルのように)。
- [ ] **T54** `[Front]`: **フルスクリーンフィット化**
  - 画面が意図せずスライド・スクロールしてしまう問題を修正し、画面内に収める。
- [x] **T55** `[Front]`: **立ち絵表示と発言ハイライト**
  - 人物アバターを円形ではなく「立ち絵」として表示。発言中のキャラクターを光らせるなどの動的表現（アニメーション）を追加し、より魅力的にする。
- [ ] **T56** `[Front]`: **論点の2軸マッピングUI**
  - 論点を2軸（XY座標）上にプロットし、ノード上に文字を表示する高度な可視化の実装。（保留） 
- [ ] **T57** `[Front]`: **音声入力対応**
  - ユーザーの発言をマイクから音声で入力できるようにする。
- [x] **T58** `[Both]`: **Screen 0でのユーザーアバター追加**
  - 初期画面（SetupScreen）で、ユーザー自身のアバターも登録できるようにする。
  - State スキーマに `user:{name,avatar_url}` を追加 (DECISIONS D01)。SetupScreen に画像アップロード / AI生成の2モードで登録 UI を追加。DebateStage 右端のユーザーアバターと、ユーザー介入発言の `chat_history.avatar_url` を `state.user` から解決。
- [x] **T59** `[Both]`: **最終画面のレイアウト修正**
  - 当初 `[Front]` だったが、中心ノード `central_concept` を `IntegrationState` に追加する方針（仕様例 `[ハッカソン]` の単語表示のため）に伴い `[Both]` に変更。詳細は DECISIONS D15。
  - Screen 2 を Bento UI 中心ノード型レイアウトに刷新（中心 `central_concept` + 周辺カテゴリカード + SVG 関係線 + 介入トレース + 1〜2 行 Feedback）。アニメは Framer Motion で「カードが中心から飛び出してオーバーシュート着地」「中心ノードのリング永続回転 + breathing」「線が伸びる」「介入トレース 5 段 sequential 発光」を実装。
- [x] **T5A** `[Both]`: **事前生成キャラクターテンプレートのセットアップ追加**
  - SetupScreen 右側に「テンプレートから追加」パネルを設け、オバマ / イーロン・マスク / ソクラテス等の事前生成済みアバターをクリック1回で初期メンバーに加えられるようにする。
  - 動的アバター生成パイプライン（Gemini Search + nano banana + OpenCV）を毎回回す必要が無くなり、デモ・開発時のセットアップ時間を短縮する。詳細は DECISIONS D16。
- [x] **T5B** `[Front]`: **立ち絵下のキャラクター名表示を削除**
  - 議論画面（DebateStage）でキャラクター立ち絵の下に表示されている人物名（name ラベル）を非表示にする。視覚ノイズを減らし、立ち絵そのものに視線が集まるようにする。
  - 発言中のキャラクター識別はテロップ側で行えば十分なので、立ち絵下のテキストは不要。


#### バックエンド (AI生成品質 / 状態遷移 / APIパフォーマンス)
- [x] **T61** `[Both]`: **強制ターンと発言ターンの状態管理分離（競合修正）**
  - `/api/think` による思考フェーズの分離と、ユーザーによる「次へ」ボタンの明示的な進行制御により、AI発言とユーザー介入・強制ターンの競合を根本的に解消。

- [ ] **T62** `[Back]`: **人物発言時時のプロンプト調整**
  - 人物代弁時、本人らしさ(本人ならではの経験や)を強化し、相手への過度な尊重を省く。文章が伸びないよう、主張を短く・はっきり・断定的に出力させる, T64と関連
- [x] **T63** `[Back]`: **文脈に応じた発言者の動的アサイン**
  - 会話ログの文脈から「次に誰が喋るべきか」をLLMに判断させ、発言者を動的に決定。`/api/think` による先行思考と話者交代ロジックの強化で実装済み。
- [ ] **T64** `[Back]`: **人物の会話生成処理の総合的チューニング**
  - 議論の一貫性向上、端的な発言、論点ズレ防止、紳士的すぎる口調の修正（断定的に・キャラに合わせる）、堂々巡りの防止策の実装。（※最終的な仕上げとして実施）,T62と関連
- [x] **T65** `[Back]`: **Reflection APIのPre-fetch（先行読み込み）**
  - リフレクションターンの1ターン前にバックグラウンドで `/api/reflection` を実行。結果をキャッシュし、パネル表示時のロード時間を解消。

- [ ] **T66** `[Back]`: **ファシリテーターAIの導入**
  - 議論を整理・進行する専用のファシリテーターAIを組み込む（設計とプロンプト方針の検討）。
- [x] **T67** `[Back]`: **偉人（AI）発言の音声読み上げ (TTS)**
  - 発言テキストに合わせて音声合成APIを叩き、偉人ボイスで読み上げる機能の追加。
  - バックエンドに `/api/tts` を追加。ローカルの VOICEVOX (`http://127.0.0.1:50021`) にプロキシして音声を合成。
  - フロントエンドでAI発言時 (`DebateStage.tsx` の `useEffect`) に `Audio` オブジェクトで再生するよう実装。
- [x] **T68** `[Both]`: **APIの先行バッチ処理とオートプレイ化**
  - `/api/think` による思考フェーズのバックグラウンド実行により、発言の待ち時間を解消。「次へ」クリック時の即時レスポンスを実現。
- [ ] **T69** `[Both]`: **TTS音声のキャラクター性別判定による話者割り当て**
  - 現状の T67 実装はキャラクター名のハッシュで `speaker_id` を割り当てているため、男性キャラに女声・女性キャラに男声が当たることがある。
  - キャラクター追加時に AI（Gemini）で性別カテゴリを判定し、`gender: "male" | "female" | "robot"` を State / pydantic スキーマに追加する。
  - VOICEVOX 話者プールを「男性3種類・女性3種類・ロボット1種類」のグループに分け、性別カテゴリ内でハッシュ分散して `speaker_id` を選ぶ。
  - 既存キャラクター（テンプレート含む）の `gender` 既定値とフォールバック挙動を `DECISIONS.md` に記録。スキーマ変更を伴うため `D01` 更新と `fixtures/` 更新を同一 PR でまとめる。


---

## 3. セッションログ
セッション終了時にこのセクションへ追記する。

- 2026-06-13: T58（Screen 0 ユーザーアバター追加）を実装。
  - T58: Debate State に `user` を追加（DECISIONS D01 / ARCHITECTURE / fixtures / backend pydantic / frontend を同一変更で更新）。SetupScreen に「あなたのアバター」登録 UI（アップロード / AI生成トグル）を追加。backend `_avatar_for` が roster 外のユーザー発言を `user.avatar_url` で解決。
  - backend テスト 20 passed、`make verify-all` グリーン。
- 2026-06-14: T59（Screen 2 Integration Map のレイアウト + アニメ刷新）を実装。
  - 当初 `[Front]` 単独タスクだったが、中心ノードに `theme` をそのまま置くとレイアウト破綻するため、`IntegrationState` に `central_concept: str` (max_length=12) を追加する方針を採用 → `[Both]` に再分類。
  - DECISIONS D01 に `central_concept` 追加 + D15 新規（Bento UI 中心ノード + 周辺カード + 関係線 + 介入トレース + アニメ順序）。`docs/PROJECT.md` Screen 2 章を T59 仕様で書き換え、`docs/ARCHITECTURE.md` の summarize データフローも追従。
  - backend: `_derive_central_concept` を `summarize.py` に実装（末尾の `？/か/のだろうか` 等を剥がし、最初の助詞で切る素朴正規化）。`gemini_client.py` のプロンプトに「短い名詞句 / 最大 12 文字」の指示を追加。
  - frontend: `lib/integrationLayout.ts`（カテゴリ数 → grid-template-areas + SVG slot 座標を返す純関数）、`components/integration/` 6 ファイル（GrowthHeader / CenterNode / StructureCard / ConnectionLines / InterventionTrace / FeedbackLine）を新設。`screens/IntegrationMap.tsx` をフルリライト。
  - 派手化: カードを中心から `rotate -720→0 + scale 0→1.18→1` で飛び出させ、中心ノードは永続点線リング回転 + 内側 breathing、線が伸びるタイミングに合わせて中心「ボン」flash、介入チェーンは ★ → 中心 → 強調線 → 強調カード → 強調 element の 5 段 sequential 発光。
  - コミット粒度: C1 docs+スキーマ宣言 / C2 backend 実装+テスト / C3 frontend 実装 / C3.5 アニメ強化 / C4 PROGRESS 更新 の 5 コミット。
  - backend テスト 20 passed、`make verify-all` グリーン。`http://localhost:5173/?mock=integration` で動作確認済み。
- 2026-06-14: T67（偉人AI発言の音声読み上げ TTS）を実装。
  - VOICEVOX（ポート50021）を使用。バックエンドに `/api/tts` エンドポイントを追加し、フロントエンドで `state.current_speech` 更新時に自動再生。
  - キャラクター名（人格）を元にハッシュを取り、男女含む複数の `speaker_id` に動的割り当てを行うようにした。
- 2026-06-14: T52（アバター背景透過の精度向上）、T55（立ち絵表示と発言ハイライト）を実装。
  - `backend/app/background_removal.py` で `cv2.GaussianBlur` を適用し、境界のエッジや緑色のフリンジを軽減。
  - `backend/app/gemini_client.py` で、アバターを円形アイコンから「全身の立ち絵」として生成するようにプロンプトを変更。
  - API スキーマと `DebateState` に `emotion` を追加し、Gemini に 8種類の感情 (neutral, happy, angry, sad, surprised, thinking, confident, confused) を分類させる。
  - `DebateStage.tsx` をギャルゲー風の立ち絵レイアウトに刷新。
  - 話しているキャラクターに上下に揺れる波形アニメーション (`y: [0, -15, 0]`) と、分類された感情に応じた SVG 絵文字エフェクト（キラキラ、怒りマーク、しずく等）を追加。
- 2026-06-14: T52 続き（画像参照付き生成 + 立ち絵の画面占有率アップ）。
  - `backend/app/image_search.py` を新設。汎用画像検索 (DuckDuckGo Images) を 2 段 (vqd トークン取得 → JSON API) で叩き、上位 5 件の中から最初にダウンロード成功した画像を採用。Wikipedia 未登録の人物（ブロガー、地方の有名人、若手の研究者等）でも引けるよう Wikipedia 依存はやめた。マジックバイトで PNG/JPEG/WebP/GIF を判別、4MB 上限。
  - `backend/app/gemini_client.generate_avatar_image` に `reference_image: tuple[bytes, str] | None` を追加し、`types.Part.from_bytes` で nano banana にマルチモーダル入力。プロンプトに「参照写真の顔立ち・髪型・年代をそっくり再現」指示を追記。NanoBanana が知らない人物でも別人にならないようにする。
  - `backend/app/avatar_pipeline.generate_character_avatar` で参照画像を取得→ description 生成→画像生成の順に差し替え。参照画像取得失敗時は description のみで生成にフォールバック（既存の例外ハンドリングは維持）。
  - 新規テスト `backend/tests/test_image_search.py` (6 ケース): DDG 成功 / 1件目失敗→次候補 / vqd トークン無し / 結果ゼロ / 巨大画像拒否 / MIME 判別不能。既存の `test_add_character.py` のスタブも新シグネチャに追従。
  - `frontend/src/screens/DebateStage.tsx` の立ち絵レイアウトを「列を flex-1 で均等分配 + 高さ `clamp(560px, 90vh, 1200px)`」に刷新。これまで固定幅 (clamp 220–460px) で並べていたため大型化するとユーザー丸が右画面外に押し出されていたが、`flex-1 min-w-0` 分配 + `shrink-0` の user 列で必ず画面内に収まるようにした。立ち絵自体も最大 860px → 1200px に拡大し、ほぼステージ全体を占有するサイズへ。
  - さらに「縦幅統一」要望を反映: 立ち絵 img を `absolute bottom-0 h-full w-auto max-w-none` に変更し、ステージの h-full で全員同じ縦サイズ、横はアスペクト比に応じた自然幅で描画。列幅 (`flex-1 min-w-0 max-w-[360px]`) より広い画像は隣にはみ出して重なる（ユーザー要望: 横重なり可）。
  - 立ち絵 PNG を bbox 自動クロップ: `backend/app/background_removal.py` で透過後 `alpha > 32` の最小外接矩形＋12px パディングにクロップ。これにより透過 PNG の余白が削れ、フロント側 `h-full w-auto` で表示したときキャラがステージを目一杯占めるようになる。`test_background_removal.py` に bbox クロップ／全透過時の現状維持ケースを追加。
  - backend テスト 30 passed、`make verify-all` グリーン。
- 2026-06-14: ベースライン修正と T5B（立ち絵下の名前削除）。
  - ベースライン修正: `DebateStage.tsx` の `interventionRef` を新 `react-hooks/immutability` ルール対応に変更（初期値 null + eslint-disable コメント）。`app/debate.py` の未使用 `roster_names` 削除。`gemini_client.py` の長すぎる行を折り返し。`tests/test_next_turn.py` を T63 リファクタ後の `generate_agent_thought` モック方式に書き換え（廃止予定の `NextTurnLLMOutput` への依存を解消）。
  - T5B: `DebateStage.tsx` の `CharactersRow` から立ち絵下の名前ピル (`<p>{c.name}</p>`) を削除。発言中ステータスラベル (`STATUS_LABEL[status]`) はアクティブ時のみ表示する小さなピルに残した。ユーザー自身の列（右端円形アバター、立ち絵ではない）は対象外。
  - backend テスト 41 passed、`make verify-all` グリーン。
