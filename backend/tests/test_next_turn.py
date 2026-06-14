from fastapi.testclient import TestClient

from app import gemini_client
from app.models import AgentThoughtOutput
from main import app
from tests.fixtures import load_debate_state

client = TestClient(app)


def test_next_turn_advances_turn(monkeypatch):
    state = load_debate_state()
    roster_names = {c["name"] for c in state["characters"]}

    def mock_generate_agent_thought(s, name):
        if name == "Jobs":
            return AgentThoughtOutput(
                willingness_to_speak=True,
                thought="思考プロセス：シンプルさが重要",
                current_speech="シンプルさこそが最高の洗練だ。大学のカリキュラムも削ぎ落とすべきだ。",
                current_points=["スキルの陳腐化速度", "偶発的な人脈形成", "シンプルさの価値"],
                current_topic="教育におけるシンプルさ",
            )
        else:
            return AgentThoughtOutput(
                willingness_to_speak=False,
                thought="思考プロセス：見守り",
                current_speech="私は見守るよ",
                current_points=s.current_points,
                current_topic=s.current_topic,
            )

    monkeypatch.setattr(gemini_client, "generate_agent_thought", mock_generate_agent_thought)

    response = client.post("/api/next_turn", json=state)

    assert response.status_code == 200
    body = response.json()

    assert body["theme"] == state["theme"]
    assert body["characters"] == state["characters"]
    assert body["status"] == "speaking"
    assert body["active_character"] == "Jobs"
    assert body["active_character"] in roster_names
    assert body["current_speech"] == (
        "シンプルさこそが最高の洗練だ。大学のカリキュラムも削ぎ落とすべきだ。"
    )
    assert body["current_points"] == ["スキルの陳腐化速度", "偶発的な人脈形成", "シンプルさの価値"]
    assert body["current_topic"] == "教育におけるシンプルさ"

    # 直前 (Socrates) の発言が chat_history に追記される
    assert len(body["chat_history"]) == len(state["chat_history"]) + 1
    archived = body["chat_history"][-1]
    assert archived["speaker"] == state["active_character"]
    assert archived["text"] == state["current_speech"]

    assert body["turn_count"] == state["turn_count"] + 1
    # agent_thoughts が含まれていること
    assert "Jobs" in body["agent_thoughts"]


def test_think_generates_candidates(monkeypatch):
    """T63: /api/think は全員に思考させ、willingness を詰めて status=thinking で返す。"""
    state = load_debate_state()

    def mock_generate_agent_thought(s, name):
        return AgentThoughtOutput(
            willingness_to_speak=(name == "Jobs"),
            thought=f"{name}の思考",
            current_speech=f"{name}の発言",
            current_points=s.current_points,
            current_topic=s.current_topic,
        )

    monkeypatch.setattr(gemini_client, "generate_agent_thought", mock_generate_agent_thought)

    response = client.post("/api/think", json=state)

    assert response.status_code == 200
    body = response.json()

    assert body["status"] == "thinking"
    assert len(body["agent_thoughts"]) == len(state["characters"])
    assert body["agent_thoughts"]["Jobs"]["willingness_to_speak"] is True
    # think では turn_count は増えない
    assert body["turn_count"] == state["turn_count"]
    # 直前の発言は既に chat_history に入っている
    assert len(body["chat_history"]) == len(state["chat_history"]) + 1


