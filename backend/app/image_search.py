"""人物名から参照画像を取得するユーティリティ (T52)。

Gemini (nano banana) は知名度の低い人物だと「全然違う人」を生成してしまうため、
一般の画像検索 (DuckDuckGo Images) で本人の写真を引き、画像生成モデルに
参照入力として渡すことで「本人らしさ」を担保する。

Wikipedia 依存だと未登録の人物 (個人ブロガー、地方の有名人、若手の研究者など) を
カバーできないため、より広く引ける汎用画像検索を採用する。

best-effort: 取得に失敗した場合は None を返すだけで、呼び出し元は description のみで
生成にフォールバックする。
"""

from __future__ import annotations

import re

import httpx

DDG_SEARCH_URL = "https://duckduckgo.com/"
DDG_IMAGE_API = "https://duckduckgo.com/i.js"
DDG_TIMEOUT_SECONDS = 6.0
IMAGE_DOWNLOAD_TIMEOUT_SECONDS = 6.0
MAX_IMAGE_BYTES = 4 * 1024 * 1024  # 4MB 上限（Gemini multimodal の現実的なサイズ）
# Gemini に渡すデフォルトの参照画像枚数。3 枚あると顔の角度・服装が散らばって
# 「写真の特定1枚に引っ張られすぎ」を防げる。
DEFAULT_REFERENCE_COUNT = 3
# 上位 N 件の URL を取得し、ダウンロード成功した分から最大 max_images 枚を採用
MAX_CANDIDATES_TO_TRY = 8

_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

# DuckDuckGo は最初のページ HTML に vqd トークンを埋め込み、それを image API の
# クエリパラメータとして要求する。HTML 内の表記揺れ (`vqd='...'` / `vqd="..."` /
# `vqd=...&`) すべてに当たるよう正規表現を緩める。
_DDG_VQD_RE = re.compile(r"""vqd=['"]?([\w-]+)['"&]""")


def fetch_reference_images(
    name: str,
    max_images: int = DEFAULT_REFERENCE_COUNT,
) -> list[tuple[bytes, str]]:
    """人物名から参照画像を最大 max_images 枚返す。

    1. DuckDuckGo Image 検索で上位候補の URL を取得する。
    2. 上位 MAX_CANDIDATES_TO_TRY 件を順にダウンロードし、成功した分から
       最大 max_images 枚を採用する。
    3. 1 枚も取得できなかった場合は空リストを返す。
    """
    if max_images <= 0:
        return []
    urls = _ddg_image_search(name, max_results=MAX_CANDIDATES_TO_TRY)
    images: list[tuple[bytes, str]] = []
    for url in urls:
        image = _download_image(url)
        if image is not None:
            images.append(image)
            if len(images) >= max_images:
                break
    return images


def fetch_reference_image(name: str) -> tuple[bytes, str] | None:
    """1 枚だけ欲しい呼び出し元用の薄いラッパー。"""
    images = fetch_reference_images(name, max_images=1)
    return images[0] if images else None


def _ddg_image_search(query: str, max_results: int) -> list[str]:
    vqd = _fetch_vqd(query)
    if not vqd:
        return []
    try:
        response = httpx.get(
            DDG_IMAGE_API,
            params={"q": query, "o": "json", "vqd": vqd, "l": "wt-wt", "p": "1"},
            timeout=DDG_TIMEOUT_SECONDS,
            follow_redirects=True,
            headers={
                "User-Agent": _USER_AGENT,
                "Referer": DDG_SEARCH_URL,
                "Accept": "application/json, text/javascript, */*; q=0.01",
            },
        )
    except httpx.HTTPError:
        return []
    if response.status_code != 200:
        return []
    try:
        data = response.json()
    except ValueError:
        return []
    if not isinstance(data, dict):
        return []
    results = data.get("results") or []
    urls: list[str] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        url = item.get("image")
        if isinstance(url, str) and url.startswith("http"):
            urls.append(url)
            if len(urls) >= max_results:
                break
    return urls


def _fetch_vqd(query: str) -> str | None:
    try:
        response = httpx.get(
            DDG_SEARCH_URL,
            params={"q": query, "iax": "images", "ia": "images"},
            timeout=DDG_TIMEOUT_SECONDS,
            follow_redirects=True,
            headers={"User-Agent": _USER_AGENT},
        )
    except httpx.HTTPError:
        return None
    if response.status_code != 200:
        return None
    match = _DDG_VQD_RE.search(response.text)
    if not match:
        return None
    return match.group(1)


def _download_image(url: str) -> tuple[bytes, str] | None:
    try:
        response = httpx.get(
            url,
            timeout=IMAGE_DOWNLOAD_TIMEOUT_SECONDS,
            follow_redirects=True,
            headers={"User-Agent": _USER_AGENT},
        )
    except httpx.HTTPError:
        return None
    if response.status_code != 200:
        return None
    data = response.content
    if not data or len(data) > MAX_IMAGE_BYTES:
        return None
    mime = _detect_mime(data, response.headers.get("content-type"))
    if mime is None:
        return None
    return data, mime


def _detect_mime(data: bytes, content_type_header: str | None) -> str | None:
    # マジックバイト優先（ヘッダーは時々 `application/octet-stream` などになる）。
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if content_type_header:
        # Content-Type が信頼できるならフォールバック
        normalized = content_type_header.split(";")[0].strip().lower()
        if normalized in {"image/jpeg", "image/png", "image/webp", "image/gif"}:
            return normalized
    return None
