"""事前生成キャラクターテンプレート (T5A / D16)。

SetupScreen から 1 クリックで初期メンバーに追加するための、事前生成済みアバターの
カタログ。PNG は `backend/scripts/seed_templates.py` でワンショット生成して
`backend/static/templates/<slug>.png` にコミット済み。実行時は PNG の存在を
都度確認し、欠落しているテンプレートは API レスポンスから除外する（UI を壊さない）。
"""

from pydantic import BaseModel

from app.config import PUBLIC_BASE_URL, TEMPLATES_DIR, TEMPLATES_URL_PREFIX
from app.models import Gender


class CharacterTemplate(BaseModel):
    """SetupScreen が描画する 1 件のテンプレート。"""

    slug: str
    name: str
    avatar_url: str
    # T69 / D17: TTS 話者プール選択用。テンプレは静的なので AI 判定を回さず
    # カタログにハードコードする（実在の歴史的人物のみなのでブレない）。
    gender: Gender
    # T72 / D18: 発言生成プロンプト用ペルソナ。
    persona: str = ""


# (slug, display_name, gender, persona) の静的リスト。時代・分野・地域を分散させる。
# persona は発言生成プロンプト (T72/D18) に注入する、人物像・口調・専門・価値観の短文。
_TEMPLATE_CATALOG: tuple[tuple[str, str, Gender, str], ...] = (
    (
        "obama",
        "バラク・オバマ",
        "male",
        "元米国大統領。対立する立場の橋渡しを得意とする一方、信念は譲らず落ち着いた"
        "説得力のある口調で語る。",
    ),
    (
        "elon",
        "イーロン・マスク",
        "male",
        "起業家・エンジニア。既存の前提を物理法則レベルから疑い、効率と速度を重視する"
        "ぶっきらぼうで断定的な口調で話す。",
    ),
    (
        "socrates",
        "ソクラテス",
        "male",
        "古代ギリシアの哲学者。問答法で相手の前提を一つずつ崩し、断定よりも鋭い問い返しで"
        "本質に迫る。",
    ),
    (
        "einstein",
        "アインシュタイン",
        "male",
        "理論物理学者。直感と思考実験を重視し、複雑な物事をシンプルな比喩で語る"
        "穏やかだが核心を突く口調。",
    ),
    (
        "curie",
        "マリ・キュリー",
        "female",
        "物理学者・化学者。地道な実験と検証を重んじ、感情に流されず事実と根拠に基づいて"
        "淡々と、しかし確信を持って語る。",
    ),
    (
        "ryoma",
        "坂本龍馬",
        "male",
        "幕末の志士。古い枠組みにこだわらず、新しい仕組みづくりを語る豪快でくだけた口調。",
    ),
    (
        "jobs",
        "スティーブ・ジョブズ",
        "male",
        "完璧主義のプロダクトデザイナー。妥協を許さず、シンプルさと直感的な体験を"
        "最優先する断定的な口調で話す。",
    ),
    (
        "gandhi",
        "ガンジー",
        "male",
        "インド独立運動の指導者。非暴力と自己犠牲を信条とし、静かながら揺るがない"
        "信念で語る。",
    ),
)


def _avatar_url(slug: str, path) -> str:
    # ファイルの mtime をクエリ文字列で付与してブラウザキャッシュを失効させる。
    # seed_templates 再実行で PNG が更新されたら mtime が変わり、URL が新しくなる。
    version = int(path.stat().st_mtime)
    return f"{PUBLIC_BASE_URL}{TEMPLATES_URL_PREFIX}/{slug}.png?v={version}"


def list_available_templates() -> list[CharacterTemplate]:
    """PNG が存在するテンプレートのみを返す。

    PNG が無い slug はスキップする（seed 未実行 / 誤削除 / 部分生成 のいずれでも
    UI を壊さないため）。
    """
    result: list[CharacterTemplate] = []
    for slug, name, gender, persona in _TEMPLATE_CATALOG:
        path = TEMPLATES_DIR / f"{slug}.png"
        if not path.is_file():
            continue
        result.append(
            CharacterTemplate(
                slug=slug,
                name=name,
                avatar_url=_avatar_url(slug, path),
                gender=gender,
                persona=persona,
            )
        )
    return result


def all_template_specs() -> list[tuple[str, str, Gender, str]]:
    """seed スクリプトが回す対象を返すための公開ヘルパ。"""
    return list(_TEMPLATE_CATALOG)
