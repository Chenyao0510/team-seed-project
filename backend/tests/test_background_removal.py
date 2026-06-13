import cv2
import numpy as np

from app.background_removal import crop_head_square, remove_background

_SIZE = 256
_SUBJECT_COLOR_BGR = (0, 0, 255)  # 赤
# テスト用の単色背景色 (BGR)。本番では左右端から自動推定するため、ここでの色は任意。
_TEST_BG_BGR = (0, 255, 0)
# 被写体（人物見立ての矩形）の元画像上の領域。透過後の bbox クロップで
# このサイズ近辺まで縮むはず。
_SUBJECT_TOP, _SUBJECT_BOTTOM = 80, 200
_SUBJECT_LEFT, _SUBJECT_RIGHT = 100, 160
_SUBJECT_H = _SUBJECT_BOTTOM - _SUBJECT_TOP
_SUBJECT_W = _SUBJECT_RIGHT - _SUBJECT_LEFT


def _make_chroma_image() -> bytes:
    image = np.zeros((_SIZE, _SIZE, 3), dtype=np.uint8)
    image[:, :] = _TEST_BG_BGR
    # 縦長の被写体（緑とは異なる色）を中央に置く。
    image[_SUBJECT_TOP:_SUBJECT_BOTTOM, _SUBJECT_LEFT:_SUBJECT_RIGHT] = _SUBJECT_COLOR_BGR
    success, encoded = cv2.imencode(".png", image)
    assert success
    return bytes(encoded)


def _decode(png_bytes: bytes) -> np.ndarray:
    return cv2.imdecode(np.frombuffer(png_bytes, dtype=np.uint8), cv2.IMREAD_UNCHANGED)


def test_remove_background_makes_uniform_background_transparent_and_keeps_subject():
    """エッジ自動推定方式でも、緑単色背景の従来パターンはきれいに透過される。"""
    result = remove_background(_make_chroma_image())
    decoded = _decode(result)

    assert decoded.shape[2] == 4

    # クロップ後でも四隅は透過パディング域に残る想定。
    background_alpha = decoded[0, 0, 3]
    # 被写体の中央は alpha=255 のまま。
    center_y = decoded.shape[0] // 2
    center_x = decoded.shape[1] // 2
    subject_alpha = decoded[center_y, center_x, 3]

    assert background_alpha == 0
    assert subject_alpha == 255


def _make_image_with_bg(bg_bgr: tuple[int, int, int]) -> bytes:
    """背景色を指定して、中央に赤の縦長矩形を置いたテスト画像 PNG を作る。"""
    image = np.zeros((_SIZE, _SIZE, 3), dtype=np.uint8)
    image[:, :] = bg_bgr
    image[_SUBJECT_TOP:_SUBJECT_BOTTOM, _SUBJECT_LEFT:_SUBJECT_RIGHT] = _SUBJECT_COLOR_BGR
    success, encoded = cv2.imencode(".png", image)
    assert success
    return bytes(encoded)


def test_remove_background_estimates_arbitrary_background_color():
    """エッジ平均から背景色を推定するので、緑以外の単色背景でも透過できる。"""
    bg = (200, 150, 80)  # シアンっぽい色 (BGR)
    result = remove_background(_make_image_with_bg(bg))
    decoded = _decode(result)

    # 角は透過、被写体中心は不透明
    assert decoded[0, 0, 3] == 0
    center_y = decoded.shape[0] // 2
    center_x = decoded.shape[1] // 2
    assert decoded[center_y, center_x, 3] == 255


