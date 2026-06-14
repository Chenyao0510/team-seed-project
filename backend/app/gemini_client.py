"""Gemini API

- generate_avatar_image: nano banana (画像生成モデル) でクロマキー背景のアバター画像を生成する
  (T52: 人物名 + 参照画像数枚をマルチモーダル入力として渡し、文字での外見説明は使わない)
- generate_next_turn / generate_reflection / generate_summary: 議論の State 遷移
  (responseSchema による JSON 強制出力)

CONSTRAINTS.md: API キーはここで一度だけ読み込み、コードへのハードコードはしない。
呼び出し元 (avatar_pipeline) は try/except でフォールバックする前提のため、
本モジュールは失敗時に例外を投げるだけでよい。
"""

import json
import time

from google import genai
from google.genai import types

from app.config import (
    CHAT_HISTORY_PROMPT_LIMIT,
    GEMINI_API_KEY,
    IMAGE_MODEL,
    IMAGE_TIMEOUT_SECONDS,
    NEXT_TURN_TIMEOUT_SECONDS,
    REFLECTION_TIMEOUT_SECONDS,
    SUMMARIZE_HISTORY_PROMPT_LIMIT,
    SUMMARIZE_TIMEOUT_SECONDS,
    TEXT_MODEL,
)
from app.models import (
    AgentThoughtOutput,
    DebateState,
    IntegrationState,
    NextTurnLLMOutput,
    ReflectionSummary,
)

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def generate_avatar_image(
    name: str,
    reference_images: list[tuple[bytes, str]] | None = None,
) -> bytes:
    """人物名 + 参照画像から、クロマキー背景のアバター画像 (PNG/JPEG bytes) を生成する。

    T52: 文字での外見説明は省略し、画像検索で取得した本人写真を複数枚渡して
    Gemini (nano banana) に「これらは同一人物の写真だから、これに似せて全身立ち絵を
    描いて」と指示する方が、文字描写を介するより別人化リスクが低い。
    参照画像が無いときは名前だけで生成する（モデルが知っている人物なら描ける）。
    """
    references = reference_images or []
    has_references = len(references) > 0

    if has_references:
        reference_clause = (
            f"添付した {len(references)} 枚の参照写真はすべて「{name}」という同一人物の写真です。"
            "これらを最優先の手がかりとし、顔立ち（目・鼻・口の配置、輪郭）、髪型、"
            "肌の色、年代感、雰囲気をそっくり再現した、本人と判別できる似顔絵にしてください。"
        )
    else:
        reference_clause = ""

    prompt = (
        f"「{name}」の体全体（全身）が描かれた立ち絵イラストを1枚生成してください。\n"
        f"{reference_clause}"
        f"頭の先が画像の上端から10%くらい、足先も下端から10%くらいで上下に余裕があるように配置すること。\n"
        f"等身はその人の年齢に応じた比率にすること。"
    )

    contents: list = [prompt]
    for image_bytes, mime_type in references:
        contents.append(types.Part.from_bytes(data=image_bytes, mime_type=mime_type))

    response = _get_client().models.generate_content(
        model=IMAGE_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"],
            http_options=types.HttpOptions(timeout=IMAGE_TIMEOUT_SECONDS * 1000),
        ),
    )

    for candidate in response.candidates or []:
        for part in candidate.content.parts or []:
            if part.inline_data and part.inline_data.data:
                return part.inline_data.data

    raise ValueError("Gemini image response did not contain inline image data")


def generate_agent_thought(state: DebateState, character_name: str) -> AgentThoughtOutput:
    """各キャラクターに対して個別に次のターンでの思考を構造化生成する。"""
    prompt = _build_agent_thought_prompt(state, character_name)

    max_retries = 2
    for attempt in range(max_retries + 1):
        try:
            response = _get_client().models.generate_content(
                model=TEXT_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=AgentThoughtOutput,
                    http_options=types.HttpOptions(timeout=NEXT_TURN_TIMEOUT_SECONDS * 1000),
                ),
            )
            text = (response.text or "").strip()
            if not text:
                raise ValueError("Gemini agent_thought response was empty")
            return AgentThoughtOutput.model_validate(json.loads(text))
        except Exception as e:
            if attempt < max_retries:
                time.sleep(1.0 * (attempt + 1))
            else:
                raise e


def generate_next_turn(state: DebateState) -> NextTurnLLMOutput:
    """現在の Debate State から、次のターン（話者・発言・論点）を構造化生成する。

    D04: responseSchema を指定し JSON を強制する。失敗時は呼び出し元 (app/debate.py)
    がローテーション・フォールバックするため、ここでは例外を投げるだけでよい。
    """
    prompt = _build_next_turn_prompt(state)
    response = _get_client().models.generate_content(
        model=TEXT_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=NextTurnLLMOutput,
            http_options=types.HttpOptions(timeout=NEXT_TURN_TIMEOUT_SECONDS * 1000),
        ),
    )
    text = (response.text or "").strip()
    if not text:
        raise ValueError("Gemini next_turn response was empty")
    return NextTurnLLMOutput.model_validate(json.loads(text))


