"""OpenCV によるクロマキー背景透過処理。

Gemini (nano banana) が生成した「緑色単色背景」の画像から、緑色域を
アルファチャンネルで透過させ、PNG bytes として返す。
"""

import cv2
import numpy as np

from app.config import CHROMA_HSV_LOWER, CHROMA_HSV_UPPER

_MORPH_KERNEL_SIZE = 3
_MORPH_ITERATIONS = 1


def remove_background(image_bytes: bytes) -> bytes:
    """画像 bytes (PNG/JPEG) を受け取り、緑色背景を透過した PNG bytes を返す。"""
    buffer = np.frombuffer(image_bytes, dtype=np.uint8)
    bgr = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError("Failed to decode image bytes")

    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    green_mask = cv2.inRange(hsv, np.array(CHROMA_HSV_LOWER), np.array(CHROMA_HSV_UPPER))

    kernel = np.ones((_MORPH_KERNEL_SIZE, _MORPH_KERNEL_SIZE), np.uint8)
    green_mask = cv2.morphologyEx(green_mask, cv2.MORPH_OPEN, kernel, iterations=_MORPH_ITERATIONS)
    green_mask = cv2.morphologyEx(green_mask, cv2.MORPH_CLOSE, kernel, iterations=_MORPH_ITERATIONS)

    alpha = cv2.bitwise_not(green_mask)

    bgra = cv2.cvtColor(bgr, cv2.COLOR_BGR2BGRA)
    bgra[:, :, 3] = alpha

    success, encoded = cv2.imencode(".png", bgra)
    if not success:
        raise ValueError("Failed to encode transparent PNG")
    return bytes(encoded)
