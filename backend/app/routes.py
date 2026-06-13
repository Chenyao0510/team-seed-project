""""""

from fastapi import APIRouter
from fastapi.responses import Response

from app.avatar_pipeline import generate_character_avatar
from app.character_templates import CharacterTemplate, list_available_templates
from app.debate import advance_turn
from app.models import (
    AddCharacterRequest,
    AddCharacterResponse,
    DebateState,
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
    return AddCharacterResponse(avatar_url=avatar_url)


@router.get("/api/character_templates", response_model=list[CharacterTemplate])
def character_templates() -> list[CharacterTemplate]:
    """SetupScreen が描画する事前生成テンプレートの一覧 (T5A / D16)。"""
    return list_available_templates()


@router.post("/api/next_turn", response_model=DebateState)
def next_turn(state: DebateState) -> DebateState:
    return advance_turn(state)


@router.post("/api/reflection", response_model=ReflectionSummary)
def reflection(state: DebateState) -> ReflectionSummary:
    return build_reflection(state)


@router.post("/api/summarize", response_model=IntegrationState)
def summarize(state: DebateState) -> IntegrationState:
    return build_integration(state)


@router.get("/api/tts", response_class=Response)
async def tts(text: str, character_name: str) -> Response:
    """VOICEVOXを使って音声を合成しWAVデータを返す"""
    return await generate_tts(text, character_name)
