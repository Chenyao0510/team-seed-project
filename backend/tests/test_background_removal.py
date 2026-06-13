"""T52: 背景透過処理のテスト。

`rembg` (U^2-Net) 本体は重い ONNX 推論なのでテストでは monkeypatch でモックする。
- `remove_background` は rembg 出力を受け取り、bbox クロップして PNG を返す
  ことだけを保証する
- `crop_head_square` はテンソル操作だけの純関数なので実物でテストする
"""

import cv2
import numpy as np

from app import background_removal
from app.background_removal import crop_head_square, remove_background

_SIZE = 256


def _encode_bgra_png(bgra: np.ndarray) -> bytes:
    success, encoded = cv2.imencode(".png", bgra)
    assert success
    return bytes(encoded)


def _decode(png_bytes: bytes) -> np.ndarray:
    return cv2.imdecode(np.frombuffer(png_bytes, dtype=np.uint8), cv2.IMREAD_UNCHANGED)


def _make_rembg_output(
    subject_top: int,
    subject_bottom: int,
    subject_left: int,
    subject_right: int,
) -> bytes:
    """rembg が「人物だけ切り抜いた」つもりの BGRA PNG を返す。

    指定矩形内 alpha=255 (人物)、他は alpha=0 (透過済み背景)。
    """
    bgra = np.zeros((_SIZE, _SIZE, 4), dtype=np.uint8)
    bgra[subject_top:subject_bottom, subject_left:subject_right, 2] = 255  # R
    bgra[subject_top:subject_bottom, subject_left:subject_right, 3] = 255  # alpha
    return _encode_bgra_png(bgra)


def test_remove_background_invokes_rembg_and_returns_transparent_png(monkeypatch):
    """rembg の出力をそのまま受けて、有効な透過 PNG を返すこと。"""
    fake_output = _make_rembg_output(80, 200, 100, 160)

    captured: dict = {}

    def fake_remove(data: bytes, session=None):
        captured["input"] = data
        captured["session"] = session
        return fake_output

    monkeypatch.setattr(background_removal, "remove", fake_remove)
    # セッションは事前生成済みということにする (new_session を呼ばせない)
    monkeypatch.setattr(background_removal, "_session", "fake-session-sentinel")

    result = remove_background(b"input-image-bytes")
    decoded = _decode(result)

    # rembg に渡したのは元の入力 bytes、セッションはキャッシュされたもの
    assert captured["input"] == b"input-image-bytes"
    assert captured["session"] == "fake-session-sentinel"
    # 出力は 4ch (alpha 付き) PNG
    assert decoded.shape[2] == 4
    # bbox クロップで元 (256x256) より小さくなっているはず
    assert decoded.shape[0] < _SIZE
    assert decoded.shape[1] < _SIZE


def test_remove_background_crops_to_subject_bbox(monkeypatch):
    """rembg 出力の alpha>0 領域 + パディング 12px の bbox にクロップされる。"""
    sub_t, sub_b, sub_l, sub_r = 80, 200, 100, 160
    monkeypatch.setattr(
        background_removal,
        "remove",
        lambda data, session=None: _make_rembg_output(sub_t, sub_b, sub_l, sub_r),
    )
    monkeypatch.setattr(background_removal, "_session", "fake-session")

    decoded = _decode(remove_background(b"x"))
    h, w = decoded.shape[:2]

    # 人物本体は残る (パディング 12 を加味)
    subject_h = sub_b - sub_t
    subject_w = sub_r - sub_l
    assert h >= subject_h
    assert w >= subject_w
    # 元の余白がしっかり落ちている
    assert h < _SIZE
    assert w < _SIZE


def test_remove_background_passthrough_when_rembg_produces_all_transparent(monkeypatch):
    """rembg が「人物検出できず」全面透過を返したら、bbox クロップせず原寸維持。"""
    fully_transparent = np.zeros((_SIZE, _SIZE, 4), dtype=np.uint8)

    monkeypatch.setattr(
        background_removal,
        "remove",
        lambda data, session=None: _encode_bgra_png(fully_transparent),
    )
    monkeypatch.setattr(background_removal, "_session", "fake-session")

    decoded = _decode(remove_background(b"x"))
    assert decoded.shape[:2] == (_SIZE, _SIZE)
    assert (decoded[:, :, 3] == 0).all()


def test_crop_head_square_takes_top_for_portrait_image():
    """縦長の透過画像から「上から1辺=W の正方形」が切り出される。"""
    h, w = 400, 200
    bgra = np.zeros((h, w, 4), dtype=np.uint8)
    bgra[0:200, :, 2] = 255  # 上半分 (頭) 赤
    bgra[0:200, :, 3] = 255
    bgra[200:, :, 0] = 255  # 下半分 (胴体) 青
    bgra[200:, :, 3] = 255

    decoded = _decode(crop_head_square(_encode_bgra_png(bgra)))

    assert decoded.shape[:2] == (w, w)  # 200x200
    assert decoded[0, 0, 2] == 255
    assert decoded[0, 0, 0] == 0


def test_crop_head_square_keeps_landscape_square():
    """横長画像は中央寄せで正方形化される (1 辺 = h)。"""
    h, w = 200, 400
    bgra = np.zeros((h, w, 4), dtype=np.uint8)
    bgra[:, :, 1] = 255
    bgra[:, :, 3] = 255

    decoded = _decode(crop_head_square(_encode_bgra_png(bgra)))
    assert decoded.shape[:2] == (h, h)


def test_crop_head_square_passthrough_for_already_square():
    h, w = 256, 256
    bgra = np.zeros((h, w, 4), dtype=np.uint8)
    bgra[:, :, 3] = 255

    decoded = _decode(crop_head_square(_encode_bgra_png(bgra)))
    assert decoded.shape[:2] == (h, w)