def generate_reflection(state: DebateState) -> ReflectionSummary:
    """現在の Debate State から、Reflection Turn 用の構造化要約を生成する。

    D13: responseSchema を指定し JSON を強制する。失敗時は呼び出し元 (app/reflection.py)
    が決定論的フォールバックを使うため、ここでは例外を投げるだけでよい。
    """
    prompt = _build_reflection_prompt(state)
    response = _get_client().models.generate_content(
        model=TEXT_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ReflectionSummary,
            http_options=types.HttpOptions(timeout=REFLECTION_TIMEOUT_SECONDS * 1000),
        ),
    )
    text = (response.text or "").strip()
    if not text:
        raise ValueError("Gemini reflection response was empty")
    return ReflectionSummary.model_validate(json.loads(text))


def generate_summary(state: DebateState) -> IntegrationState:
    """Debate State の全履歴から、Screen 2 用の Integration State を構造化生成する。

    D04: responseSchema を指定し JSON を強制する。失敗時は呼び出し元
    (app/summarize.py) が決定的フォールバックする前提のため、ここでは
    例外を投げるだけでよい。
    """
    prompt = _build_summarize_prompt(state)
    response = _get_client().models.generate_content(
        model=TEXT_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=IntegrationState,
            http_options=types.HttpOptions(timeout=SUMMARIZE_TIMEOUT_SECONDS * 1000),
        ),
    )
    text = (response.text or "").strip()
    if not text:
        raise ValueError("Gemini summarize response was empty")
    return IntegrationState.model_validate(json.loads(text))


def _build_reflection_prompt(state: DebateState) -> str:
    roster = "、".join(c.name for c in state.characters)
    history_lines = [
        f"{m.speaker}: {m.text}" for m in state.chat_history[-CHAT_HISTORY_PROMPT_LIMIT:]
    ]
    history_text = "\n".join(history_lines) if history_lines else "(まだ発言はありません)"
    points_text = "、".join(state.current_points) if state.current_points else "(まだなし)"

    return (
        "あなたは討論番組の進行役（ファシリテーター）です。参加者(roster)には含まれず、"
        "議論には参加しません。これまでの討論を振り返るための、中立的な構造化要約を"
        "日本語で作成してください。\n\n"
        f"テーマ: {state.theme}\n"
        f"現在の論点: {state.current_topic}\n"
        f"登場人物（roster）: {roster}\n"
        f"これまでの発言ログ:\n{history_text}\n"
        f"現在の論点リスト: {points_text}\n\n"
        "出力ルール:\n"
        "- facilitator_comment は、ここまでの議論の流れを1〜2文で中立的にまとめたもの。"
        "「足りない視点」「追加すべき人物」など、今後の進行に関する提案や誘導は一切"
        "含めないこと。\n"
        "- blocks は現在の論点リストに対応する要約ブロックの配列。各ブロックは"
        " topic（論点）と stances（その論点に対する対立する立場の配列、通常2つ）を"
        "持つこと。\n"
        "- 各 stance は label（立場を表す5〜10文字程度の短いラベル）、"
        "summary（その立場の論理を15〜25文字程度の一言で端的に表したもの。"
        "対になる stance と対比した際にどう違うかが一目で分かるようにすること）、"
        "characters（その立場を取っている roster 内の人物名の配列）を持つこと。\n"
        f"- characters に含める名前は roster ({roster}) に含まれるものだけにすること。\n"
        "- blocks は最低1つは含めること。topic には現在の論点（または発言ログから読み取れる"
        "直近の話題）を使い、これまでの発言から各話者がどの立場を取っているかを推定して"
        "stances を構成すること。発言が少ない場合でも、発言内容から読み取れる範囲で"
        "推定してよい。"
    )


