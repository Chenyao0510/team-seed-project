"""T52: 参照画像取得ユーティリティのテスト。

httpx を monkeypatch して、DuckDuckGo image search の 2 段 (vqd 取得 → JSON API)
+ 画像ダウンロードの計 3 段呼び出しが正しく行われることと、各段で失敗したら
None を返すことを確認する。
"""

from __future__ import annotations

from app import image_search

_PNG_HEADER = b"\x89PNG\r\n\x1a\n"
_JPEG_HEADER = b"\xff\xd8\xff"


class _FakeResponse:
    def __init__(
        self,
        status_code: int,
        *,
        json_data=None,
        text: str = "",
        content: bytes = b"",
        headers=None,
    ):
        self.status_code = status_code
        self._json = json_data
        self.text = text
        self.content = content
        self.headers = headers or {}

    def json(self):
        if self._json is None:
            raise ValueError("no json")
        return self._json


def _install_fake_get(monkeypatch, handler):
    def fake_get(url, *args, **kwargs):
        return handler(url, kwargs.get("params") or {})

    monkeypatch.setattr(image_search.httpx, "get", fake_get)


def _vqd_html(vqd: str = "test-vqd-token-123") -> str:
    return f"""<!doctype html><html><body>
        <script>nrj('/d.js?q=test&vqd={vqd}&l=us-en');</script>
    </body></html>"""


def test_returns_first_successful_image(monkeypatch):
    image_url_a = "https://example.com/a.png"
    image_url_b = "https://example.com/b.jpg"
    png_bytes = _PNG_HEADER + b"fake-png-data"

    def handler(url: str, params: dict):
        if url == image_search.DDG_SEARCH_URL:
            assert params.get("q") == "オバマ"
            return _FakeResponse(200, text=_vqd_html())
        if url == image_search.DDG_IMAGE_API:
            assert params.get("vqd") == "test-vqd-token-123"
            return _FakeResponse(
                200,
                json_data={
                    "results": [
                        {"image": image_url_a},
                        {"image": image_url_b},
                    ]
                },
            )
        if url == image_url_a:
            return _FakeResponse(200, content=png_bytes, headers={"content-type": "image/png"})
        raise AssertionError(f"unexpected url: {url}")

    _install_fake_get(monkeypatch, handler)
    result = image_search.fetch_reference_image("オバマ")
    assert result is not None
    data, mime = result
    assert data == png_bytes
    assert mime == "image/png"


def test_fetch_reference_images_returns_multiple(monkeypatch):
    """plural API: 上位 URL を順にダウンロードし max_images 枚集まったら止まる。"""
    urls = [f"https://example.com/{i}.png" for i in range(5)]
    bodies = {url: _PNG_HEADER + f"img-{i}".encode() for i, url in enumerate(urls)}

    def handler(url: str, params: dict):
        if url == image_search.DDG_SEARCH_URL:
            return _FakeResponse(200, text=_vqd_html())
        if url == image_search.DDG_IMAGE_API:
            return _FakeResponse(200, json_data={"results": [{"image": u} for u in urls]})
        if url in bodies:
            return _FakeResponse(
                200, content=bodies[url], headers={"content-type": "image/png"}
            )
        raise AssertionError(f"unexpected url: {url}")

    _install_fake_get(monkeypatch, handler)
    results = image_search.fetch_reference_images("Person", max_images=3)
    assert len(results) == 3
    # 取得順は URL 順
    assert [r[0] for r in results] == [bodies[urls[i]] for i in range(3)]
    assert all(mime == "image/png" for _, mime in results)


def test_fetch_reference_images_skips_failed_downloads(monkeypatch):
    """1 枚目が失敗しても残りで枚数を埋める。"""
    urls = [
        "https://example.com/bad.png",
        "https://example.com/good1.png",
        "https://example.com/good2.png",
    ]
    good_bytes = _PNG_HEADER + b"ok"

    def handler(url: str, params: dict):
        if url == image_search.DDG_SEARCH_URL:
            return _FakeResponse(200, text=_vqd_html())
        if url == image_search.DDG_IMAGE_API:
            return _FakeResponse(200, json_data={"results": [{"image": u} for u in urls]})
        if url == urls[0]:
            return _FakeResponse(500)
        return _FakeResponse(200, content=good_bytes, headers={"content-type": "image/png"})

    _install_fake_get(monkeypatch, handler)
    results = image_search.fetch_reference_images("Person", max_images=2)
    assert len(results) == 2


