import cv2
import numpy as np
from fastapi.testclient import TestClient

from app import avatar_pipeline, gemini_client
from app.config import CHROMA_KEY_BGR, PUBLIC_BASE_URL
from main import app

client = TestClient(app)

_SIZE = 32


def _fake_chroma_image_bytes() -> bytes:
    image = np.zeros((_SIZE, _SIZE, 3), dtype=np.uint8)
    image[:, :] = CHROMA_KEY_BGR
    image[8:24, 8:24] = (0, 0, 255)
    success, encoded = cv2.imencode(".png", image)
    assert success
    return bytes(encoded)


def test_add_character_returns_avatar_url(monkeypatch, tmp_path):
    monkeypatch.setattr(avatar_pipeline, "AVATARS_DIR", tmp_path)
    monkeypatch.setattr(gemini_client, "describe_appearance", lambda name: "テスト用の外見")
    monkeypatch.setattr(
        gemini_client, "generate_avatar_image", lambda description: _fake_chroma_image_bytes()
    )

    response = client.post("/api/add_character", json={"name": "織田信長"})

    assert response.status_code == 200
    body = response.json()
    assert body["avatar_url"].startswith(f"{PUBLIC_BASE_URL}/static/avatars/")
    assert body["avatar_url"].endswith(".png")

    saved_files = list(tmp_path.glob("*.png"))
    assert len(saved_files) == 1


def test_add_character_falls_back_to_placeholder_on_gemini_failure(monkeypatch, tmp_path):
    monkeypatch.setattr(avatar_pipeline, "AVATARS_DIR", tmp_path)

    def _raise(*args, **kwargs):
        raise RuntimeError("gemini unavailable")

    monkeypatch.setattr(gemini_client, "describe_appearance", _raise)

    response = client.post("/api/add_character", json={"name": "プレースホルダー太郎"})

    assert response.status_code == 200
    body = response.json()
    assert body["avatar_url"].startswith(f"{PUBLIC_BASE_URL}/static/avatars/")

    saved_files = list(tmp_path.glob("*.png"))
    assert len(saved_files) == 1
