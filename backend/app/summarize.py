"""`/api/summarize` のオーケストレーション (T31)。

Debate State の全履歴を Gemini に渡して Integration State を構造化生成する (D04)。
失敗時は debate state から決定的にフォールバック Integration State を構築し、
UI が壊れないようにする (D09/D11 のフェイルセーフ方針を継承)。
"""

from app import gemini_client
from app.models import DebateState, IntegrationState, StructureCategory

FALLBACK_CATEGORY_NAME = "議論で扱われた観点"
FALLBACK_BEFORE_PREFIX = "そもそも"
FALLBACK_AFTER_TEMPLATE = (
    "{theme}を「{topic}」という観点から問い直すと、どのような構造が見えるか？"
)
FALLBACK_PRAISE_WITH_USER = (
    "あなたの「{catalyst}」という介入により、議論が単なる賛否ではなく"
    "構造的な問いへと拡張・統合されました。"
)
FALLBACK_PRAISE_WITHOUT_USER = (
    "議論を最後まで観察し続けた姿勢が、テーマの問いを構造的に立て直す土台となりました。"
)


def build_integration(state: DebateState) -> IntegrationState:
    """Debate State から Integration State を生成して返す。"""
    try:
        return gemini_client.generate_summary(state)
    except Exception:
        return _fallback_integration(state)


def _fallback_integration(state: DebateState) -> IntegrationState:
    """Gemini 失敗時の決定的な Integration State。

    chat_history から roster 外の発言（=ユーザー介入）を user_catalyst として拾い、
    current_points を1カテゴリの elements にして最低限の構造マップを返す。
    """
    roster_names = {c.name for c in state.characters}
    user_messages = [m for m in state.chat_history if m.speaker not in roster_names]
    user_catalyst = user_messages[-1].text if user_messages else state.current_topic

    elements = state.current_points or [state.current_topic] or ["観点未抽出"]
    highlighted_index: int | None = len(elements) - 1 if user_messages else None

    praise = (
        FALLBACK_PRAISE_WITH_USER.format(catalyst=user_catalyst)
        if user_messages
        else FALLBACK_PRAISE_WITHOUT_USER
    )

    return IntegrationState(
        before_question=f"{FALLBACK_BEFORE_PREFIX}{state.theme}",
        after_question=FALLBACK_AFTER_TEMPLATE.format(
            theme=state.theme, topic=state.current_topic
        ),
        structure_map=[
            StructureCategory(
                category_name=FALLBACK_CATEGORY_NAME,
                elements=list(elements),
                highlighted_element_index=highlighted_index,
            )
        ],
        user_catalyst=user_catalyst,
        connective_value_praise=praise,
    )
