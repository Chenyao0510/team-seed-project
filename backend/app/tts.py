"""VOICEVOX TTS プロキシ (T67 / T69)。

T69 / D17: 話者割り当てを「性別カテゴリ別プール」方式にした。`/api/add_character`
時に Gemini で判定した `gender` (male / female / robot) を受け取り、対応する
speaker_id プールから名前ハッシュで決定論的に選ぶ。`gender` 未指定 (旧 State 等)
の場合は全プールを総和したフォールバックを使う。
"""

import hashlib
import os

import httpx
from fastapi import HTTPException
from fastapi.responses import Response

from app.models import DEFAULT_USER_NAME, Gender

VOICEVOX_URL = os.environ.get("VOICEVOX_URL", "http://127.0.0.1:50021")

# T69 / D17: 性別カテゴリ別の VOICEVOX speaker_id プール。
# 男性: 玄野武宏(11) / 白上虎太郎ふつう(12) / 青山龍星(13)
# 女性: 四国めたん ノーマル(2) / 春日部つむぎ(8) / 小夜/SAYO(46)
# ロボット: ナースロボ_タイプT(47)
SPEAKER_POOLS: dict[Gender, tuple[int, ...]] = {
    "male": (11, 12, 13),
    "female": (2, 8, 46),
    "robot": (47,),
}

# ユーザー自身の発言用に固定する speaker_id（春日部つむぎ）。
_USER_SPEAKER_ID = 8

# 全プールを総和したフォールバック（gender 未指定の旧 State 用）。
_FALLBACK_POOL: tuple[int, ...] = tuple(
    sid for pool in SPEAKER_POOLS.values() for sid in pool
)


def get_speaker_id(character_name: str, gender: Gender | None = None) -> int:
    """キャラクター名 + 性別から決定論的に speaker_id を選ぶ。

    - ユーザー自身 (`あなた` / `User`) は固定話者
    - `gender` 指定があれば該当プール内でハッシュ分散
    - `gender` 未指定なら全プール総和でフォールバック（旧挙動互換）
    """
    if character_name in (DEFAULT_USER_NAME, "User"):
        return _USER_SPEAKER_ID

    pool = SPEAKER_POOLS.get(gender) if gender is not None else None
    if not pool:
        pool = _FALLBACK_POOL

    hash_val = int(hashlib.md5(character_name.encode("utf-8")).hexdigest(), 16)
    return pool[hash_val % len(pool)]


async def generate_tts(
    text: str,
    character_name: str,
    gender: Gender | None = None,
) -> Response:
    speaker_id = get_speaker_id(character_name, gender)

    async with httpx.AsyncClient() as client:
        # 1. query作成
        try:
            query_res = await client.post(
                f"{VOICEVOX_URL}/audio_query",
                params={"text": text, "speaker": speaker_id},
                timeout=10.0,
            )
            query_res.raise_for_status()
            query_data = query_res.json()
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Voicevox audio_query failed: {e}"
            ) from e

        # 2. 音声合成
        try:
            synth_res = await client.post(
                f"{VOICEVOX_URL}/synthesis",
                params={"speaker": speaker_id},
                json=query_data,
                timeout=30.0,
            )
            synth_res.raise_for_status()
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Voicevox synthesis failed: {e}"
            ) from e

    return Response(content=synth_res.content, media_type="audio/wav")
