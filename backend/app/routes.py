""""""

from fastapi import APIRouter

from app.avatar_pipeline import generate_character_avatar
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

router = APIRouter()


@router.post("/api/add_character", response_model=AddCharacterResponse)
def add_character(request: AddCharacterRequest) -> AddCharacterResponse:
    avatar_url = generate_character_avatar(request.name)
    return AddCharacterResponse(avatar_url=avatar_url)


@router.post("/api/next_turn", response_model=DebateState)
def next_turn(state: DebateState) -> DebateState:
    return advance_turn(state)


@router.post("/api/reflection", response_model=ReflectionSummary)
def reflection(state: DebateState) -> ReflectionSummary:
    return build_reflection(state)


@router.post("/api/summarize", response_model=IntegrationState)
def summarize(state: DebateState) -> IntegrationState:
    return build_integration(state)
