"""GET /api/character_templates の正常系と PNG 欠落時スキップ動作 (T5A / D16)。"""

from fastapi.testclient import TestClient

from app import character_templates
from app.config import PUBLIC_BASE_URL
from main import app

client = TestClient(app)


def test_character_templates_returns_only_existing_pngs(monkeypatch, tmp_path):
    """PNG が存在する slug だけが返る (PNG 無し slug はレスポンスから除外)。"""
    monkeypatch.setattr(character_templates, "TEMPLATES_DIR", tmp_path)

    # オバマだけ PNG を置き、他は置かない
    (tmp_path / "obama.png").write_bytes(b"\x89PNG\r\n\x1a\n")

    response = client.get("/api/character_templates")
    assert response.status_code == 200

    body = response.json()
    slugs = {item["slug"] for item in body}
    assert slugs == {"obama"}
    obama = body[0]
    assert obama["name"] == "バラク・オバマ"
    # mtime クエリ文字列でキャッシュバスティングしているのでパス部分だけ検証する
    assert obama["avatar_url"].startswith(f"{PUBLIC_BASE_URL}/static/templates/obama.png?v=")
    # T69: gender がレスポンスに乗ること
    assert obama["gender"] == "male"


def test_character_templates_returns_empty_when_no_pngs(monkeypatch, tmp_path):
    """seed 未実行などで PNG が 1 つも無い場合は空配列が返る (UI を壊さない)。"""
    monkeypatch.setattr(character_templates, "TEMPLATES_DIR", tmp_path)

    response = client.get("/api/character_templates")
    assert response.status_code == 200
    assert response.json() == []
