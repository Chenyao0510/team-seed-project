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
- [ ] **T52** `[Both]`: **アバター背景透過の精度向上**
  - OpenCVの処理工夫、または画像生成AIへのプロンプト調整で切り抜きの品質を上げる。
- [ ] **T53** `[Front]`: **ユーザー介入操作のUI統合**
  - 議論画面において「質問」「観点追加」などの操作アクションを分かりやすくまとめる(集約する,ユーザ介入モーダルのように)。
- [ ] **T54** `[Front]`: **フルスクリーンフィット化**
  - 画面が意図せずスライド・スクロールしてしまう問題を修正し、画面内に収める。
- [ ] **T55** `[Front]`: **立ち絵表示と発言ハイライト**
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


#### バックエンド (AI生成品質 / 状態遷移 / APIパフォーマンス)
- [ ] **T61** `[Both]`: **強制ターンと発言ターンの状態管理分離（競合修正）**
  - AI発言に強制ターンが上書きされ、アクションをキャンセル・進行すると発言が飛んでしまう（そのまま進む）問題を修正。
  - 発言Turnとユーザー入力Turn（強制ターン含む）のStateを分離し、キャンセル時は強制ターンに戻るようにする。(優先)
- [ ] **T62** `[Back]`: **人物発言時時のプロンプト調整**
  - 人物代弁時、本人らしさ(本人ならではの経験や)を強化し、相手への過度な尊重を省く。文章が伸びないよう、主張を短く・はっきり・断定的に出力させる, T64と関連
- [ ] **T63** `[Back]`: **文脈に応じた発言者の動的アサイン**
  - ユーザーの発言が無視される問題を修正。会話ログ（`chat_history`）の文脈から「次に誰が喋るべきか」をLLMに判断させ、発言者を動的に決定・更新する。
- [ ] **T64** `[Back]`: **人物の会話生成処理の総合的チューニング**
  - 議論の一貫性向上、端的な発言、論点ズレ防止、紳士的すぎる口調の修正（断定的に・キャラに合わせる）、堂々巡りの防止策の実装。（※最終的な仕上げとして実施）,T62と関連
- [ ] **T65** `[Back]`: **Reflection APIのPre-fetch（先行読み込み）**
  - 強制ターン（Reflection）用の対立構造読み込みAPIを裏で先に回し、結果を確保してUIの待機時間をなくす。（優先）
- [ ] **T66** `[Back]`: **ファシリテーターAIの導入**
  - 議論を整理・進行する専用のファシリテーターAIを組み込む（設計とプロンプト方針の検討）。
- [x] **T67** `[Back]`: **偉人（AI）発言の音声読み上げ (TTS)**
  - 発言テキストに合わせて音声合成APIを叩き、偉人ボイスで読み上げる機能の追加。
  - バックエンドに `/api/tts` を追加。ローカルの VOICEVOX (`http://127.0.0.1:50021`) にプロキシして音声を合成。
  - フロントエンドでAI発言時 (`DebateStage.tsx` の `useEffect`) に `Audio` オブジェクトで再生するよう実装。
- [ ] **T68** `[Both]`: **APIの先行バッチ処理とオートプレイ化**
  - APIアクセスを複数ターン分まとめて裏でプールしておく仕組み。レスポンスが返ってきたら自動でスムーズに進行するようにし、ユーザー体験の遅延を防ぐ。(優先)


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