# ARCHITECTURE.md -- システム設計

## スタック

| レイヤ       | 技術                                                 |
| ----------- | --------------------------------------------------- |
| 言語         | TypeScript (frontend) / Python 3.13 (backend)       |
| フロント     | Vite + React 19 + Tailwind CSS v4                   |
| バック       | FastAPI + uvicorn                                   |
| LLM         | Gemini API (google-genai SDK, JSON Mode)            |
| 永続化       | なし（インメモリ。必要なら JSON ファイル）            |
| パッケージ管理 | pnpm (frontend) / pip + requirements.txt (backend) |

## システム概要

ステートレスな FastAPI バックエンドが、フロントから渡された **State JSON** を受け取り、Gemini を呼び出して **更新後 State JSON** を返す。フロントは画面遷移と介入 UI に集中し、状態の真の所有者は State JSON 自体。

詳細な State 構造は `DECISIONS.md` の D01 を参照。

## レイヤ図

```text
+----------------------------------------------------+
|             Frontend (Vite + React)               |
|  画面 1 入力 → 画面 2 討論+介入 → 画面 3 結論       |
|              ↑ useReducer で State を保持           |
+----------------------------------------------------+
              │  fetch POST  (JSON State)
              ▼
+----------------------------------------------------+
|              Backend (FastAPI)                    |
|  /api/next_turn   /api/summarize   /api/health     |
+----------------------------------------------------+
              │  google-genai (JSON Mode)
              ▼
+----------------------------------------------------+
|                  Gemini API                       |
+----------------------------------------------------+
```

## レイヤ境界

### Frontend (`frontend/`)

- UI とユーザー入力の処理のみを担当する
- ドメインロジックや LLM 呼び出しは持たない
- State はトップレベルコンポーネントの `useReducer` で保持し、子へ props で渡す
- バック呼び出しは `fetch` をラップした薄い `apiClient` モジュールに集約する

### Backend (`backend/`)

- ステートレス。リクエストごとに State JSON を受け取り、新しい State を返す
- ルーティング (`main.py`) と業務ロジック (`app/`) を分離
- Gemini 呼び出しは `app/gemini_client.py` のような単一モジュールに閉じる
- pydantic で State スキーマを定義し、入出力で必ず検証する

### Gemini との境界

- `responseMimeType: "application/json"` または `responseSchema` を指定する
- パース失敗時のフォールバックを `try/except` で必ず持つ
- API キーは `.env` の `GEMINI_API_KEY` から読み込み、コード直書き禁止

## データフロー: 次ターン生成

```text
1. ユーザーが画面 2 で「次のターンへ」or 介入ボタンを押す
2. Frontend が現在の State JSON を POST /api/next_turn に送信
3. Backend が State を pydantic で検証
4. Backend が Gemini に State + システムプロンプトを渡し、構造化 JSON を取得
5. Backend が返ってきた新ターンを State.turns に append
6. Backend が更新後 State JSON を返却
7. Frontend が State を置き換え、再レンダリング
```

## データフロー: 結論生成

```text
1. ユーザーが画面 2 で「結論を出す」を押す
2. Frontend が State JSON を POST /api/summarize に送信
3. Backend が Gemini に履歴を渡し、リポート JSON を生成
4. State.summary に結果を埋めて返却
5. Frontend が画面 3 に遷移、Before/After を表示
```

## API 契約

| メソッド | パス                | 入力        | 出力                       |
| ------- | ------------------- | ----------- | ------------------------- |
| GET     | `/api/health`       | -           | `{"status": "ok"}`        |
| POST    | `/api/next_turn`    | State JSON  | 更新後 State JSON          |
| POST    | `/api/summarize`    | State JSON  | summary 入り State JSON    |

CORS: `http://localhost:5173` および `http://127.0.0.1:5173` を許可する。

## 主要決定の参照

- D01: 単一 State JSON 方式 → `DECISIONS.md`
- D02: マルチエージェントフレームワーク不使用 → `DECISIONS.md`
- D04: Gemini JSON Mode → `DECISIONS.md`
