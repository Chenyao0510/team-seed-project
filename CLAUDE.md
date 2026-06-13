# CLAUDE.md -- 即時参照

## スタック

- フロント: Vite + React 19 + TypeScript + Tailwind CSS v4 (`frontend/`)
- バック: FastAPI + Python 3.13 + google-genai (`backend/`)
- LLM: Gemini API（JSON Mode / Structured Outputs）

## コマンド (Makefile 経由)

| コマンド             | 用途                                                |
| -------------------- | -------------------------------------------------- |
| `make init`          | フロント・バックの依存関係をインストール             |
| `make lint`          | 静的解析・フォーマットチェック                      |
| `make check-types`   | フロントの型チェック (`tsc -b --noEmit`)             |
| `make test`          | フロント・バックのテストを実行                      |
| `make build`         | フロントのプロダクションビルド検証                  |
| `make verify-all`    | 上記すべてを順に実行（Handoff Ready 判定）           |
| `make dev-frontend`  | フロント開発サーバ起動 (`http://localhost:5173`)    |
| `make dev-backend`   | バック開発サーバ起動 (`http://localhost:8000`)      |
| `make clean`         | ビルド・キャッシュ削除                              |

## 主要ファイル

| パス                    | 役割                                       |
| ----------------------- | ----------------------------------------- |
| `AGENTS.md`             | エージェント運用ルール                      |
| `CONSTRAINTS.md`        | MUST / MUST NOT                           |
| `PROGRESS.md`           | 機能キュー・進捗                            |
| `DECISIONS.md`          | 設計判断ログ                                |
| `docs/PROJECT.md`       | プロダクト仕様                              |
| `docs/ARCHITECTURE.md`  | システム設計                                |
| `backend/main.py`       | FastAPI エントリポイント (CORS + health)    |
| `backend/app/`          | API ロジック (今後追加)                    |
| `backend/tests/`        | pytest スイート                            |
| `frontend/src/`         | React アプリ                                |
| `Makefile`              | 開発・検証コマンド一元化                    |

## 絶対制約 (詳細は CONSTRAINTS.md)

- タスクは同時に 1 つしか並行処理しない
- 完了判断は自己申告ではなく、`make verify-all` と動作確認の結果に基づく
- API レスポンスは構造化 JSON。フロントとバックは単一 State JSON をやり取りする
- AI 任せの「全自動チャット UI」は作らない（介入できることが体験の核）
- マルチエージェントフレームワーク（LangGraph 等）禁止