def test_fetch_reference_images_returns_empty_on_search_fail(monkeypatch):
    def handler(url: str, params: dict):
        return _FakeResponse(200, text="<html><body>no token</body></html>")

    _install_fake_get(monkeypatch, handler)
    assert image_search.fetch_reference_images("Nobody") == []


def test_falls_back_to_next_candidate_when_first_fails(monkeypatch):
    bad_url = "https://example.com/bad.png"
    good_url = "https://example.com/good.jpg"
    jpeg_bytes = _JPEG_HEADER + b"good-jpeg"

    def handler(url: str, params: dict):
        if url == image_search.DDG_SEARCH_URL:
            return _FakeResponse(200, text=_vqd_html())
        if url == image_search.DDG_IMAGE_API:
            return _FakeResponse(
                200,
                json_data={"results": [{"image": bad_url}, {"image": good_url}]},
            )
        if url == bad_url:
            return _FakeResponse(500)  # 1 件目は失敗
        if url == good_url:
            return _FakeResponse(200, content=jpeg_bytes, headers={"content-type": "image/jpeg"})
        raise AssertionError(f"unexpected url: {url}")

    _install_fake_get(monkeypatch, handler)
    result = image_search.fetch_reference_image("Some Person")
    assert result is not None
    data, mime = result
    assert data == jpeg_bytes
    assert mime == "image/jpeg"


def test_returns_none_when_vqd_token_missing(monkeypatch):
    def handler(url: str, params: dict):
        # トークン無し HTML
        return _FakeResponse(200, text="<html><body>no token here</body></html>")

    _install_fake_get(monkeypatch, handler)
    assert image_search.fetch_reference_image("Unknown") is None


def test_returns_none_when_image_api_returns_no_results(monkeypatch):
    def handler(url: str, params: dict):
        if url == image_search.DDG_SEARCH_URL:
            return _FakeResponse(200, text=_vqd_html())
        if url == image_search.DDG_IMAGE_API:
            return _FakeResponse(200, json_data={"results": []})
        raise AssertionError(f"unexpected url: {url}")

    _install_fake_get(monkeypatch, handler)
    assert image_search.fetch_reference_image("Nobody") is None


def test_returns_none_when_image_too_large(monkeypatch):
    image_url = "https://example.com/huge.png"
    huge_bytes = _PNG_HEADER + b"x" * (image_search.MAX_IMAGE_BYTES + 1)

    def handler(url: str, params: dict):
        if url == image_search.DDG_SEARCH_URL:
            return _FakeResponse(200, text=_vqd_html())
        if url == image_search.DDG_IMAGE_API:
            return _FakeResponse(200, json_data={"results": [{"image": image_url}]})
        if url == image_url:
            return _FakeResponse(200, content=huge_bytes, headers={"content-type": "image/png"})
        raise AssertionError(f"unexpected url: {url}")

    _install_fake_get(monkeypatch, handler)
    assert image_search.fetch_reference_image("Big") is None


def test_returns_none_when_mime_undetectable(monkeypatch):
    image_url = "https://example.com/unknown.bin"
    unknown_bytes = b"\x00\x00\x00\x00not-an-image"

    def handler(url: str, params: dict):
        if url == image_search.DDG_SEARCH_URL:
            return _FakeResponse(200, text=_vqd_html())
        if url == image_search.DDG_IMAGE_API:
            return _FakeResponse(200, json_data={"results": [{"image": image_url}]})
        if url == image_url:
            return _FakeResponse(
                200, content=unknown_bytes, headers={"content-type": "application/octet-stream"}
            )
        raise AssertionError(f"unexpected url: {url}")

    _install_fake_get(monkeypatch, handler)
    assert image_search.fetch_reference_image("Mystery") is None
