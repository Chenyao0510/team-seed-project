"""Shared fixture loaders.

Canonical State JSON lives at /fixtures at the repo root and is also used by the
frontend mocks. Keep them in sync — schema is defined in DECISIONS.md D01.
"""

import json
from pathlib import Path

_FIXTURES_DIR = Path(__file__).resolve().parents[3] / "fixtures"


def load_debate_state() -> dict:
    return json.loads(
        (_FIXTURES_DIR / "debate_state_sample.json").read_text(encoding="utf-8")
    )


def load_integration_state() -> dict:
    return json.loads(
        (_FIXTURES_DIR / "integration_state_sample.json").read_text(encoding="utf-8")
    )


def load_reflection_summary() -> dict:
    return json.loads(
        (_FIXTURES_DIR / "reflection_summary_sample.json").read_text(encoding="utf-8")
    )
