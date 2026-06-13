"""API 入出力の pydantic モデル。

- AddCharacter*: `/api/add_character`（T12）
- Debate*: `/api/next_turn`（T24）。スキーマは DECISIONS.md D01 が Source of Truth。
"""

from typing import Literal

from pydantic import BaseModel, Field

DebateStatus = Literal["thinking", "speaking", "waiting"]


class AddCharacterRequest(BaseModel):
    name: str = Field(min_length=1)


class AddCharacterResponse(BaseModel):
    avatar_url: str


class CharacterRef(BaseModel):
    name: str
    avatar_url: str


class ChatMessage(BaseModel):
    speaker: str
    text: str
    avatar_url: str


class DebateState(BaseModel):
    """Screen 1 (Debate Stage) の唯一の信頼できる State。"""

    theme: str
    current_topic: str
    active_character: str
    status: DebateStatus
    current_speech: str
    current_points: list[str]
    characters: list[CharacterRef] = Field(min_length=1)
    chat_history: list[ChatMessage]
    turn_count: int = Field(default=0, ge=0)


class NextTurnLLMOutput(BaseModel):
    """Gemini に responseSchema として強制する次ターンの構造化出力。

    `status` は LLM に委ねず Python 側で決定するため含めない。
    """

    active_character: str
    current_speech: str
    current_points: list[str]
    current_topic: str
