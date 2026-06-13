"""`/api/next_turn` のオーケストレーション (T24)。

LangGraph 等は使わず (D02)、Debate State を受け取り Gemini で次のターンを生成して
新しい Debate State を返す。失敗時は roster 内ローテーションで決定的にフォールバックする
(D11)。state はミューテーションせず常に新しいオブジェクトを返す。
"""

import concurrent.futures
import random

from app import gemini_client
from app.models import ChatMessage, DebateState


def generate_thoughts(state: DebateState) -> DebateState:
    """エージェント全員に並行して思考させ、その結果を state に詰めて返す。
    この段階ではまだ発言者は決定せず、status="thinking" とする。
    """
    # 直前の発言をアーカイブする（思考の前提として必要）
    chat_history = _archive_current_speech(state)
    roster_names = [c.name for c in state.characters]

    # プロンプトには、直前の発言を正しく含めた最新の履歴を渡す
    temp_state = state.model_copy(update={"chat_history": chat_history})

    thoughts = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, len(roster_names))) as executor:
        future_to_name = {
            executor.submit(gemini_client.generate_agent_thought, temp_state, name): name
            for name in roster_names
        }
        for future in concurrent.futures.as_completed(future_to_name):
            name = future_to_name[future]
            try:
                thoughts[name] = future.result()
            except Exception as exc:
                print(f"[generate_thoughts] {name} thought generation failed: {exc}")

    return DebateState(
        theme=state.theme,
        current_topic=state.current_topic,
        active_character=state.active_character,  # まだ変えない
        status="thinking",
        current_speech="",  # 思考中なので空
        current_points=state.current_points,
        characters=state.characters,
        chat_history=chat_history,
        turn_count=state.turn_count,  # まだ増やさない
        user=state.user,
        agent_thoughts=thoughts,
    )


def advance_turn(state: DebateState) -> DebateState:
    """現在の State を1ターン進め、新しい Debate State を返す。

    もし既に思考結果 (agent_thoughts) があればそれを利用し、
    なければその場で生成（旧来の挙動）してから発言者を決定する。
    """
    # すでに思考済みの結果があるか確認
    if state.agent_thoughts and state.status == "thinking":
        thoughts = state.agent_thoughts
        chat_history = state.chat_history  # generate_thoughts で既にアーカイブ済み
    else:
        # 思考結果がない場合はその場で生成（フォールバック）
        thought_state = generate_thoughts(state)
        thoughts = thought_state.agent_thoughts
        chat_history = thought_state.chat_history

    roster_names = [c.name for c in state.characters]
    willing_names = [name for name, t in thoughts.items() if t.willingness_to_speak]

    # 直前の発言者を除外して、なるべく違う人に発言させる
    other_willing_names = [n for n in willing_names if n != state.active_character]

    if other_willing_names:
        # T63: 将来的にはここを LLM に「誰が最も適任か」選ばせることができる
        next_character = random.choice(other_willing_names)
    elif willing_names:
        next_character = random.choice(willing_names)
    elif thoughts:
        # 誰も発言したくない場合はランダムで1人に無理やり発言させる（直前発言者以外を優先）
        others = [n for n in thoughts.keys() if n != state.active_character]
        if others:
            next_character = random.choice(others)
        else:
            next_character = random.choice(list(thoughts.keys()))
    else:
        # 全員のエラー等で thoughts が空の場合はフォールバック
        next_character = _next_in_rotation(state)

    if thoughts and next_character in thoughts:
        chosen_thought = thoughts[next_character]
        current_speech = chosen_thought.current_speech
        current_points = chosen_thought.current_points
        current_topic = chosen_thought.current_topic
        emotion = chosen_thought.emotion
    else:
        current_speech = f"{next_character}が話を引き継ぎます。"
        current_points = state.current_points
        current_topic = state.current_topic
        emotion = "neutral"

    return DebateState(
        theme=state.theme,
        current_topic=current_topic,
        active_character=next_character,
        status="speaking",
        current_speech=current_speech,
        emotion=emotion,
        current_points=current_points,
        characters=state.characters,
        chat_history=chat_history,
        turn_count=state.turn_count + 1,
        user=state.user,
        agent_thoughts=thoughts,
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
        emotion=state.emotion,
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
    # roster 外の話者（ユーザー介入 = state.user.name）はユーザーアバターで解決する (T58)。
    if name == state.user.name:
        return state.user.avatar_url
    return ""
