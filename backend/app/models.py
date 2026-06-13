"""`/api/add_character` の入出力 pydantic モデル。"""

from pydantic import BaseModel, Field


class AddCharacterRequest(BaseModel):
    name: str = Field(min_length=1)


class AddCharacterResponse(BaseModel):
    avatar_url: str
