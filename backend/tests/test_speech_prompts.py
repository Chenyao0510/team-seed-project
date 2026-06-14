"""発言生成プロンプトの persona 注入 / hook-body 構造化ルール (T62/T64/T69, D17/D18) を検証する。

Gemini API は呼ばず、`_build_*_prompt` が組み立てる文字列のみを検証する。
"""

from app.gemini_client import _build_agent_thought_prompt, _build_next_turn_prompt
from app.models import DebateState

from .fixtures import load_debate_state


def test_agent_thought_prompt_includes_persona_for_the_speaking_character():
    state = DebateState.model_validate(load_debate_state())

    prompt = _build_agent_thought_prompt(state, "Jobs")

    jobs_persona = next(c.persona for c in state.characters if c.name == "Jobs")
    assert jobs_persona in prompt
    # hook/body 構造化 + 80文字制約 + 反応ルール (T69 / D18)
    assert "hook" in prompt
    assert "body" in prompt
    assert "reasoning_target" in prompt
    assert "80文字" in prompt
    assert "問いかけ" in prompt
    # 経歴・専門領域に根ざした具体例を求める追補ルール (T69 follow-up)
    assert "専門領域に根ざした具体例" in prompt
    assert "それは" in prompt


def test_agent_thought_prompt_falls_back_when_persona_missing():
    state = DebateState.model_validate(load_debate_state())
    state.characters[0].persona = ""

    prompt = _build_agent_thought_prompt(state, state.characters[0].name)

    # persona 未設定でも口調を借りる文言が入る（自己紹介はしない）
    assert "口調" in prompt
    assert "自己紹介はしない" in prompt


def test_next_turn_prompt_includes_persona_listing_and_speech_rules():
    state = DebateState.model_validate(load_debate_state())

    prompt = _build_next_turn_prompt(state)

    for character in state.characters:
        if character.persona:
            assert character.persona in prompt
    assert "hook" in prompt
    assert "80文字" in prompt
