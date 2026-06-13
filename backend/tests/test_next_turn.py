from fastapi.testclient import TestClient

from app import gemini_client
from app.models import NextTurnLLMOutput
from main import app
from tests.fixtures import load_debate_state

client = TestClient(app)


def test_next_turn_advances_turn(monkeypatch):
    state = load_debate_state()
    roster_names = {c["name"] for c in state["characters"]}

    fake_output = NextTurnLLMOutput(
        active_character="Jobs",
        current_speech="シンプルさこそが最高の洗練だ。大学のカリキュラムも削ぎ落とすべきだ。",
        current_points=["スキルの陳腐化速度", "偶発的な人脈形成", "シンプルさの価値"],
        current_topic="教育におけるシンプルさ",
    )
    monkeypatch.setattr(gemini_client, "generate_next_turn", lambda s: fake_output)

    response = client.post("/api/next_turn", json=state)

    assert response.status_code == 200
    body = response.json()

    assert body["theme"] == state["theme"]
    assert body["characters"] == state["characters"]
    assert body["status"] == "speaking"
    assert body["active_character"] == "Jobs"
    assert body["active_character"] in roster_names
    assert body["current_speech"] == fake_output.current_speech
    assert body["current_points"] == fake_output.current_points
    assert body["current_topic"] == fake_output.current_topic

    # 直前 (Socrates) の発言が chat_history に追記される
    assert len(body["chat_history"]) == len(state["chat_history"]) + 1
    archived = body["chat_history"][-1]
    assert archived["speaker"] == state["active_character"]
    assert archived["text"] == state["current_speech"]

    assert body["turn_count"] == state["turn_count"] + 1


def test_next_turn_falls_back_on_gemini_failure(monkeypatch):
    state = load_debate_state()
    roster_names = [c["name"] for c in state["characters"]]
    previous_speaker = state["active_character"]

    def _raise(*args, **kwargs):
        raise RuntimeError("gemini unavailable")

    monkeypatch.setattr(gemini_client, "generate_next_turn", _raise)

    response = client.post("/api/next_turn", json=state)

    assert response.status_code == 200
    body = response.json()

    assert body["status"] == "speaking"
    assert body["active_character"] in roster_names
    assert body["active_character"] != previous_speaker
    assert body["characters"] == state["characters"]
    assert len(body["chat_history"]) == len(state["chat_history"]) + 1
    assert body["turn_count"] == state["turn_count"] + 1


def test_next_turn_rejects_invalid_state():
    response = client.post("/api/next_turn", json={"theme": "テーマ"})

    assert response.status_code == 422


def test_next_turn_archives_user_intervention_with_user_avatar(monkeypatch):
    """T58: roster 外のユーザー介入発言は user.avatar_url で chat_history に追記される。"""
    state = load_debate_state()
    user = state["user"]
    # ユーザー介入: active_character を roster 外の user.name に、current_speech を介入文に。
    state["active_character"] = user["name"]
    state["current_speech"] = "（観点）コストの議論が抜けている。"

    fake_output = NextTurnLLMOutput(
        active_character="Jobs",
        current_speech="なるほど、コストの観点は重要だ。",
        current_points=state["current_points"],
        current_topic=state["current_topic"],
    )
    monkeypatch.setattr(gemini_client, "generate_next_turn", lambda s: fake_output)

    response = client.post("/api/next_turn", json=state)

    assert response.status_code == 200
    body = response.json()

    archived = body["chat_history"][-1]
    assert archived["speaker"] == user["name"]
    assert archived["text"] == state["current_speech"]
    assert archived["avatar_url"] == user["avatar_url"]
    # user 情報は次ターンへ持ち越される
    assert body["user"] == user


def test_next_turn_defaults_user_when_omitted(monkeypatch):
    """後方互換: user を省略した State でも 200 を返し、既定の user が補完される。"""
    state = load_debate_state()
    state.pop("user", None)

    fake_output = NextTurnLLMOutput(
        active_character="Jobs",
        current_speech="続けよう。",
        current_points=state["current_points"],
        current_topic=state["current_topic"],
    )
    monkeypatch.setattr(gemini_client, "generate_next_turn", lambda s: fake_output)

    response = client.post("/api/next_turn", json=state)

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["name"] == "あなた"
    assert body["user"]["avatar_url"] == ""
