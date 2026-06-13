from fastapi.testclient import TestClient

from app import gemini_client
from app.models import IntegrationState, StructureCategory
from main import app
from tests.fixtures import load_debate_state

client = TestClient(app)


def _stub_integration() -> IntegrationState:
    return IntegrationState(
        before_question="大学は行くべきか？",
        after_question="知識と人脈のどちらにコストをかけるべきか？",
        structure_map=[
            StructureCategory(
                category_name="知識・スキル",
                elements=["専門性の獲得", "課題解決へのアプローチ"],
            ),
            StructureCategory(
                category_name="資本・ネットワーク",
                elements=["人脈形成", "地方学生のハブ"],
                highlighted_element_index=1,
            ),
        ],
        user_catalyst="地方格差の視点",
        connective_value_praise=(
            "あなたの「地方格差の視点」により、個人の損得が社会構造の問いへと拡張・統合されました。"
        ),
    )


def test_summarize_returns_integration_state(monkeypatch):
    state = load_debate_state()
    expected = _stub_integration()
    monkeypatch.setattr(gemini_client, "generate_summary", lambda s: expected)

    response = client.post("/api/summarize", json=state)

    assert response.status_code == 200
    body = response.json()

    assert body["before_question"] == expected.before_question
    assert body["after_question"] == expected.after_question
    assert body["user_catalyst"] == expected.user_catalyst
    assert body["connective_value_praise"] == expected.connective_value_praise
    assert len(body["structure_map"]) == len(expected.structure_map)
    assert body["structure_map"][0]["category_name"] == "知識・スキル"
    assert body["structure_map"][1]["highlighted_element_index"] == 1


def test_summarize_falls_back_on_gemini_failure(monkeypatch):
    state = load_debate_state()

    def _raise(*_args, **_kwargs):
        raise RuntimeError("gemini unavailable")

    monkeypatch.setattr(gemini_client, "generate_summary", _raise)

    response = client.post("/api/summarize", json=state)

    assert response.status_code == 200
    body = response.json()

    # 必須フィールドが揃っており、Bento UI を破綻させない
    assert isinstance(body["before_question"], str) and body["before_question"]
    assert isinstance(body["after_question"], str) and body["after_question"]
    assert isinstance(body["structure_map"], list) and len(body["structure_map"]) >= 1
    assert all(
        isinstance(cat["elements"], list) and len(cat["elements"]) >= 1
        for cat in body["structure_map"]
    )
    # ユーザー介入が無いサンプルなので、フォールバック文言が入る
    assert isinstance(body["user_catalyst"], str) and body["user_catalyst"]
    assert isinstance(body["connective_value_praise"], str)
    assert body["connective_value_praise"]


def test_summarize_fallback_picks_user_intervention(monkeypatch):
    state = load_debate_state()
    # roster 外発言（=ユーザー介入）を chat_history に追加
    state["chat_history"].append(
        {
            "speaker": "あなた",
            "text": "（観点）地方格差はどう影響する？",
            "avatar_url": "",
        }
    )

    def _raise(*_args, **_kwargs):
        raise RuntimeError("gemini unavailable")

    monkeypatch.setattr(gemini_client, "generate_summary", _raise)

    response = client.post("/api/summarize", json=state)

    assert response.status_code == 200
    body = response.json()
    assert "地方格差" in body["user_catalyst"]
    # 介入があるときはハイライト index が付く
    assert body["structure_map"][0]["highlighted_element_index"] is not None


def test_summarize_rejects_invalid_state():
    response = client.post("/api/summarize", json={"theme": "テーマ"})

    assert response.status_code == 422
