"""TTS 話者プール選択 (T69 / D17)。

VOICEVOX 自体はモックせず、`get_speaker_id` の決定性とプール分離だけを検証する。
ネットワーク呼び出しのある `generate_tts` は別途 e2e で扱う。
"""

import pytest

from app.models import DEFAULT_USER_NAME
from app.tts import SPEAKER_POOLS, get_speaker_id


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
