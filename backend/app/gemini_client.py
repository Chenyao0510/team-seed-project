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
    REFLECTION_TIMEOUT_SECONDS,
    TEXT_MODEL,
    TEXT_TIMEOUT_SECONDS,
)
from app.models import DebateState, NextTurnLLMOutput, ReflectionSummary

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


def generate_reflection(state: DebateState) -> ReflectionSummary:
    """現在の Debate State から、Reflection Turn 用の構造化要約を生成する。

    D13: responseSchema を指定し JSON を強制する。失敗時は呼び出し元 (app/reflection.py)
    が決定論的フォールバックを使うため、ここでは例外を投げるだけでよい。
    """
    prompt = _build_reflection_prompt(state)
    response = _get_client().models.generate_content(
        model=TEXT_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ReflectionSummary,
            http_options=types.HttpOptions(timeout=REFLECTION_TIMEOUT_SECONDS * 1000),
        ),
    )
    text = (response.text or "").strip()
    if not text:
        raise ValueError("Gemini reflection response was empty")
    return ReflectionSummary.model_validate(json.loads(text))


def _build_reflection_prompt(state: DebateState) -> str:
    roster = "、".join(c.name for c in state.characters)
    history_lines = [
        f"{m.speaker}: {m.text}" for m in state.chat_history[-CHAT_HISTORY_PROMPT_LIMIT:]
    ]
    history_text = "\n".join(history_lines) if history_lines else "(まだ発言はありません)"
    points_text = "、".join(state.current_points) if state.current_points else "(まだなし)"

    return (
        "あなたは討論番組の進行役（ファシリテーター）です。参加者(roster)には含まれず、"
        "議論には参加しません。これまでの討論を振り返るための、中立的な構造化要約を"
        "日本語で作成してください。\n\n"
        f"テーマ: {state.theme}\n"
        f"現在の論点: {state.current_topic}\n"
        f"登場人物（roster）: {roster}\n"
        f"これまでの発言ログ:\n{history_text}\n"
        f"現在の論点リスト: {points_text}\n\n"
        "出力ルール:\n"
        "- facilitator_comment は、ここまでの議論の流れを1〜2文で中立的にまとめたもの。"
        "「足りない視点」「追加すべき人物」など、今後の進行に関する提案や誘導は一切"
        "含めないこと。\n"
        "- blocks は現在の論点リストに対応する要約ブロックの配列。各ブロックは"
        " topic（論点）と stances（その論点に対する対立する立場の配列、通常2つ）を"
        "持つこと。\n"
        "- 各 stance は label（立場を表す5〜10文字程度の短いラベル）、"
        "summary（その立場の論理を15〜25文字程度の一言で端的に表したもの。"
        "対になる stance と対比した際にどう違うかが一目で分かるようにすること）、"
        "characters（その立場を取っている roster 内の人物名の配列）を持つこと。\n"
        f"- characters に含める名前は roster ({roster}) に含まれるものだけにすること。\n"
        "- blocks は最低1つは含めること。topic には現在の論点（または発言ログから読み取れる"
        "直近の話題）を使い、これまでの発言から各話者がどの立場を取っているかを推定して"
        "stances を構成すること。発言が少ない場合でも、発言内容から読み取れる範囲で"
        "推定してよい。"
    )


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
        "- current_topic は現在議論されている小テーマを、名詞句を「/」で区切った"
        "10〜20文字程度の短い表現にすること（例:「無形価値の評価方法/成果への繋がり」）。"
        "文章や「〜について」「〜の評価」のような冗長な言い回しは避けること。"
    )
