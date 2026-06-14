""""""

from fastapi import APIRouter
from fastapi.responses import Response

from app import gemini_client
from app.avatar_pipeline import generate_character_avatar
from app.character_templates import CharacterTemplate, list_available_templates
from app.debate import advance_turn
from app.models import (
    AddCharacterRequest,
    AddCharacterResponse,
    DebateState,
    Gender,
    IntegrationState,
    ReflectionSummary,
)
from app.reflection import build_reflection
from app.summarize import build_integration
from app.tts import generate_tts

router = APIRouter()


@router.post("/api/add_character", response_model=AddCharacterResponse)
def add_character(request: AddCharacterRequest) -> AddCharacterResponse:
    avatar_url = generate_character_avatar(request.name)
    # T69 / D17: TTS 話者プール選択のため性別カテゴリを判定する。
    # classify_gender は内部で API エラーを握り潰して 'male' フォールバックを返すため、
    # ここでは例外ハンドリング不要。
    gender = gemini_client.classify_gender(request.name)
    # T72 / D18: 発言生成プロンプト用のペルソナを best-effort で生成。
    # 失敗してもアバター生成のフローは止めない。
    persona = _safe_generate_persona(request.name)
    return AddCharacterResponse(
        avatar_url=avatar_url, gender=gender, persona=persona
    )


def _safe_generate_persona(name: str) -> str:
    """ペルソナ生成は best-effort。失敗してもアバター生成のフローを止めない (T72)。"""
    try:
        return gemini_client.generate_character_persona(name)
    except Exception:
        return ""


@router.get("/api/character_templates", response_model=list[CharacterTemplate])
def character_templates() -> list[CharacterTemplate]:
    """SetupScreen が描画する事前生成テンプレートの一覧 (T5A / D16)。"""
    return list_available_templates()


@router.post("/api/next_turn", response_model=DebateState)
def next_turn(state: DebateState) -> DebateState:
    return advance_turn(state)


@router.post("/api/think", response_model=DebateState)
def think(state: DebateState) -> DebateState:
    """エージェント全員に思考を開始させ、willingness と思考内容を state に詰めて返す (T63)。"""
    from app.debate import generate_thoughts
    return generate_thoughts(state)


@router.post("/api/reflection", response_model=ReflectionSummary)
def reflection(state: DebateState) -> ReflectionSummary:
    return build_reflection(state)


@router.post("/api/summarize", response_model=IntegrationState)
def summarize(state: DebateState) -> IntegrationState:
    return build_integration(state)


@router.get("/api/tts", response_class=Response)
async def tts(
    text: str,
    character_name: str,
    gender: Gender | None = None,
) -> Response:
    """VOICEVOXを使って音声を合成しWAVデータを返す。

    T69: `gender` 指定があれば性別プールから話者を選ぶ。未指定は名前ハッシュ・
    フォールバック（旧 State との後方互換）。
    """
    return await generate_tts(text, character_name, gender)
