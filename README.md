# team-seed-project (Agora)

AI 同士の議論を観察・介入することで「答え」ではなく「問いの構造と進化」を持ち帰らせる Web アプリ。

詳細は `docs/PROJECT.md` / `docs/ARCHITECTURE.md`、ルールは `AGENTS.md` / `CONSTRAINTS.md`、タスクは `PROGRESS.md` を参照。

## 前提

- Python 3.13+
- Node.js + pnpm
- `backend/.env` に `GEMINI_API_KEY` を設定（テンプレ: `backend/.env.example`）

## 初回セットアップ

```bash
# backend の venv 作成 + フロント・バックの全依存関係インストール
make init
```

## 起動 (開発)

フロントとバックは別ターミナルで起動する。

```bash
# Terminal 1: バックエンド (http://localhost:8000)
make dev-backend

# Terminal 2: フロントエンド (http://localhost:5173)
make dev-frontend
```

ブラウザで `http://localhost:5173` を開く。

## 動作確認

### ヘルスチェック (バック単体)

バックが起動している状態で:

```bash
curl http://localhost:8000/api/health
# => {"status":"ok"}
```

FastAPI の OpenAPI UI は `http://localhost:8000/docs` で確認できる。

### 一括検証 (Handoff Ready 判定)

コミット前 / セッション終了前に必ず通す。

```bash
make verify-all
# 内訳: lint + check-types + test + build
# 期待: 末尾に "==> verify-all OK"
```

### 個別検証

| コマンド             | 内容                                              |
| ------------------- | ------------------------------------------------ |
| `make lint`         | フロント eslint + バック ruff                     |
| `make check-types`  | フロント `tsc -b --noEmit`                        |
| `make test`         | バック pytest（フロント vitest は未導入）         |
| `make build`        | フロント `vite build`                             |

### その他

```bash
make help    # ターゲット一覧
make clean   # dist / キャッシュ削除
```

## ディレクトリ

```text
.
├── AGENTS.md / CLAUDE.md / CONSTRAINTS.md / PROGRESS.md / DECISIONS.md
├── Makefile               # 開発・検証コマンド一元化
├── docs/
│   ├── PROJECT.md         # プロダクト仕様
│   └── ARCHITECTURE.md    # システム設計
├── frontend/              # Vite + React 19 + TS + Tailwind v4 + Framer Motion
└── backend/               # FastAPI + Python 3.13 + google-genai
    ├── main.py            # CORS + /api/health
    ├── app/               # API ロジック
    ├── tests/             # pytest スイート
    └── .venv/             # gitignored
```
