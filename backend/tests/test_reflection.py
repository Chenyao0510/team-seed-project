from fastapi.testclient import TestClient

from app import gemini_client
from app.models import ReflectionBlock, ReflectionStance, ReflectionSummary
from main import app
from tests.fixtures import load_debate_state

client = TestClient(app)


def test_reflection_returns_structured_summary(monkeypatch):
    state = load_debate_state()
    roster_names = {c["name"] for c in state["characters"]}

    fake_summary = ReflectionSummary(
        facilitator_comment="ここまでの議論は2つの立場に分かれています。",
        blocks=[
            ReflectionBlock(
                topic=state["current_topic"],
                stances=[
                    ReflectionStance(
                        label="制度懐疑的",
                        summary="大学という制度自体に疑問を投げかける立場。",
                        characters=["Jobs"],
                    ),
                    ReflectionStance(
                        label="対話重視",
                        summary="出会いの場としての価値を重視する立場。",
                        characters=["Socrates"],
                    ),
                ],
            )
        ],
    )
    monkeypatch.setattr(gemini_client, "generate_reflection", lambda s: fake_summary)

    response = client.post("/api/reflection", json=state)

    assert response.status_code == 200
    body = response.json()

    assert body["facilitator_comment"] == fake_summary.facilitator_comment
    assert len(body["blocks"]) == 1
    block = body["blocks"][0]
    assert block["topic"] == state["current_topic"]
    assert len(block["stances"]) == 2
    for stance in block["stances"]:
        assert set(stance["characters"]) <= roster_names


def test_reflection_filters_out_of_roster_characters(monkeypatch):
    state = load_debate_state()
    roster_names = {c["name"] for c in state["characters"]}

    fake_summary = ReflectionSummary(
        facilitator_comment="要約コメント。",
        blocks=[
            ReflectionBlock(
                topic=state["current_topic"],
                stances=[
                    ReflectionStance(
                        label="存在しない人物を含む立場",
                        summary="roster 外の人物が混在している。",
                        characters=["Jobs", "存在しない人物"],
                    ),
                ],
            )
        ],
    )
    monkeypatch.setattr(gemini_client, "generate_reflection", lambda s: fake_summary)

    response = client.post("/api/reflection", json=state)

    assert response.status_code == 200
    body = response.json()

    characters = body["blocks"][0]["stances"][0]["characters"]
    assert characters == ["Jobs"]
    assert set(characters) <= roster_names


def test_reflection_falls_back_on_gemini_failure(monkeypatch):
    state = load_debate_state()

    def _raise(*args, **kwargs):
        raise RuntimeError("gemini unavailable")

    monkeypatch.setattr(gemini_client, "generate_reflection", _raise)

    response = client.post("/api/reflection", json=state)

    assert response.status_code == 200
    body = response.json()

    assert body["facilitator_comment"]
    assert body["blocks"] == []


def test_reflection_rejects_invalid_state():
    response = client.post("/api/reflection", json={"theme": "テーマ"})

    assert response.status_code == 422
