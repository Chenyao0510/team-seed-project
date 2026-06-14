"""`gemini_client.classify_gender` のフォールバック挙動 (T69 / D17)。

実 Gemini を叩かないよう `_get_client` をモックし、エラー時に `male` フォールバックが
返ることだけを保証する。Gemini が JSON 形式で正常に返した場合のハッピーパスは
モックレスポンスでカバーする。
"""

import json

from app import gemini_client


class _FakeResponse:
    def __init__(self, text: str):
        self.text = text


class _FakeModels:
    def __init__(self, payload: str | Exception):
        self._payload = payload

    def generate_content(self, **_kwargs):
        if isinstance(self._payload, Exception):
            raise self._payload
        return _FakeResponse(self._payload)


class _FakeClient:
    def __init__(self, payload):
        self.models = _FakeModels(payload)


def test_classify_gender_returns_male_for_male_response(monkeypatch):
    payload = json.dumps({"gender": "male"})
    monkeypatch.setattr(gemini_client, "_get_client", lambda: _FakeClient(payload))
    assert gemini_client.classify_gender("オバマ") == "male"


def test_classify_gender_returns_female_for_female_response(monkeypatch):
    payload = json.dumps({"gender": "female"})
    monkeypatch.setattr(gemini_client, "_get_client", lambda: _FakeClient(payload))
    assert gemini_client.classify_gender("マリ・キュリー") == "female"


def test_classify_gender_returns_robot_for_robot_response(monkeypatch):
    payload = json.dumps({"gender": "robot"})
    monkeypatch.setattr(gemini_client, "_get_client", lambda: _FakeClient(payload))
    assert gemini_client.classify_gender("ドラえもん") == "robot"


def test_classify_gender_falls_back_to_male_on_exception(monkeypatch):
    monkeypatch.setattr(
        gemini_client,
        "_get_client",
        lambda: _FakeClient(RuntimeError("gemini unavailable")),
    )
    assert gemini_client.classify_gender("謎の人物") == "male"


def test_classify_gender_falls_back_to_male_on_empty_response(monkeypatch):
    monkeypatch.setattr(gemini_client, "_get_client", lambda: _FakeClient(""))
    assert gemini_client.classify_gender("謎の人物") == "male"


def test_classify_gender_falls_back_to_male_on_invalid_payload(monkeypatch):
    monkeypatch.setattr(
        gemini_client, "_get_client", lambda: _FakeClient("not-json")
    )
    assert gemini_client.classify_gender("謎の人物") == "male"