def test_next_turn_uses_precomputed_thoughts(monkeypatch):
    """T63: /api/next_turn は既に agent_thoughts があればそれを使って勝者を決める。"""
    state = load_debate_state()
    # 先に think を呼んで状態を作る
    state["chat_history"].append({
        "speaker": state["active_character"],
        "text": state["current_speech"],
        "avatar_url": ""
    })
    state["status"] = "thinking"
    state["agent_thoughts"] = {
        "Jobs": {
            "willingness_to_speak": True,
            "thought": "ジョブズの思考",
            "current_speech": "ジョブズの発言",
            "current_points": state["current_points"],
            "current_topic": state["current_topic"],
        },
        "Socrates": {
            "willingness_to_speak": False,
            "thought": "ソクラテスの思考",
            "current_speech": "ソクラテスの発言",
            "current_points": state["current_points"],
            "current_topic": state["current_topic"],
        }
    }

    # gemini_client は呼ばれないはず（thoughts が既にあるため）
    def _fail(*args, **kwargs):
        raise RuntimeError("Should not be called")
    monkeypatch.setattr(gemini_client, "generate_agent_thought", _fail)

    response = client.post("/api/next_turn", json=state)
    assert response.status_code == 200
    body = response.json()

    assert body["active_character"] == "Jobs"
    assert body["current_speech"] == "ジョブズの発言"
    assert body["status"] == "speaking"
    assert body["turn_count"] == state["turn_count"] + 1


def test_next_turn_falls_back_on_gemini_failure(monkeypatch):
    state = load_debate_state()
    roster_names = [c["name"] for c in state["characters"]]
    previous_speaker = state["active_character"]

    def _raise(*args, **kwargs):
        raise RuntimeError("gemini unavailable")

    monkeypatch.setattr(gemini_client, "generate_agent_thought", _raise)

    response = client.post("/api/next_turn", json=state)

    assert response.status_code == 200
    body = response.json()

    assert body["status"] == "speaking"
    assert body["active_character"] in roster_names
    assert body["active_character"] != previous_speaker
    assert body["characters"] == state["characters"]
    assert len(body["chat_history"]) == len(state["chat_history"]) + 1
    assert body["turn_count"] == state["turn_count"] + 1


def test_next_turn_propagates_emotion_from_llm_output(monkeypatch):
    """LLM が返した emotion を新 State と chat_history (前ターン分) に伝播する。"""
    state = load_debate_state()

    def mock_generate_agent_thought(s, name):
        if name == "Jobs":
            return AgentThoughtOutput(
                willingness_to_speak=True,
                thought="思考",
                current_speech="やってみればわかる。",
                current_points=s.current_points,
                current_topic=s.current_topic,
                emotion="confident",
            )
        return AgentThoughtOutput(
            willingness_to_speak=False,
            thought="見守り",
            current_speech="",
            current_points=s.current_points,
            current_topic=s.current_topic,
            emotion="neutral",
        )

    monkeypatch.setattr(
        gemini_client, "generate_agent_thought", mock_generate_agent_thought
    )

    response = client.post("/api/next_turn", json=state)
    assert response.status_code == 200
    body = response.json()

    # 今ターンの emotion が State に乗っていること
    assert body["emotion"] == "confident"
    # 1 つ前のターン (state.active_character の発言) が chat_history に追記され、
    # その emotion フィールドも前 State の emotion になっていること
    archived = body["chat_history"][-1]
    assert archived["emotion"] == state["emotion"]


def test_next_turn_falls_back_to_neutral_emotion_on_failure(monkeypatch):
    state = load_debate_state()

    def _raise(*args, **kwargs):
        raise RuntimeError("gemini unavailable")

    monkeypatch.setattr(gemini_client, "generate_agent_thought", _raise)
    response = client.post("/api/next_turn", json=state)
    assert response.status_code == 200
    assert response.json()["emotion"] == "neutral"


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

    def mock_generate_agent_thought(s, name):
        return AgentThoughtOutput(
            willingness_to_speak=(name == "Jobs"),
            thought="思考プロセス",
            current_speech="発言",
            current_points=s.current_points,
            current_topic=s.current_topic,
        )

    monkeypatch.setattr(gemini_client, "generate_agent_thought", mock_generate_agent_thought)

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

    def mock_generate_agent_thought(s, name):
        return AgentThoughtOutput(
            willingness_to_speak=(name == "Jobs"),
            thought="思考プロセス",
            current_speech="続けよう。",
            current_points=s.current_points,
            current_topic=s.current_topic,
        )

    monkeypatch.setattr(gemini_client, "generate_agent_thought", mock_generate_agent_thought)

    response = client.post("/api/next_turn", json=state)

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["name"] == "あなた"
    assert body["user"]["avatar_url"] == ""
