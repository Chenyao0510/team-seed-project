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


def _mock_pipeline_bg_removal(monkeypatch) -> None:
    """rembg を呼ばずに済むよう、pipeline 内の remove_background をパススルー化する。"""
    monkeypatch.setattr(avatar_pipeline, "remove_background", lambda data: data)


def test_add_character_returns_avatar_url(monkeypatch, tmp_path):
    monkeypatch.setattr(avatar_pipeline, "AVATARS_DIR", tmp_path)
    monkeypatch.setattr(
        avatar_pipeline.image_search, "fetch_reference_images", lambda name, max_images=3: []
    )
    _mock_pipeline_bg_removal(monkeypatch)
    monkeypatch.setattr(
        gemini_client,
        "generate_avatar_image",
        lambda name, reference_images=None: _fake_chroma_image_bytes(),
    )
    # T69: classify_gender も同じ add_character フローで呼ばれる。実 Gemini を回さない。
    monkeypatch.setattr(gemini_client, "classify_gender", lambda name: "male")
    # T72: generate_character_persona も呼ばれる。
    monkeypatch.setattr(
        gemini_client,
        "generate_character_persona",
        lambda name: "天下統一を志す、果断で短気な戦国武将。",
    )

    response = client.post("/api/add_character", json={"name": "織田信長"})

    assert response.status_code == 200
    body = response.json()
    assert body["avatar_url"].startswith(f"{PUBLIC_BASE_URL}/static/avatars/")
    assert body["avatar_url"].endswith(".png")
    # T69: gender がレスポンスに乗ること
    assert body["gender"] == "male"
    # T72: persona がレスポンスに乗ること
    assert body["persona"] == "天下統一を志す、果断で短気な戦国武将。"

    saved_files = list(tmp_path.glob("*.png"))
    assert len(saved_files) == 1


def test_add_character_passes_reference_images_to_gemini(monkeypatch, tmp_path):
    """画像検索で取得した参照画像が Gemini にそのまま渡されることを保証する。"""
    monkeypatch.setattr(avatar_pipeline, "AVATARS_DIR", tmp_path)
    _mock_pipeline_bg_removal(monkeypatch)

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
    monkeypatch.setattr(gemini_client, "classify_gender", lambda name: "male")
    monkeypatch.setattr(gemini_client, "generate_character_persona", lambda name: "")

    response = client.post("/api/add_character", json={"name": "Some Person"})

    assert response.status_code == 200
    assert received["name"] == "Some Person"
    assert received["refs"] == fake_refs


def test_add_character_falls_back_to_placeholder_on_gemini_failure(monkeypatch, tmp_path):
    monkeypatch.setattr(avatar_pipeline, "AVATARS_DIR", tmp_path)
    monkeypatch.setattr(
        avatar_pipeline.image_search, "fetch_reference_images", lambda name, max_images=3: []
    )
    _mock_pipeline_bg_removal(monkeypatch)

    def _raise(*args, **kwargs):
        raise RuntimeError("gemini unavailable")

    monkeypatch.setattr(gemini_client, "generate_avatar_image", _raise)
    monkeypatch.setattr(gemini_client, "classify_gender", lambda name: "male")
    # T72: persona 生成失敗は best-effort のため routes 側で握り潰され、空文字が返る。
    monkeypatch.setattr(gemini_client, "generate_character_persona", _raise)

    response = client.post("/api/add_character", json={"name": "プレースホルダー太郎"})

    assert response.status_code == 200
    body = response.json()
    assert body["avatar_url"].startswith(f"{PUBLIC_BASE_URL}/static/avatars/")
    assert body["persona"] == ""

    saved_files = list(tmp_path.glob("*.png"))
    assert len(saved_files) == 1
