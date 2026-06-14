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


# (slug, display_name, gender) の静的リスト。時代・分野・地域を分散させる。
_TEMPLATE_CATALOG: tuple[tuple[str, str, Gender], ...] = (
    ("obama", "バラク・オバマ", "male"),
    ("elon", "イーロン・マスク", "male"),
    ("socrates", "ソクラテス", "male"),
    ("einstein", "アインシュタイン", "male"),
    ("curie", "マリ・キュリー", "female"),
    ("ryoma", "坂本龍馬", "male"),
    ("jobs", "スティーブ・ジョブズ", "male"),
    ("gandhi", "ガンジー", "male"),
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
    for slug, name, gender in _TEMPLATE_CATALOG:
        path = TEMPLATES_DIR / f"{slug}.png"
        if not path.is_file():
            continue
        result.append(
            CharacterTemplate(
                slug=slug,
                name=name,
                avatar_url=_avatar_url(slug, path),
                gender=gender,
            )
        )
    return result


def all_template_specs() -> list[tuple[str, str, Gender]]:
    """seed スクリプトが回す対象を返すための公開ヘルパ。"""
    return list(_TEMPLATE_CATALOG)
