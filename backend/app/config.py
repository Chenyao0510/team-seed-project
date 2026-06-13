"""環境変数読込と、アバター生成パイプラインで使う命名定数。"""

import os
from pathlib import Path

from dotenv import load_dotenv

# backend/.env を読み込む（リポジトリルートの .env も併せて探索）
_BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(_BACKEND_DIR / ".env")
load_dotenv(_BACKEND_DIR.parent / ".env")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# Gemini モデル
TEXT_MODEL = "gemini-2.5-flash"
IMAGE_MODEL = "gemini-2.5-flash-image"

# 公開ベースURL（avatar_url の組み立てに使用）
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000")

# 静的ファイル配信
STATIC_DIR = _BACKEND_DIR / "static"
AVATARS_DIR = STATIC_DIR / "avatars"
AVATARS_URL_PREFIX = "/static/avatars"

# 事前生成キャラクターテンプレート (T5A / D16)
TEMPLATES_DIR = STATIC_DIR / "templates"
TEMPLATES_URL_PREFIX = "/static/templates"


# タイムアウト・リトライ
IMAGE_TIMEOUT_SECONDS = 30
IMAGE_GENERATION_RETRIES = 2

# プレースホルダーアバター
PLACEHOLDER_SIZE_PX = 256

# 次ターン生成 (T24)
CHAT_HISTORY_PROMPT_LIMIT = 12  # プロンプトに渡す直近 chat_history 件数
NEXT_TURN_TIMEOUT_SECONDS = 20

# Reflection 構造化要約生成 (T26 残作業 / D13)
REFLECTION_TIMEOUT_SECONDS = 20

# 統合レポート生成 (T31)
SUMMARIZE_HISTORY_PROMPT_LIMIT = 40  # プロンプトに渡す chat_history 件数の上限
SUMMARIZE_TIMEOUT_SECONDS = 30
