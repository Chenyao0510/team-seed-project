"""VOICEVOX TTS プロキシ (T67 / T69 / T70 / T71)。

T69 / D17: 話者割り当てを「性別カテゴリ別プール」方式にした。`/api/add_character`
時に Gemini で判定した `gender` (male / female / robot) を受け取り、対応する
speaker_id プールから名前ハッシュで決定論的に選ぶ。`gender` 未指定 (旧 State 等)
の場合は全プールを総和したフォールバックを使う。

T71: VOICEVOX 合成結果（WAV bytes）をプロセス内 LRU で保持する。同じ (text, speaker_id)
の組合せが再リクエストされたとき、VOICEVOX への往復をスキップして即返す。
合わせて in-flight coalescing を行い、フロント prefetch と本番再生の二重リクエストが
同時に到達しても VOICEVOX を 1 回しか叩かないようにする（同じ Future を共有させる）。
"""

import asyncio
import hashlib
import os
from collections import OrderedDict

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

# T71: WAV bytes の LRU キャッシュ。キーは (text, speaker_id)。
# 同じテキスト + 同じ話者なら出力 wav は決定的なので、再合成せず使い回せる。
# サイズは 1 セッションで生じうるユニーク発話数を多めに見積もって 128。
# 1 wav あたり数十 KB〜数百 KB なので最大でも数十 MB に収まる。
_TTS_CACHE_MAXSIZE = 128
_tts_cache: "OrderedDict[tuple[str, int], bytes]" = OrderedDict()
# T71: 同一キーの in-flight リクエストを共有するための Future レジストリ。
_inflight: dict[tuple[str, int], asyncio.Future[bytes]] = {}


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


def _cache_get(key: tuple[str, int]) -> bytes | None:
    if key in _tts_cache:
        _tts_cache.move_to_end(key)
        return _tts_cache[key]
    return None


def _cache_put(key: tuple[str, int], data: bytes) -> None:
    _tts_cache[key] = data
    _tts_cache.move_to_end(key)
    while len(_tts_cache) > _TTS_CACHE_MAXSIZE:
        _tts_cache.popitem(last=False)


async def _fetch_voicevox(text: str, speaker_id: int) -> bytes:
    """VOICEVOX への実 HTTP 往復。キャッシュは一切見ない素の合成。"""
    async with httpx.AsyncClient() as client:
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

    return synth_res.content


async def _synth_cached(text: str, speaker_id: int) -> bytes:
    """LRU + in-flight coalescing 付きで wav を返す。

    1. キャッシュ命中なら即返す
    2. 同じキーが既に合成中なら、その Future を共有して結果を待つ
       （フロント prefetch と本番再生の二重発火を 1 回にまとめる）
    3. どちらでもなければ新規に VOICEVOX を叩く
    """
    key = (text, speaker_id)
    cached = _cache_get(key)
    if cached is not None:
        return cached

    existing = _inflight.get(key)
    if existing is not None:
        return await existing

    loop = asyncio.get_running_loop()
    fut: asyncio.Future[bytes] = loop.create_future()
    _inflight[key] = fut
    try:
        wav = await _fetch_voicevox(text, speaker_id)
    except BaseException as e:
        # HTTPException も含めて、待っている他コルーチンに伝播させる
        if not fut.done():
            fut.set_exception(e)
        _inflight.pop(key, None)
        raise

    _cache_put(key, wav)
    if not fut.done():
        fut.set_result(wav)
    _inflight.pop(key, None)
    return wav


async def generate_tts(
    text: str,
    character_name: str,
    gender: Gender | None = None,
) -> Response:
    speaker_id = get_speaker_id(character_name, gender)
    wav = await _synth_cached(text, speaker_id)
    return Response(content=wav, media_type="audio/wav")