def test_remove_background_tolerates_slight_color_variation():
    """AI 生成は単色指定でも僅かに色がぶれる。± のノイズを許容して透過すること。"""
    base = (100, 180, 220)
    h, w = _SIZE, _SIZE
    image = np.zeros((h, w, 3), dtype=np.uint8)
    image[:, :] = base
    # 背景に小さな色変動 (±15) を乗せる
    rng = np.random.default_rng(seed=42)
    noise = rng.integers(-15, 16, size=image.shape, dtype=np.int16)
    image = np.clip(image.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    image[_SUBJECT_TOP:_SUBJECT_BOTTOM, _SUBJECT_LEFT:_SUBJECT_RIGHT] = _SUBJECT_COLOR_BGR

    success, encoded = cv2.imencode(".png", image)
    assert success

    decoded = _decode(remove_background(bytes(encoded)))
    # ノイズありでも角は透過判定になる
    assert decoded[0, 0, 3] == 0
    # 被写体中心は残る
    cy, cx = decoded.shape[0] // 2, decoded.shape[1] // 2
    assert decoded[cy, cx, 3] == 255


def test_remove_background_makes_enclosed_bg_hole_transparent():
    """被写体内部に背景と同じ色の「足の間サイズ」の領域があれば、
    画像端と非連結でも透過される。"""
    bg = (240, 240, 240)  # ほぼ白
    h, w = _SIZE, _SIZE
    image = np.zeros((h, w, 3), dtype=np.uint8)
    image[:, :] = bg
    # 大きな被写体ブロック（赤）を中央に配置
    image[60:200, 60:200] = _SUBJECT_COLOR_BGR
    # 内部に「足の間サイズ」(20x60) の bg 色領域を空ける
    image[100:160, 120:140] = bg

    success, encoded = cv2.imencode(".png", image)
    assert success

    decoded = _decode(remove_background(bytes(encoded)))

    # 角は透過
    assert decoded[0, 0, 3] == 0
    # クロップ後の中央 (=元画像の中央 130, 130 付近 = bg 色の穴内) は透過になっているはず
    cy, cx = decoded.shape[0] // 2, decoded.shape[1] // 2
    assert decoded[cy, cx, 3] == 0


def test_remove_background_ignores_tiny_isolated_bg_noise():
    """ノイズレベルの小さな bg 色ドット (面積 < _MIN_ENCLOSED_HOLE_AREA) は
    透過せず被写体内部のまま残す。"""
    bg = (240, 240, 240)
    h, w = _SIZE, _SIZE
    image = np.zeros((h, w, 3), dtype=np.uint8)
    image[:, :] = bg
    image[60:200, 60:200] = _SUBJECT_COLOR_BGR
    # 4x4 = 16 px の小さな bg 色ドット（瞳のハイライト想定）
    image[125:129, 125:129] = bg

    success, encoded = cv2.imencode(".png", image)
    assert success

    decoded = _decode(remove_background(bytes(encoded)))
    # ドット周辺はおおむね不透明のまま
    cy, cx = decoded.shape[0] // 2, decoded.shape[1] // 2
    inside_alpha = decoded[cy - 10 : cy + 10, cx - 10 : cx + 10, 3]
    assert (inside_alpha > 0).sum() > 0.7 * inside_alpha.size


def test_remove_background_crops_to_subject_bbox():
    """T52: 透過後は alpha>0 の最小外接矩形＋少しのパディングにクロップされ、
    元画像 (256x256) より小さくなる。"""
    result = remove_background(_make_chroma_image())
    decoded = _decode(result)

    h, w = decoded.shape[:2]
    # 元の余白が削れて、被写体サイズ+パディング程度に縮んでいること
    assert h < _SIZE
    assert w < _SIZE
    # 被写体本体は完全に残っている（パディング分だけ余裕がある）
    assert h >= _SUBJECT_H
    assert w >= _SUBJECT_W


def _encode_bgra(bgra: np.ndarray) -> bytes:
    success, encoded = cv2.imencode(".png", bgra)
    assert success
    return bytes(encoded)


def test_crop_head_square_takes_top_for_portrait_image():
    """縦長の透過画像から「上から1辺=W の正方形」が切り出される。"""
    h, w = 400, 200
    bgra = np.zeros((h, w, 4), dtype=np.uint8)
    # 上半分 (=頭エリア想定) を赤で塗って、可視ピクセルとして識別できるようにする
    bgra[0:200, :, 2] = 255  # R
    bgra[0:200, :, 3] = 255  # alpha
    # 下半分 (=胴体想定) を青
    bgra[200:, :, 0] = 255  # B
    bgra[200:, :, 3] = 255

    result = crop_head_square(_encode_bgra(bgra))
    decoded = _decode(result)

    assert decoded.shape[:2] == (w, w)  # 200x200
    # 上端は元画像 (0,0) = 赤
    assert decoded[0, 0, 2] == 255
    assert decoded[0, 0, 0] == 0


def test_crop_head_square_keeps_landscape_square():
    """横長画像は中央寄せで正方形化される（1 辺 = h）。"""
    h, w = 200, 400
    bgra = np.zeros((h, w, 4), dtype=np.uint8)
    bgra[:, :, 1] = 255  # 全面緑
    bgra[:, :, 3] = 255

    result = crop_head_square(_encode_bgra(bgra))
    decoded = _decode(result)

    assert decoded.shape[:2] == (h, h)  # 200x200


def test_crop_head_square_passthrough_for_already_square():
    h, w = 256, 256
    bgra = np.zeros((h, w, 4), dtype=np.uint8)
    bgra[:, :, 3] = 255

    result = crop_head_square(_encode_bgra(bgra))
    decoded = _decode(result)

    assert decoded.shape[:2] == (h, w)


def test_remove_background_returns_unchanged_when_all_transparent():
    """全面緑（人物検出 0 ピクセル）の場合はクロップせず元サイズのまま返す。"""
    image = np.zeros((_SIZE, _SIZE, 3), dtype=np.uint8)
    image[:, :] = _TEST_BG_BGR
    success, encoded = cv2.imencode(".png", image)
    assert success

    result = remove_background(bytes(encoded))
    decoded = _decode(result)

    assert decoded.shape[:2] == (_SIZE, _SIZE)
    assert (decoded[:, :, 3] == 0).all()