def _build_agent_thought_prompt(state: DebateState, character_name: str) -> str:
    roster = "、".join(c.name for c in state.characters)
    history_lines = [
        f"{m.speaker}: {m.text}" for m in state.chat_history[-CHAT_HISTORY_PROMPT_LIMIT:]
    ]
    history_text = "\n".join(history_lines) if history_lines else "(まだ発言はありません)"
    points_text = "、".join(state.current_points) if state.current_points else "(まだなし)"

    return (
        f"あなたは討論番組の参加者「{character_name}」です。\n"
        "以下の討論の状況をもとに、自分が今発言すべきか（発言したいか）を考え、"
        "もし発言するなら何を言うか出力してください。\n\n"
        f"テーマ: {state.theme}\n"
        f"現在の論点: {state.current_topic}\n"
        f"登場人物（roster）: {roster}\n"
        f"直前の発言者: {state.active_character}\n"
        f"これまでの発言ログ:\n{history_text}\n"
        f"現在の論点リスト: {points_text}\n\n"
        "ルール:\n"
        "- willingness_to_speak: 発言ログの文脈から、今あなたが発言すべきなら true、"
        "他の人に任せるべき・連続発言になる等の場合は false にすること。\n"
        "- thought: 今の議論の流れ、他者の意見、および自分の立場をどう捉えているか、"
        "なぜ発言する（あるいは控える）のかという思考プロセスを30〜50文字程度の日本語で。\n"
        "- 発言ログの末尾があなた自身である場合、特別な理由がない限り"
        "連続発言は避ける(false にする)こと。\n"
        "- 発言ログの末尾の発言者が roster に含まれない場合、それはユーザーからの介入"
        "（異議・観点・質問）です。あなたは「ユーザー（あなた）」の主張を自分自身のものと"
        "して扱わず、あくまで外部からの新しい視点に対する反応として述べてください。"
        "「私の〜という観点は」のように、ユーザーの意見を自分のものとして主張してはいけません。\n"
        "- current_speech: もし発言するなら、あなたの口調・立場・視点を反映した、"
        "1〜3文の日本語の発言。\n"
        "- current_points: 議論全体を通じた論点リスト（3〜5個の簡潔な名詞句）。\n"
        "  1ターンでの変更は最小限にすること:\n"
        "    * 追加は最大1個まで（今回の発言で新しく浮上した論点のみ）\n"
        "    * 削除/差し替えも最大1個まで（既に役割を終えた論点があれば差し替える）\n"
        "    * 変更しない論点は前ターンの文字列をそのまま再利用すること\n"
        "    * 順序も前ターンの並び順を尊重し、新規論点はリスト末尾に追加すること\n"
        "- current_topic: 現在議論されている小テーマを、名詞句を「/」で区切った"
        "10〜20文字程度の短い表現にすること。\n"
        "- emotion: 発言内容に合わせた表情を neutral, happy, sad, angry, "
        "surprised, thinking から選んでください。\n"
    )


def _build_next_turn_prompt(state: DebateState) -> str:
    roster = "、".join(c.name for c in state.characters)
    # 履歴行に emotion を含める。Gemini に「直近で使われた感情」を見せて
    # 同じ感情の連発を避けさせる手がかりにする。
    history_lines = [
        f"{m.speaker}[{m.emotion}]: {m.text}"
        for m in state.chat_history[-CHAT_HISTORY_PROMPT_LIMIT:]
    ]
    history_text = "\n".join(history_lines) if history_lines else "(まだ発言はありません)"
    points_text = "、".join(state.current_points) if state.current_points else "(まだなし)"
    recent_emotions = [m.emotion for m in state.chat_history[-3:] if m.emotion]
    recent_emotions_text = "、".join(recent_emotions) if recent_emotions else "(まだなし)"

    return (
        "あなたは討論番組の進行役です。以下の討論の状況をもとに、次に発言する人物を1人選び、"
        "その人物として日本語で発言し、感情の種類も指定してください。\n\n"
        f"テーマ: {state.theme}\n"
        f"現在の論点: {state.current_topic}\n"
        f"登場人物（roster）: {roster}\n"
        f"直前の発言者: {state.active_character}\n"
        f"これまでの発言ログ（[]内は当時の感情）:\n{history_text}\n"
        f"現在の論点リスト: {points_text}\n"
        f"直近3ターンの感情: {recent_emotions_text}\n\n"
        "ルール:\n"
        f"- active_character は roster ({roster}) の中から、直前の発言者"
        f"（{state.active_character}）とは別の人物を選ぶこと。\n"
        "- 発言ログの末尾の発言者が roster に含まれない場合、それはユーザーからの介入"
        "（異議・観点・質問）です。次の発言者はその介入に正面から反応すること。\n"
        "- current_speech は選んだ人物の口調・立場を反映した、1〜3文の日本語の発言。\n"
        "- emotion は以下の8種類から、発言内容の **感情の重心** に最も合うものを選ぶ:\n"
        '    * "confident": 自説を堂々と断定する／皮肉や勝ち誇り／反論を一蹴する\n'
        '    * "thinking": 問いを返す／前提を疑う／「では〜とはどういうことか」と熟考する\n'
        '    * "angry": 相手の意見を強く批判／本気で反対／義憤を露わにする\n'
        '    * "surprised": 相手の言葉に意表を突かれる／想定外の視点に気づく\n'
        '    * "happy": 賛意・同意・「いい指摘だ」と乗っかる／ユーモアを交える\n'
        '    * "sad": 失望・諦観・悲観的な見通し／「残念だが…」のトーン\n'
        '    * "confused": 自説に迷い／話の流れを掴みきれず戸惑う\n'
        '    * "neutral": 上のどれにも当てはまらない、淡々とした事実説明のみ\n'
        "- 感情選択の重要な追加ルール:\n"
        "    * 直近3ターンと同じ感情をそのまま繰り返さないこと。\n"
        "      議論はうねりを持って進むので、同じ感情が連続することは不自然。\n"
        "    * 「とりあえず confident」「とりあえず thinking」のデフォルト選択を避け、"
        "発言内容を読み返して合うものを選ぶこと。\n"
        "    * neutral は本当に感情が動いていないときだけ。迷ったら他の7種から選ぶ。\n"
        "- current_points は議論全体を通じた論点リスト（3〜5個の簡潔な名詞句）。\n"
        "  認知負荷を下げるため、1ターンでの変更は最小限にすること:\n"
        "    * 追加は最大1個まで（今回の発言で新しく浮上した論点のみ）\n"
        "    * 削除/差し替えも最大1個まで（既に役割を終えた論点があれば差し替える）\n"
        "    * 変更しない論点は前ターンの文字列をそのまま再利用すること"
        "（表記揺れは差分扱いになるので厳禁）\n"
        "    * 順序も前ターンの並び順を尊重し、新規論点はリスト末尾に追加すること\n"
        "- current_topic は現在議論されている小テーマを、名詞句を「/」で区切った"
        "10〜20文字程度の短い表現にすること（例:「無形価値の評価方法/成果への繋がり」）。"
        "文章や「〜について」「〜の評価」のような冗長な言い回しは避けること。"
    )


