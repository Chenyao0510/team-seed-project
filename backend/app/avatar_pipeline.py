"""動的アバター生成パイプライン (D09 / T12)。

人物名 -> 外見プロンプト生成 (Search Grounding) -> nano banana で画像生成
-> OpenCV クロマキーで背景透過 -> 静的ファイルとして保存し URL を返す。

どの段で失敗しても、UI を壊さないように単色プレースホルダーアバターへフォールバックする。
"""

import hashlib

import cv2
import numpy as np

from app import gemini_client, image_search
from app.background_removal import remove_background
from app.config import AVATARS_DIR, AVATARS_URL_PREFIX, PLACEHOLDER_SIZE_PX, PUBLIC_BASE_URL

_PLACEHOLDER_RADIUS_MARGIN_PX = 4


def generate_character_avatar(name: str) -> str:
    """人物名からアバター画像を生成し、配信用 URL を返す。

    T52: 一般画像検索(DuckDuckGo Images) で本人写真を数枚 best-effort で取得し、それを
    Gemini にマルチモーダル入力として渡すことで「本人らしさ」を担保する。
    画像検索が空でも Gemini は名前だけで生成を試みる（モデルが知っている人物
    なら描ける）。
    """
    filename = _avatar_filename(name)
    try:
        reference_images = _safe_fetch_reference_images(name)
        image_bytes = gemini_client.generate_avatar_image(name, reference_images)
        png_bytes = remove_background(image_bytes)
    except Exception:
        png_bytes = _placeholder_png(name)

    _save_png(filename, png_bytes)
    return _avatar_url(filename)


def _safe_fetch_reference_images(name: str) -> list[tuple[bytes, str]]:
    try:
        return image_search.fetch_reference_images(name)
    except Exception:
        return []


def _avatar_filename(name: str) -> str:
    digest = hashlib.sha1(name.encode("utf-8")).hexdigest()[:12]
    return f"{digest}.png"


def _avatar_url(filename: str) -> str:
    return f"{PUBLIC_BASE_URL}{AVATARS_URL_PREFIX}/{filename}"


def _save_png(filename: str, png_bytes: bytes) -> None:
    AVATARS_DIR.mkdir(parents=True, exist_ok=True)
    (AVATARS_DIR / filename).write_bytes(png_bytes)


def _placeholder_png(name: str) -> bytes:
    """名前から決定的に色を選んだ円形の透過プレースホルダーアバターを生成する。"""
    size = PLACEHOLDER_SIZE_PX
    image = np.zeros((size, size, 4), dtype=np.uint8)
    b, g, r = _color_from_name(name)
    center = (size // 2, size // 2)
    radius = size // 2 - _PLACEHOLDER_RADIUS_MARGIN_PX
    cv2.circle(image, center, radius, (b, g, r, 255), thickness=-1)

    success, encoded = cv2.imencode(".png", image)
    if not success:
        raise ValueError("Failed to encode placeholder PNG")
    return bytes(encoded)


def _color_from_name(name: str) -> tuple[int, int, int]:
    digest = hashlib.sha1(name.encode("utf-8")).digest()
    return (int(digest[0]), int(digest[1]), int(digest[2]))
