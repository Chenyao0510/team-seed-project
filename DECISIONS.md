# DECISIONS.md -- 設計判断ログ

設計上の重要な選択と、その理由を記録する。後続セッションが背景を辿れるように。

---

## D01: 単一 State JSON で全体を管理する

**判断**: フロント・バック間のやり取りは、単一の State オブジェクト (JSON) を毎回 POST でキャッチボールする方式とする。

**理由**:

- ハッカソン 24 時間で複雑な状態管理ライブラリやエージェントフレームワークを導入するコストが高い
- フロントとバックが「同じ State を見ている」ことが保証されると、デバッグが圧倒的に楽
- State がそのままセッションの保存形式 (JSON ダンプ) として使える
- 介入機能の実装が容易：State の `interventions` に追記するだけ

**State JSON 構造 (仕様)**:

```json
{
  "session_id": "uuid",
  "theme": "string",
  "characters": [
    { "id": "string", "name": "string", "stance": "string" }
  ],
  "turns": [
    {
      "turn_no": 0,
      "speaker_id": "string",
      "utterance": "string",
      "ts": "iso-8601"
    }
  ],
  "interventions": [
    {
      "after_turn_no": 0,
      "kind": "rebut | question | add_view",
      "content": "string",
      "ts": "iso-8601"
    }
  ],
  "status": "input | debating | concluded",
  "summary": null
}
```

`summary` は `/api/summarize` 後に埋まる。pydantic でスキーマ化し、入出力で検証する。

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

- 画面が 3 つしかない
- 「単一 State JSON」がメインの構造で、Reducer 一つで十分
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

## 追加判断の書き方

新しい判断は `D08`, `D09`, ... と連番で追加し、`判断 / 理由 / 影響範囲` を書く。
