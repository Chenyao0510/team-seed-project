"""TTS 話者プール選択 (T69 / D17) と LRU + in-flight coalescing (T71)。

VOICEVOX 自体は叩かず、`_fetch_voicevox` をモックして
キャッシュ・コアレッシング挙動を検証する。
"""

import asyncio

import pytest

from app import tts
from app.models import DEFAULT_USER_NAME
from app.tts import SPEAKER_POOLS, get_speaker_id


@pytest.fixture(autouse=True)
def _reset_tts_cache():
    """各テストでモジュールレベルキャッシュをクリーンに保つ。"""
    tts._tts_cache.clear()
    tts._inflight.clear()
    yield
    tts._tts_cache.clear()
    tts._inflight.clear()


def test_user_speaker_is_fixed():
    """ユーザー自身は性別判定をスキップし、固定 speaker_id を使う。"""
    assert get_speaker_id(DEFAULT_USER_NAME) == 8
    assert get_speaker_id("User") == 8
    # gender が来ても固定扱い（ユーザー発言には性別なし）
    assert get_speaker_id(DEFAULT_USER_NAME, "female") == 8


def test_male_pool_is_used_for_male_gender():
    speaker_id = get_speaker_id("オバマ", "male")
    assert speaker_id in SPEAKER_POOLS["male"]


def test_female_pool_is_used_for_female_gender():
    speaker_id = get_speaker_id("マリ・キュリー", "female")
    assert speaker_id in SPEAKER_POOLS["female"]


def test_robot_pool_is_used_for_robot_gender():
    speaker_id = get_speaker_id("ドラえもん", "robot")
    assert speaker_id in SPEAKER_POOLS["robot"]


def test_same_name_same_gender_is_deterministic():
    """同じ (name, gender) なら常に同じ speaker_id が返る。"""
    a = get_speaker_id("オバマ", "male")
    b = get_speaker_id("オバマ", "male")
    assert a == b


def test_gender_none_falls_back_to_global_pool():
    """gender 未指定の旧 State 用に、全プール総和からハッシュで選ばれる。"""
    speaker_id = get_speaker_id("匿名キャラ", None)
    all_ids = {sid for pool in SPEAKER_POOLS.values() for sid in pool}
    assert speaker_id in all_ids


@pytest.mark.parametrize("gender", ["male", "female", "robot"])
def test_pools_have_no_overlap(gender):
    """各プールの間で speaker_id が重複しないこと（一意性）。"""
    others = {
        sid
        for g, pool in SPEAKER_POOLS.items()
        if g != gender
        for sid in pool
    }
    target = set(SPEAKER_POOLS[gender])
    assert target.isdisjoint(others)


# --- T71: LRU cache + in-flight coalescing ---------------------------------


@pytest.mark.asyncio
async def test_cache_hit_skips_voicevox(monkeypatch):
    """同じ (text, speaker_id) で2回呼んだら VOICEVOX は1回しか叩かない。"""
    calls: list[tuple[str, int]] = []

    async def fake_fetch(text: str, speaker_id: int) -> bytes:
        calls.append((text, speaker_id))
        return b"WAV-" + text.encode()

    monkeypatch.setattr(tts, "_fetch_voicevox", fake_fetch)

    r1 = await tts._synth_cached("hello", 2)
    r2 = await tts._synth_cached("hello", 2)

    assert r1 == r2 == b"WAV-hello"
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_different_keys_each_fetch_voicevox(monkeypatch):
    """テキストか speaker_id が違えば別エントリで合成される。"""
    calls: list[tuple[str, int]] = []

    async def fake_fetch(text: str, speaker_id: int) -> bytes:
        calls.append((text, speaker_id))
        return b"X"

    monkeypatch.setattr(tts, "_fetch_voicevox", fake_fetch)

    await tts._synth_cached("hello", 2)
    await tts._synth_cached("hello", 3)  # speaker 違い
    await tts._synth_cached("world", 2)  # text 違い

    assert len(calls) == 3


