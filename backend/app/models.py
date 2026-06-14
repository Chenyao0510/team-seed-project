"""API 入出力の pydantic モデル。

- AddCharacter*: `/api/add_character`（T12）
- Debate*: `/api/next_turn`（T24）。スキーマは DECISIONS.md D01 が Source of Truth。
- Reflection*: `/api/reflection`（T26 残作業）。スキーマは DECISIONS.md D13 参照。
- Integration*: `/api/summarize`（T31）。同じく D01 が Source of Truth。
"""

from typing import Literal

from pydantic import BaseModel, Field

DebateStatus = Literal["thinking", "speaking", "waiting"]

# T69 / D17: TTS 話者プールを切り替えるための性別カテゴリ。
# Gemini 判定 (`classify_gender`) は通常 male/female を返すが、ドラえもん等
# 明らかな非人間キャラには robot を返す。
Gender = Literal["male", "female", "robot"]


class AddCharacterRequest(BaseModel):
    name: str = Field(min_length=1)


class AddCharacterResponse(BaseModel):
    avatar_url: str
    gender: Gender
    persona: str = ""


class GenderClassification(BaseModel):
    """`classify_gender` の Gemini responseSchema 用ラッパー。

    Gemini Structured Outputs はトップレベルで Literal 単体を受けないため、
    `gender` フィールド 1 つだけ持つ BaseModel として渡す。
    """

    gender: Gender


class CharacterRef(BaseModel):
    name: str
    avatar_url: str
    # T69: TTS で性別プールから話者を選ぶ。後方互換のため None 許容
    # （未指定の古い State は tts.py 側で名前ハッシュ・フォールバックに回す）。
    gender: Gender | None = None
    # T72 / D18: 発言生成プロンプトの色付け専用ペルソナ。
    persona: str = ""


class ChatMessage(BaseModel):
    speaker: str
    text: str
    avatar_url: str
    emotion: str = "neutral"


# ユーザー介入発言の既定話者名（roster 外）。フロント (DebateStage) と一致させる。
DEFAULT_USER_NAME = "あなた"


class UserRef(BaseModel):
    """ステージ右端に固定表示されるユーザー自身の表示情報 (T58, DECISIONS D01)。

    `name` は介入発言の話者名、`avatar_url` は Screen 0 で登録したアバター。
    後方互換のため optional 既定値を持ち、未登録 (空文字) でも従来通り動作する。
    """

    name: str = DEFAULT_USER_NAME
    avatar_url: str = ""


class AgentThoughtOutput(BaseModel):
    """各エージェント（AI）が個別に次の発言を考える際の構造化出力。

    発言は単一文字列ではなく `hook`（即座の反応の一句）＋ `body`（主張本体）に分割する
    (D18)。`current_speech` はバックエンドで `hook + body` から合成する導出値。
    """

    willingness_to_speak: bool
    thought: str = Field(description="発言に至るまでの思考プロセス")
    hook: str = Field(description="最初に表示する短い反応の一句（〜15文字）")
    body: str = Field(description="hook に続く主張本体。hook+body 合計60文字以内")
    reasoning_target: str = Field(default="", description="反応した相手（話者名＋要点）")
    concepts: list[str] = Field(default_factory=list, description="body 内の強調語を1〜2個")
    current_points: list[str]
    current_topic: str
    emotion: str = "neutral"


class CharacterPersonaOutput(BaseModel):
    """`/api/add_character` でのペルソナ自動生成 (T62) の構造化出力。"""

    persona: str = Field(description="人物像・口調・専門・価値観を1〜2文で表したもの")


class DebateState(BaseModel):
    """Screen 1 (Debate Stage) の唯一の信頼できる State。"""

    theme: str
    current_topic: str
    active_character: str
    status: DebateStatus
    # current_speech は hook + body から合成した導出値（TTS / chat_history archive 用に温存）。
    current_speech: str
    # 表示専用の構造化発言フィールド (D18)。後方互換のため全て既定値あり。
    current_hook: str = ""
    current_body: str = ""
    current_reasoning_target: str = ""
    current_concepts: list[str] = Field(default_factory=list)
    emotion: str = "neutral"
    current_points: list[str]
    characters: list[CharacterRef] = Field(min_length=1)
    chat_history: list[ChatMessage]
    turn_count: int = Field(default=0, ge=0)
    user: UserRef = Field(default_factory=UserRef)
    agent_thoughts: dict[str, AgentThoughtOutput] = Field(default_factory=dict)


class NextTurnLLMOutput(BaseModel):
    """(廃止予定: generate_next_turn で使用していたモデル)"""

    active_character: str
    hook: str = ""
    body: str = ""
    reasoning_target: str = ""
    concepts: list[str] = Field(default_factory=list)
    emotion: str = "neutral"
    current_points: list[str]
    current_topic: str


class ReflectionStance(BaseModel):
    """論点に対する1つの立場と、その立場を取るキャラクタ。"""

    label: str
    summary: str
    characters: list[str]


class ReflectionBlock(BaseModel):
    """論点ごとの立場ブロック。"""

    topic: str
    stances: list[ReflectionStance]


class ReflectionSummary(BaseModel):
    """`/api/reflection` のレスポンス（Gemini responseSchema にも使う）。

    `facilitator_comment` は中立の要約一言で、足りない視点・追加すべき人物の
    提案は含めない（PROGRESS.md T26 の制約）。
    """

    facilitator_comment: str
    blocks: list[ReflectionBlock]


class StructureCategory(BaseModel):
    """Integration Map の1カテゴリ（Bento UI の1セル）。"""

    category_name: str
    elements: list[str]
    highlighted_element_index: int | None = None


class IntegrationState(BaseModel):
    """Screen 2 (Integration Map) の唯一の信頼できる State。

    `central_concept` は Bento UI 中心ノードに表示する短い名詞句 (D15)。テーマ全文を
    そのまま中心に置くと十字 Bento のレイアウトが破綻するため、LLM 側で短く生成させる。
    `connective_value_praise` はユーザーの介入が問いの構造に与えた影響を称賛する文言
    （CONSTRAINTS.md: ユーザーの不安や劣等感を煽る文言は禁止）。
    """

    central_concept: str = Field(..., max_length=12)
    before_question: str
    after_question: str
    structure_map: list[StructureCategory]
    user_catalyst: str
    connective_value_praise: str
