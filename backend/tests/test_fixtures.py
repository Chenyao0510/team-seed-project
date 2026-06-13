from tests.fixtures import load_debate_state, load_integration_state


def test_debate_state_sample_has_required_fields():
    state = load_debate_state()
    required = {
        "theme",
        "current_topic",
        "active_character",
        "status",
        "current_speech",
        "current_points",
        "chat_history",
    }
    assert required.issubset(state.keys())
    assert isinstance(state["current_points"], list)
    assert isinstance(state["chat_history"], list)


def test_integration_state_sample_has_required_fields():
    state = load_integration_state()
    required = {
        "before_question",
        "after_question",
        "structure_map",
        "user_catalyst",
        "connective_value_praise",
    }
    assert required.issubset(state.keys())
    assert isinstance(state["structure_map"], list)
    assert all("category_name" in cat and "elements" in cat for cat in state["structure_map"])
