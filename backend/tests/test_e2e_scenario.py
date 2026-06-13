"""T41: Screen 0 -> 1 -> 2 のエンドツーエンドシナリオテスト。

アバター生成 (`/api/add_character`) -> 討論ループ (`/api/next_turn`) ->
Reflection (`/api/reflection`) -> ユーザー介入の注入 -> 統合レポート
(`/api/summarize`) まで、各ステップのレスポンスをそのまま次のリクエストに渡して
連結する。実 Gemini API キーは不要（既存テストと同様に monkeypatch でスタブ化）。

各ステップのレスポンスを対応する pydantic モデルで再パースし、フロントの
`DebateState` / `ReflectionSummary` / `IntegrationState`（D01/D13）と同一スキーマで
「破綻しない」ことを表明する。
"""

import cv2
import numpy as np
from fastapi.testclient import TestClient

from app import avatar_pipeline, gemini_client
from app.config import CHROMA_KEY_BGR
from app.models import (
    DebateState,
    IntegrationState,
    NextTurnLLMOutput,
    ReflectionBlock,
    ReflectionStance,
    ReflectionSummary,
    StructureCategory,
)
from main import app

client = TestClient(app)

_SIZE = 32


def _fake_chroma_image_bytes() -> bytes:
    image = np.zeros((_SIZE, _SIZE, 3), dtype=np.uint8)
    image[:, :] = CHROMA_KEY_BGR
    image[8:24, 8:24] = (0, 0, 255)
    success, encoded = cv2.imencode(".png", image)
    assert success
    return bytes(encoded)


def test_full_scenario_state_survives_screen0_to_screen2(monkeypatch, tmp_path):
    roster_names = ["Jobs", "Socrates"]

    # --- Screen 0: アバター生成パイプライン (T12) ---
    monkeypatch.setattr(avatar_pipeline, "AVATARS_DIR", tmp_path)
    monkeypatch.setattr(gemini_client, "describe_appearance", lambda name: f"{name}の外見")
    monkeypatch.setattr(
        gemini_client, "generate_avatar_image", lambda description: _fake_chroma_image_bytes()
    )

    characters = []
    for name in roster_names:
        response = client.post("/api/add_character", json={"name": name})
        assert response.status_code == 200
        avatar_url = response.json()["avatar_url"]
        assert avatar_url
        characters.append({"name": name, "avatar_url": avatar_url})

    # --- Screen 0 -> 1: buildInitialDebateState 相当の初期 State ---
    debate_state = {
        "theme": "大学は必要か？",
        "current_topic": "",
        "active_character": "",
        "status": "waiting",
        "current_speech": "",
        "current_points": [],
        "characters": characters,
        "chat_history": [],
        "turn_count": 0,
    }

    # --- Screen 1: 討論ループ (T24/T27) ---
    def fake_next_turn(state: DebateState) -> NextTurnLLMOutput:
        names = [c.name for c in state.characters]
        if state.active_character in names:
            current_index = names.index(state.active_character)
        else:
            current_index = -1
        next_character = names[(current_index + 1) % len(names)]
        return NextTurnLLMOutput(
            active_character=next_character,
            current_speech=f"ターン{state.turn_count + 1}の発言です。",
            current_points=[*state.current_points, f"論点{state.turn_count + 1}"][-3:],
            current_topic=f"論点フォーカス{state.turn_count + 1}",
        )

    monkeypatch.setattr(gemini_client, "generate_next_turn", fake_next_turn)

    for expected_turn in range(1, 4):
        previous_chat_history_len = len(debate_state["chat_history"])

        response = client.post("/api/next_turn", json=debate_state)
        assert response.status_code == 200
        body = response.json()
        validated = DebateState.model_validate(body)

        assert validated.theme == debate_state["theme"]
        assert validated.turn_count == expected_turn
        assert validated.status == "speaking"
        assert validated.active_character in roster_names
        assert [c.model_dump() for c in validated.characters] == characters
        assert len(validated.chat_history) >= previous_chat_history_len

        debate_state = body

    assert debate_state["turn_count"] == 3

    # --- Screen 1: Reflection (T26 残作業 / D13) ---
    fake_reflection = ReflectionSummary(
        facilitator_comment="ここまでの議論を振り返ります。",
        blocks=[
            ReflectionBlock(
                topic=debate_state["current_topic"],
                stances=[
                    ReflectionStance(
                        label="懐疑派", summary="制度を疑う立場。", characters=["Jobs"]
                    ),
                    ReflectionStance(
                        label="対話派",
                        summary="出会いを重視する立場。",
                        characters=["Socrates"],
                    ),
                ],
            )
        ],
    )
    monkeypatch.setattr(gemini_client, "generate_reflection", lambda s: fake_reflection)

    response = client.post("/api/reflection", json=debate_state)
    assert response.status_code == 200
    reflection_body = response.json()
    ReflectionSummary.model_validate(reflection_body)

    for block in reflection_body["blocks"]:
        for stance in block["stances"]:
            assert set(stance["characters"]) <= set(roster_names)

    # --- ユーザー介入の注入 (T23 のフロント挙動を模倣) ---
    debate_state["chat_history"].append(
        {
            "speaker": "あなた",
            "text": "（観点）地方格差の視点をどう考えるべきか？",
            "avatar_url": "",
        }
    )

    # --- Screen 2: 統合レポート (T31) ---
    fake_integration = IntegrationState(
        central_concept="大学",
        before_question="そもそも大学は必要か？",
        after_question="知識と人脈のどちらにコストをかけるべきか？",
        structure_map=[
            StructureCategory(
                category_name="議論で扱われた観点",
                elements=debate_state["current_points"],
                highlighted_element_index=0,
            ),
        ],
        user_catalyst="地方格差の視点",
        connective_value_praise="あなたの介入により、議論が構造的な問いへと拡張されました。",
    )
    monkeypatch.setattr(gemini_client, "generate_summary", lambda s: fake_integration)

    response = client.post("/api/summarize", json=debate_state)
    assert response.status_code == 200
    integration_body = response.json()
    IntegrationState.model_validate(integration_body)
    assert integration_body["structure_map"]

    # --- Screen 2: Gemini 失敗時のフォールバックでもユーザー介入が反映される ---
    def _raise(*_args, **_kwargs):
        raise RuntimeError("gemini unavailable")

    monkeypatch.setattr(gemini_client, "generate_summary", _raise)

    response = client.post("/api/summarize", json=debate_state)
    assert response.status_code == 200
    fallback_body = response.json()
    IntegrationState.model_validate(fallback_body)
    assert "地方格差" in fallback_body["user_catalyst"]
    assert fallback_body["structure_map"][0]["highlighted_element_index"] is not None
