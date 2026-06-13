# AGENTS.md -- ハッカソンエージェント運用ルール

## プロジェクト概要

**プロダクト**: "Insight Navigator" -- AI 同士の議論を観察・介入することで「答え」ではなく「問いの構造と進化」を持ち帰らせる Web アプリ。

**画面構成 (Setup → Stage → Map の 3 画面)**:

1. **Screen 0: Setup** (テーマ入力＆初期メンバー編成): テーマと初期登場人物を決定し、動的アバター生成パイプラインで全員分のアバターを事前生成する
2. **Screen 1: Debate Stage** (討論＆介入): ギャルゲ風横並びレイアウト + ユーザー右端固定 + 中央テロップ + 介入アクション群（人物追加・異議・観点・質問）
3. **Screen 2: Integration Map** (視座の獲得レポート): 枠なし Bento UI + Framer Motion stagger アニメで構造マップを構築

**技術スタック**:

- フロント: Vite + React 19 + TypeScript + Tailwind CSS v4 + Framer Motion (`frontend/`)
- バック: FastAPI + Python 3.13 + google-genai (Gemini) (`backend/`)
- 動的アバター: Gemini Search Grounding + 画像生成 API (Nanobanana 等) + 背景透過処理（Screen 0 / Screen 1 で共有）
- 状態管理: 画面ごとに定義された State JSON をフロント・バック間で POST キャッチボール（スキーマは `DECISIONS.md` D01）

詳しいプロダクト仕様は `docs/PROJECT.md`、システム設計は `docs/ARCHITECTURE.md` を参照。

## ドキュメント階層

```text
AGENTS.md            -- 本ファイル：エージェント運用ルール
CLAUDE.md            -- 即時参照：コマンド・ファイル位置
CONSTRAINTS.md       -- MUST / MUST NOT
PROGRESS.md          -- 機能キューと進捗
DECISIONS.md         -- 設計判断の理由
docs/PROJECT.md      -- プロダクト仕様
docs/ARCHITECTURE.md -- システム設計
```

## 出勤ルーティン (セッション開始時)

1. このファイル (`AGENTS.md`) を全部読む
2. `CONSTRAINTS.md` で MUST / MUST NOT を頭に入れる
3. `PROGRESS.md` を開き、**未着手タスクを 1 つだけ**選んで `[~]` に移す
4. 関連する `DECISIONS.md` のエントリを確認する
5. `make verify-all` でベースラインがグリーンか確認する
6. グリーンでないなら、それを最初に直す（新機能を壊れた状態の上に積まない）

## 作業ルール

- **タスクは同時に 1 つのみ**。並行進行禁止
- 完了判断は自己申告ではなく、`make verify-all` と動作確認の結果に基づく
- アーキテクチャに変更を加えるなら、先に `docs/ARCHITECTURE.md` を更新する
- マジックナンバー禁止。命名定数を使う
- ミューテーション禁止。新しいオブジェクトを返す
- ファイル <800 行、関数 <50 行を目安

## 退勤ルーティン (セッション終了時)

1. `make verify-all` がエラーなくグリーン
2. `PROGRESS.md` を更新（完了 → `[x]`、中断は状況メモを残す）
3. **1 つの論理操作 = 1 コミット (Atomic)** で git コミット
4. 次セッションが 出勤 ルーティンを通せば再開できる状態にする

## Definition of Done

タスクが完了とみなされるのは、次のすべてを満たしたとき:

1. `make verify-all` がエラーなく通る
2. 対象機能を手動で動作確認した
3. テストが存在し Pass している
4. `docs/ARCHITECTURE.md` が現状を反映している
5. `PROGRESS.md` の該当タスクが `[x]` になっている
