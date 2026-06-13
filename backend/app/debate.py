"""`/api/next_turn` のオーケストレーション (T24)。

LangGraph 等は使わず (D02)、Debate State を受け取り Gemini で次のターンを生成して
新しい Debate State を返す。失敗時は roster 内ローテーションで決定的にフォールバックする
(D11)。state はミューテーションせず常に新しいオブジェクトを返す。
"""

from app import gemini_client
from app.models import ChatMessage, DebateState


def advance_turn(state: DebateState) -> DebateState:
    """現在の State を1ターン進め、新しい Debate State を返す。"""
    chat_history = _archive_current_speech(state)

    try:
        llm_output = gemini_client.generate_next_turn(state)
        roster_names = {c.name for c in state.characters}
        if llm_output.active_character not in roster_names:
            raise ValueError("active_character is not in roster")
        next_character = llm_output.active_character
        current_speech = llm_output.current_speech
        current_points = llm_output.current_points
        current_topic = llm_output.current_topic
    except Exception:
        next_character = _next_in_rotation(state)
        current_speech = f"{next_character}が話を引き継ぎます。"
        current_points = state.current_points
        current_topic = state.current_topic

    return DebateState(
        theme=state.theme,
        current_topic=current_topic,
        active_character=next_character,
        status="speaking",
        current_speech=current_speech,
        current_points=current_points,
        characters=state.characters,
        chat_history=chat_history,
    )


def _archive_current_speech(state: DebateState) -> list[ChatMessage]:
    """直前の active_character の発言を chat_history に追記した新しいリストを返す。

    current_speech が空、または既に chat_history 末尾と同一の場合は追記しない
    （初回ターンや重複呼び出しでの二重登録を防ぐ）。
    """
    if not state.current_speech:
        return list(state.chat_history)

    last = state.chat_history[-1] if state.chat_history else None
    is_duplicate = (
        last is not None
        and last.speaker == state.active_character
        and last.text == state.current_speech
    )
    if is_duplicate:
        return list(state.chat_history)

    new_message = ChatMessage(
        speaker=state.active_character,
        text=state.current_speech,
        avatar_url=_avatar_for(state, state.active_character),
    )
    return [*state.chat_history, new_message]


def _next_in_rotation(state: DebateState) -> str:
    """roster 内で active_character の次の人物名を返す（フォールバック用）。"""
    names = [c.name for c in state.characters]
    if state.active_character not in names:
        return names[0]
    index = names.index(state.active_character)
    return names[(index + 1) % len(names)]


def _avatar_for(state: DebateState, name: str) -> str:
    for character in state.characters:
        if character.name == name:
            return character.avatar_url
    return ""
