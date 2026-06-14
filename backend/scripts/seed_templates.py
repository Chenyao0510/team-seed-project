"""事前生成キャラクターテンプレートの seed スクリプト (T5A / D16)。

`character_templates.all_template_specs()` で挙げた全テンプレートに対し、
D09/D10 の動的アバターパイプラインを 1 回ずつ回して PNG を
`backend/static/templates/<slug>.png` に保存する。

要件:
  - GEMINI_API_KEY が `.env` に設定されていること
  - `backend/.venv` の python から実行すること

使い方:
    cd backend && .venv/bin/python scripts/seed_templates.py
    # 既に PNG がある slug はスキップしたいときは --skip-existing
    cd backend && .venv/bin/python scripts/seed_templates.py --skip-existing

各テンプレートで失敗しても他のテンプレートは継続生成する。失敗 slug は最後にまとめて
報告する（D09 のフェイルセーフ方針を継承）。
"""

from __future__ import annotations

import argparse
import sys
import traceback
from pathlib import Path

# backend/ をインポートパスに加える
_BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND_DIR))

from app import gemini_client, image_search  # noqa: E402
from app.background_removal import remove_background  # noqa: E402
from app.character_templates import all_template_specs  # noqa: E402
from app.config import TEMPLATES_DIR  # noqa: E402


def _generate_one(slug: str, name: str) -> bytes:
    # T52: 名前 + 参照画像数枚で生成する。画像検索が空なら名前のみで Gemini に投げる。
    try:
        reference_images = image_search.fetch_reference_images(name)
    except Exception:
        reference_images = []
    image_bytes = gemini_client.generate_avatar_image(name, reference_images)
    return remove_background(image_bytes)


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed character template PNGs.")
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="既に PNG が存在する slug をスキップする",
    )
    args = parser.parse_args()

    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)

    succeeded: list[str] = []
    skipped: list[str] = []
    failed: list[tuple[str, str]] = []

    for slug, name, _gender in all_template_specs():
        out_path = TEMPLATES_DIR / f"{slug}.png"
        if args.skip_existing and out_path.is_file():
            print(f"[SKIP] {slug} ({name}) - already exists")
            skipped.append(slug)
            continue

        print(f"[GEN]  {slug} ({name}) ...")
        try:
            png_bytes = _generate_one(slug, name)
            out_path.write_bytes(png_bytes)
            print(f"[OK]   {slug} -> {out_path}")
            succeeded.append(slug)
        except Exception as exc:  # noqa: BLE001
            print(f"[FAIL] {slug}: {exc}", file=sys.stderr)
            traceback.print_exc()
            failed.append((slug, str(exc)))

    print()
    print(
        f"Done. succeeded={len(succeeded)} skipped={len(skipped)} failed={len(failed)}"
    )
    if failed:
        for slug, msg in failed:
            print(f"  - {slug}: {msg}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