def _build_summarize_prompt(state: DebateState) -> str:
    roster_names = {c.name for c in state.characters}
    history_lines = [
        f"{m.speaker}: {m.text}" for m in state.chat_history[-SUMMARIZE_HISTORY_PROMPT_LIMIT:]
    ]
    history_text = "\n".join(history_lines) if history_lines else "(発言ログなし)"
    user_lines = [
        f"{m.speaker}: {m.text}" for m in state.chat_history if m.speaker not in roster_names
    ]
    user_text = "\n".join(user_lines) if user_lines else "(ユーザー介入なし)"
    points_text = "、".join(state.current_points) if state.current_points else "(なし)"

    return (
        "あなたは討論の構造を統合するエディターです。以下の討論ログを読み、"
        "「問いの進化（Before → After）」と「議論を構成する観点の構造マップ」を"
        "日本語で JSON にまとめてください。\n\n"
        f"テーマ: {state.theme}\n"
        f"最終的に扱われていた論点: {state.current_topic}\n"
        f"議論全体の論点リスト: {points_text}\n"
        f"発言ログ:\n{history_text}\n\n"
        f"このうちユーザーからの介入発言:\n{user_text}\n\n"
        "ルール:\n"
        "- central_concept: Screen 2 (Integration Map) の Bento UI 中心ノードに表示する"
        "短い名詞句。テーマの核となる単語1つ（最大12文字以内、句読点・疑問符・助詞を含めない）。\n"
        "  例: テーマが「大学は行くべきか？」なら `大学`、"
        "「ハッカソンは面白いのだろうか？」なら `ハッカソン`。\n"
        "- before_question: 議論開始時にユーザーが抱いていた素朴な問い"
        "（テーマを1文で問いの形にしたもの）。\n"
        "- after_question: 議論とユーザー介入を経て進化した、より構造的・本質的な問い（1文）。\n"
        "- structure_map: 議論で扱われた観点を 2〜4 個のカテゴリにまとめた配列。\n"
        "  各カテゴリは category_name（簡潔な名詞句）と elements"
        "（その観点を構成する要素を2〜4個の名詞句で）を持つ。\n"
        "  ユーザー介入により新しく加わった、または強調された要素があれば、そのカテゴリの"
        "  highlighted_element_index にそのインデックス（0始まり）を入れる。\n"
        "  介入が該当しないカテゴリでは省略可。\n"
        "- user_catalyst: ユーザー介入が議論にもたらした触媒となった視点を、"
        "簡潔な名詞句で1つ。\n"
        "  ユーザー介入が無かった場合は、議論で最も中心的だった視点を入れる。\n"
        "- connective_value_praise: ユーザーの介入が問いの構造に与えた影響を、"
        "ユーザーを称賛するトーンで1〜2文の日本語で。\n"
        "  「あなたの〇〇により、〜が〜へと拡張・統合されました」のような構文を推奨。\n"
        "  ユーザーの不安や劣等感を煽る表現（「浅い」「足りない」等）は禁止。"
    )