@pytest.mark.asyncio
async def test_lru_evicts_least_recently_used(monkeypatch):
    monkeypatch.setattr(tts, "_TTS_CACHE_MAXSIZE", 2)

    async def fake_fetch(text: str, speaker_id: int) -> bytes:
        return b"WAV-" + text.encode()

    monkeypatch.setattr(tts, "_fetch_voicevox", fake_fetch)

    await tts._synth_cached("a", 2)
    await tts._synth_cached("b", 2)
    await tts._synth_cached("c", 2)  # "a" を追い出す

    assert ("a", 2) not in tts._tts_cache
    assert ("b", 2) in tts._tts_cache
    assert ("c", 2) in tts._tts_cache


@pytest.mark.asyncio
async def test_lru_recent_access_keeps_entry(monkeypatch):
    """アクセスされたエントリは最近使われた扱いになり、追い出されない。"""
    monkeypatch.setattr(tts, "_TTS_CACHE_MAXSIZE", 2)

    async def fake_fetch(text: str, speaker_id: int) -> bytes:
        return b"WAV"

    monkeypatch.setattr(tts, "_fetch_voicevox", fake_fetch)

    await tts._synth_cached("a", 2)
    await tts._synth_cached("b", 2)
    # "a" を再アクセス → "b" の方が古くなる
    await tts._synth_cached("a", 2)
    await tts._synth_cached("c", 2)  # "b" が追い出される

    assert ("a", 2) in tts._tts_cache
    assert ("b", 2) not in tts._tts_cache
    assert ("c", 2) in tts._tts_cache


@pytest.mark.asyncio
async def test_inflight_coalescing(monkeypatch):
    """同じ key で同時に来た2リクエストは VOICEVOX を1回しか叩かない。

    フロントの prefetch と本番再生のリクエストがほぼ同時に到達する想定
    （prefetch が "pending" のうちに 'next' が押されるケース）。
    """
    started = asyncio.Event()
    proceed = asyncio.Event()
    call_count = 0

    async def slow_fetch(text: str, speaker_id: int) -> bytes:
        nonlocal call_count
        call_count += 1
        started.set()
        await proceed.wait()
        return b"WAV"

    monkeypatch.setattr(tts, "_fetch_voicevox", slow_fetch)

    t1 = asyncio.create_task(tts._synth_cached("x", 2))
    await started.wait()  # 1本目が VOICEVOX 呼び出しに突入したのを確認
    t2 = asyncio.create_task(tts._synth_cached("x", 2))
    # t2 が in-flight Future の await に到達するまで yield
    await asyncio.sleep(0)
    proceed.set()
    r1, r2 = await asyncio.gather(t1, t2)

    assert r1 == r2 == b"WAV"
    assert call_count == 1


@pytest.mark.asyncio
async def test_inflight_failure_is_propagated_and_cleared(monkeypatch):
    """1本目が失敗したら 2本目にも例外が伝播し、in-flight 登録は掃除される。"""

    async def failing_fetch(text: str, speaker_id: int) -> bytes:
        raise RuntimeError("voicevox down")

    monkeypatch.setattr(tts, "_fetch_voicevox", failing_fetch)

    with pytest.raises(RuntimeError):
        await tts._synth_cached("x", 2)

    # in-flight が残らないこと（次のリトライが Future 経由で待機しない）
    assert ("x", 2) not in tts._inflight
    assert ("x", 2) not in tts._tts_cache


@pytest.mark.asyncio
async def test_generate_tts_returns_wav_bytes(monkeypatch):
    """ハッピーパス: speaker_id 解決 → cache miss → fetch → Response。"""

    async def fake_fetch(text: str, speaker_id: int) -> bytes:
        return b"FAKE-WAV"

    monkeypatch.setattr(tts, "_fetch_voicevox", fake_fetch)

    response = await tts.generate_tts("こんにちは", "オバマ", "male")

    assert response.status_code == 200
    assert response.media_type == "audio/wav"
    assert response.body == b"FAKE-WAV"
