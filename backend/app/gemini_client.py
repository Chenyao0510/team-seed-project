"""Gemini API への呼び出しを1か所に閉じるラッパモジュール。

- describe_appearance: Search Grounding を使って人物の外見プロンプトを生成する（best-effort）
- generate_avatar_image: nano banana (画像生成モデル) でクロマキー背景のアバター画像を生成する

CONSTRAINTS.md: API キーはここで一度だけ読み込み、コードへのハードコードはしない。
呼び出し元 (avatar_pipeline) は try/except でフォールバックする前提のため、
本モジュールは失敗時に例外を投げるだけでよい。
"""

from google import genai
from google.genai import types

from app.config import (
    CHROMA_KEY_BGR,
    GEMINI_API_KEY,
    GROUNDING_TIMEOUT_SECONDS,
    IMAGE_MODEL,
    IMAGE_TIMEOUT_SECONDS,
    TEXT_MODEL,
    TEXT_TIMEOUT_SECONDS,
)

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def _chroma_color_name() -> str:
    b, g, r = CHROMA_KEY_BGR
    if r == 0 and g == 255 and b == 0:
        return "鮮やかな緑色（クロマキー用グリーンバック）"
    return f"単色背景 (RGB {r},{g},{b})"


def describe_appearance(name: str) -> str:
    """人物名から、アバター画像生成用の外見プロンプトを生成する。

    Search Grounding を使い実在人物のビジュアル特徴を反映する（best-effort）。
    Grounding 付きの呼び出しが失敗・タイムアウトした場合は、Grounding 無しで再試行する。
    """
    prompt = (
        f"「{name}」という人物について、似顔絵アバターを描くための外見の特徴を、"
        "服装・髪型・年代・雰囲気を中心に日本語で3〜4文で説明してください。"
        "本人の実際の見た目を調べた上で記述してください。"
    )
    try:
        return _generate_text(
            prompt,
            timeout_seconds=GROUNDING_TIMEOUT_SECONDS,
            use_search_grounding=True,
        )
    except Exception:
        return _generate_text(
            prompt,
            timeout_seconds=TEXT_TIMEOUT_SECONDS,
            use_search_grounding=False,
        )


def _generate_text(prompt: str, timeout_seconds: int, use_search_grounding: bool) -> str:
    config_kwargs: dict = {"http_options": types.HttpOptions(timeout=timeout_seconds * 1000)}
    if use_search_grounding:
        config_kwargs["tools"] = [types.Tool(google_search=types.GoogleSearch())]

    response = _get_client().models.generate_content(
        model=TEXT_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(**config_kwargs),
    )
    text = (response.text or "").strip()
    if not text:
        raise ValueError("Gemini text response was empty")
    return text


def generate_avatar_image(appearance_description: str) -> bytes:
    """外見の説明文から、クロマキー背景のアバター画像 (PNG/JPEG bytes) を生成する。"""
    prompt = (
        "次の特徴を持つ人物の、上半身バストアップのアバターイラストを1枚生成してください。\n"
        f"特徴: {appearance_description}\n"
        f"背景は必ず{_chroma_color_name()}の単色で、グラデーションや模様を入れないこと。"
        "人物の服や髪に背景と同じ緑色を使わないこと。"
    )

    response = _get_client().models.generate_content(
        model=IMAGE_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"],
            http_options=types.HttpOptions(timeout=IMAGE_TIMEOUT_SECONDS * 1000),
        ),
    )

    for candidate in response.candidates or []:
        for part in candidate.content.parts or []:
            if part.inline_data and part.inline_data.data:
                return part.inline_data.data

    raise ValueError("Gemini image response did not contain inline image data")
