import cv2
import numpy as np

from app.background_removal import remove_background
from app.config import CHROMA_KEY_BGR

_SIZE = 64
_SUBJECT_COLOR_BGR = (0, 0, 255)  # 赤


def _make_chroma_image() -> bytes:
    image = np.zeros((_SIZE, _SIZE, 3), dtype=np.uint8)
    image[:, :] = CHROMA_KEY_BGR
    # 中央に被写体（緑とは異なる色）の矩形を置く
    image[16:48, 16:48] = _SUBJECT_COLOR_BGR
    success, encoded = cv2.imencode(".png", image)
    assert success
    return bytes(encoded)


def test_remove_background_makes_green_transparent_and_keeps_subject():
    result = remove_background(_make_chroma_image())

    decoded = cv2.imdecode(np.frombuffer(result, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    assert decoded.shape[2] == 4

    background_alpha = decoded[0, 0, 3]
    subject_alpha = decoded[32, 32, 3]

    assert background_alpha == 0
    assert subject_alpha == 255
