# fixtures/

フロント・バック双方の Source of Truth となる State JSON サンプル。

- フロントは `frontend/src/mocks/` 経由で import し、backend 起動なしで描画できる
- バックは `backend/tests/fixtures/` の loader で読み込み、pytest で pydantic 検証する
- スキーマは `DECISIONS.md` D01 と一致させる

スキーマを変更するときの順序:
`DECISIONS.md` D01 → `docs/ARCHITECTURE.md` API契約 → このディレクトリの `*.json` → 同一 PR で push。
