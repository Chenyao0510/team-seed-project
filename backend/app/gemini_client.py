"""Gemini API への呼び出しを1か所に閉じるラッパモジュール。

- describe_appearance: Search Grounding を使って人物の外見プロンプトを生成する（best-effort）
- generate_avatar_image: nano banana (画像生成モデル) でクロマキー背景のアバター画像を生成する

CONSTRAINTS.md: API キーはここで一度だけ読み込み、コードへのハードコードはしない。
呼び出し元 (avatar_pipeline) は try/except でフォールバックする前提のため、
本モジュールは失敗時に例外を投げるだけでよい。
"""

import json

from google import genai
from google.genai import types

from app.config import (
    CHAT_HISTORY_PROMPT_LIMIT,
    CHROMA_KEY_BGR,
    GEMINI_API_KEY,
    GROUNDING_TIMEOUT_SECONDS,
    IMAGE_MODEL,
    IMAGE_TIMEOUT_SECONDS,
    NEXT_TURN_TIMEOUT_SECONDS,
    SUMMARIZE_HISTORY_PROMPT_LIMIT,
    SUMMARIZE_TIMEOUT_SECONDS,
    TEXT_MODEL,
    TEXT_TIMEOUT_SECONDS,
)
from app.models import DebateState, IntegrationState, NextTurnLLMOutput

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


def generate_next_turn(state: DebateState) -> NextTurnLLMOutput:
    """現在の Debate State から、次のターン（話者・発言・論点）を構造化生成する。

    D04: responseSchema を指定し JSON を強制する。失敗時は呼び出し元 (app/debate.py)
    がローテーション・フォールバックするため、ここでは例外を投げるだけでよい。
    """
    prompt = _build_next_turn_prompt(state)
    response = _get_client().models.generate_content(
        model=TEXT_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=NextTurnLLMOutput,
            http_options=types.HttpOptions(timeout=NEXT_TURN_TIMEOUT_SECONDS * 1000),
        ),
    )
    text = (response.text or "").strip()
    if not text:
        raise ValueError("Gemini next_turn response was empty")
    return NextTurnLLMOutput.model_validate(json.loads(text))


def generate_summary(state: DebateState) -> IntegrationState:
    """Debate State の全履歴から、Screen 2 用の Integration State を構造化生成する。

    D04: responseSchema を指定し JSON を強制する。失敗時は呼び出し元
    (app/summarize.py) が決定的フォールバックする前提のため、ここでは
    例外を投げるだけでよい。
    """
    prompt = _build_summarize_prompt(state)
    response = _get_client().models.generate_content(
        model=TEXT_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=IntegrationState,
            http_options=types.HttpOptions(timeout=SUMMARIZE_TIMEOUT_SECONDS * 1000),
        ),
    )
    text = (response.text or "").strip()
    if not text:
        raise ValueError("Gemini summarize response was empty")
    return IntegrationState.model_validate(json.loads(text))


def _build_next_turn_prompt(state: DebateState) -> str:
    roster = "、".join(c.name for c in state.characters)
    history_lines = [
        f"{m.speaker}: {m.text}" for m in state.chat_history[-CHAT_HISTORY_PROMPT_LIMIT:]
    ]
    history_text = "\n".join(history_lines) if history_lines else "(まだ発言はありません)"
    points_text = "、".join(state.current_points) if state.current_points else "(まだなし)"

    return (
        "あなたは討論番組の進行役です。以下の討論の状況をもとに、次に発言する人物を1人選び、"
        "その人物として日本語で発言してください。\n\n"
        f"テーマ: {state.theme}\n"
        f"現在の論点: {state.current_topic}\n"
        f"登場人物（roster）: {roster}\n"
        f"直前の発言者: {state.active_character}\n"
        f"これまでの発言ログ:\n{history_text}\n"
        f"現在の論点リスト: {points_text}\n\n"
        "ルール:\n"
        f"- active_character は roster ({roster}) の中から、直前の発言者"
        f"（{state.active_character}）とは別の人物を選ぶこと。\n"
        "- 発言ログの末尾の発言者が roster に含まれない場合、それはユーザーからの介入"
        "（異議・観点・質問）です。次の発言者はその介入に正面から反応すること。\n"
        "- current_speech は選んだ人物の口調・立場を反映した、1〜3文の日本語の発言。\n"
        "- current_points は議論全体を通じた論点リストを、新しい発言を踏まえて更新したもの"
        "（重要な論点を3〜5個、簡潔な日本語の名詞句で）。\n"
        "- current_topic は現在議論されている小テーマを簡潔に。"
    )


def _build_summarize_prompt(state: DebateState) -> str:
    roster_names = {c.name for c in state.characters}
    history_lines = [
        f"{m.speaker}: {m.text}"
        for m in state.chat_history[-SUMMARIZE_HISTORY_PROMPT_LIMIT:]
    ]
    history_text = "\n".join(history_lines) if history_lines else "(発言ログなし)"
    user_lines = [
        f"{m.speaker}: {m.text}"
        for m in state.chat_history
        if m.speaker not in roster_names
    ]
    user_text = "\n".join(user_lines) if user_lines else "(ユーザー介入なし)"
    points_text = "、".join(state.current_points) if state.current_points else "(なし)"

    return (
        "あなたは討論の構造を統合するエディターです。以下の討論ログを読み、"
        "「問いの進化（Before → After）」と「議論を構成する観点の構造マップ」を"
        "日本語で JSON にまとめてください。\n\n"
        f"テーマ: {state.theme}\n"
        f"最終的に扱われていた論点: {state.current_topic}\n"
        f"議論全体の論点リスト: {points_text}\n"
        f"発言ログ:\n{history_text}\n\n"
        f"このうちユーザーからの介入発言:\n{user_text}\n\n"
        "ルール:\n"
        "- before_question: 議論開始時にユーザーが抱いていた素朴な問い"
        "（テーマを1文で問いの形にしたもの）。\n"
        "- after_question: 議論とユーザー介入を経て進化した、より構造的・本質的な問い（1文）。\n"
        "- structure_map: 議論で扱われた観点を 2〜4 個のカテゴリにまとめた配列。\n"
        "  各カテゴリは category_name（簡潔な名詞句）と elements"
        "（その観点を構成する要素を2〜4個の名詞句で）を持つ。\n"
        "  ユーザー介入により新しく加わった、または強調された要素があれば、そのカテゴリの"
        "  highlighted_element_index にそのインデックス（0始まり）を入れる。\n"
        "  介入が該当しないカテゴリでは省略可。\n"
        "- user_catalyst: ユーザー介入が議論にもたらした触媒となった視点を、"
        "簡潔な名詞句で1つ。\n"
        "  ユーザー介入が無かった場合は、議論で最も中心的だった視点を入れる。\n"
        "- connective_value_praise: ユーザーの介入が問いの構造に与えた影響を、"
        "ユーザーを称賛するトーンで1〜2文の日本語で。\n"
        "  「あなたの〇〇により、〜が〜へと拡張・統合されました」のような構文を推奨。\n"
        "  ユーザーの不安や劣等感を煽る表現（「浅い」「足りない」等）は禁止。"
    )
