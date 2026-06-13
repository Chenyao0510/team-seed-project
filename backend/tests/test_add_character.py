import cv2
import numpy as np
from fastapi.testclient import TestClient

from app import avatar_pipeline, gemini_client
from app.config import PUBLIC_BASE_URL
from main import app

client = TestClient(app)

_SIZE = 32
_TEST_BG_BGR = (0, 255, 0)  # 単色背景。本番は左右端から自動推定するため任意の色でよい。


def _fake_chroma_image_bytes() -> bytes:
    image = np.zeros((_SIZE, _SIZE, 3), dtype=np.uint8)
    image[:, :] = _TEST_BG_BGR
    image[8:24, 8:24] = (0, 0, 255)
    success, encoded = cv2.imencode(".png", image)
    assert success
    return bytes(encoded)


def test_add_character_returns_avatar_url(monkeypatch, tmp_path):
    monkeypatch.setattr(avatar_pipeline, "AVATARS_DIR", tmp_path)
    monkeypatch.setattr(
        avatar_pipeline.image_search, "fetch_reference_images", lambda name, max_images=3: []
    )
    monkeypatch.setattr(
        gemini_client,
        "generate_avatar_image",
        lambda name, reference_images=None: _fake_chroma_image_bytes(),
    )

    response = client.post("/api/add_character", json={"name": "織田信長"})

    assert response.status_code == 200
    body = response.json()
    assert body["avatar_url"].startswith(f"{PUBLIC_BASE_URL}/static/avatars/")
    assert body["avatar_url"].endswith(".png")

    saved_files = list(tmp_path.glob("*.png"))
    assert len(saved_files) == 1


def test_add_character_passes_reference_images_to_gemini(monkeypatch, tmp_path):
    """画像検索で取得した参照画像が Gemini にそのまま渡されることを保証する。"""
    monkeypatch.setattr(avatar_pipeline, "AVATARS_DIR", tmp_path)

    fake_refs = [(b"\x89PNG-fake-a", "image/png"), (b"\xff\xd8\xff-fake-b", "image/jpeg")]
    monkeypatch.setattr(
        avatar_pipeline.image_search,
        "fetch_reference_images",
        lambda name, max_images=3: fake_refs,
    )

    received: dict = {}

    def _capture(name, reference_images=None):
        received["name"] = name
        received["refs"] = reference_images
        return _fake_chroma_image_bytes()

    monkeypatch.setattr(gemini_client, "generate_avatar_image", _capture)

    response = client.post("/api/add_character", json={"name": "Some Person"})

    assert response.status_code == 200
    assert received["name"] == "Some Person"
    assert received["refs"] == fake_refs


def test_add_character_falls_back_to_placeholder_on_gemini_failure(monkeypatch, tmp_path):
    monkeypatch.setattr(avatar_pipeline, "AVATARS_DIR", tmp_path)
    monkeypatch.setattr(
        avatar_pipeline.image_search, "fetch_reference_images", lambda name, max_images=3: []
    )

    def _raise(*args, **kwargs):
        raise RuntimeError("gemini unavailable")

    monkeypatch.setattr(gemini_client, "generate_avatar_image", _raise)

    response = client.post("/api/add_character", json={"name": "プレースホルダー太郎"})

    assert response.status_code == 200
    body = response.json()
    assert body["avatar_url"].startswith(f"{PUBLIC_BASE_URL}/static/avatars/")

    saved_files = list(tmp_path.glob("*.png"))
    assert len(saved_files) == 1
