"""`/api/reflection` のオーケストレーション (T26 残作業 / D13)。

Debate State を受け取り、Reflection Turn 用の構造化要約 (ReflectionSummary) を
生成して返す。Debate State 自体は変更しない。Gemini 呼び出しが失敗、または
roster 外の人物名しか返らない場合は決定論的フォールバックを使う
（D09/D10/D11 のフェイルセーフ方針を継承）。
"""

from app import gemini_client
from app.models import DebateState, ReflectionBlock, ReflectionSummary

_FALLBACK_FACILITATOR_COMMENT = (
    "ここまでの議論を振り返ります。論点一覧と参加者を確認し、"
    "続けるか視点を加えるかを選んでください。"
)


def build_reflection(state: DebateState) -> ReflectionSummary:
    """現在の Debate State から Reflection Summary を構築する。"""
    roster_names = {c.name for c in state.characters}

    try:
        summary = gemini_client.generate_reflection(state)
        blocks = [_filter_block(block, roster_names) for block in summary.blocks]
        blocks = [block for block in blocks if block.stances]
        return ReflectionSummary(
            facilitator_comment=summary.facilitator_comment,
            blocks=blocks,
        )
    except Exception:
        return ReflectionSummary(
            facilitator_comment=_FALLBACK_FACILITATOR_COMMENT,
            blocks=[],
        )


def _filter_block(block: ReflectionBlock, roster_names: set[str]) -> ReflectionBlock:
    """stances[].characters を roster 名の部分集合に絞り込む。"""
    filtered_stances = []
    for stance in block.stances:
        characters = [name for name in stance.characters if name in roster_names]
        filtered_stances.append(stance.model_copy(update={"characters": characters}))
    return block.model_copy(update={"stances": filtered_stances})
