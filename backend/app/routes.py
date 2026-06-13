"""機能エンドポイントのルーター。"""

from fastapi import APIRouter

from app.avatar_pipeline import generate_character_avatar
from app.models import AddCharacterRequest, AddCharacterResponse

router = APIRouter()


@router.post("/api/add_character", response_model=AddCharacterResponse)
def add_character(request: AddCharacterRequest) -> AddCharacterResponse:
    avatar_url = generate_character_avatar(request.name)
    return AddCharacterResponse(avatar_url=avatar_url)
