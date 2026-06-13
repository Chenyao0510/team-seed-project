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

# クロマキー背景色（明るい緑）と HSV 許容範囲
CHROMA_KEY_BGR = (0, 255, 0)
CHROMA_HSV_LOWER = (35, 80, 80)
CHROMA_HSV_UPPER = (85, 255, 255)

# タイムアウト・リトライ
GROUNDING_TIMEOUT_SECONDS = 8
TEXT_TIMEOUT_SECONDS = 15
IMAGE_TIMEOUT_SECONDS = 30
IMAGE_GENERATION_RETRIES = 2

# プレースホルダーアバター
PLACEHOLDER_SIZE_PX = 256

# 次ターン生成 (T24)
CHAT_HISTORY_PROMPT_LIMIT = 12  # プロンプトに渡す直近 chat_history 件数
NEXT_TURN_TIMEOUT_SECONDS = 20
