"""API 入出力の pydantic モデル。

- AddCharacter*: `/api/add_character`（T12）
- Debate*: `/api/next_turn`（T24）。スキーマは DECISIONS.md D01 が Source of Truth。
- Integration*: `/api/summarize`（T31）。同じく D01 が Source of Truth。
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


class NextTurnLLMOutput(BaseModel):
    """Gemini に responseSchema として強制する次ターンの構造化出力。

    `status` は LLM に委ねず Python 側で決定するため含めない。
    """

    active_character: str
    current_speech: str
    current_points: list[str]
    current_topic: str


class StructureCategory(BaseModel):
    """Integration Map の1カテゴリ（Bento UI の1セル）。"""

    category_name: str
    elements: list[str]
    highlighted_element_index: int | None = None


class IntegrationState(BaseModel):
    """Screen 2 (Integration Map) の唯一の信頼できる State。

    `connective_value_praise` はユーザーの介入が問いの構造に与えた影響を称賛する文言
    （CONSTRAINTS.md: ユーザーの不安や劣等感を煽る文言は禁止）。
    """

    before_question: str
    after_question: str
    structure_map: list[StructureCategory]
    user_catalyst: str
    connective_value_praise: str
