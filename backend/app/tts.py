import hashlib
import os

import httpx
from fastapi import HTTPException
from fastapi.responses import Response

VOICEVOX_URL = os.environ.get("VOICEVOX_URL", "http://127.0.0.1:50021")

# VOICEVOX標準キャラのSpeaker ID例 (男性/女性を混ぜる)
# 2: 四国めたん, 3: ずんだもん, 8: 春日部つむぎ, 11: 玄野武宏(男性),
# 13: 青山龍星(男性), 14: 冥鳴ひまり, 20: もち子
SPEAKER_IDS = [2, 3, 8, 11, 13, 14, 20]

def get_speaker_id(character_name: str) -> int:
    """キャラクター名から決定論的に speaker_id を割り当てる"""
    if character_name in ("あなた", "User"):
        return 8  # ユーザー用は固定
    
    hash_val = int(hashlib.md5(character_name.encode("utf-8")).hexdigest(), 16)
    return SPEAKER_IDS[hash_val % len(SPEAKER_IDS)]

async def generate_tts(text: str, character_name: str) -> Response:
    speaker_id = get_speaker_id(character_name)
    
    async with httpx.AsyncClient() as client:
        # 1. query作成
        try:
            query_res = await client.post(
                f"{VOICEVOX_URL}/audio_query",
                params={"text": text, "speaker": speaker_id},
                timeout=10.0
            )
            query_res.raise_for_status()
            query_data = query_res.json()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Voicevox audio_query failed: {e}") from e
            
        # 2. 音声合成
        try:
            synth_res = await client.post(
                f"{VOICEVOX_URL}/synthesis",
                params={"speaker": speaker_id},
                json=query_data,
                timeout=30.0
            )
            synth_res.raise_for_status()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Voicevox synthesis failed: {e}") from e
            
    return Response(content=synth_res.content, media_type="audio/wav")
