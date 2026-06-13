"""人物セグメンテーションによる背景透過処理 (T52)。

`rembg` (U^2-Net 系の人物セグメンテーションモデル) で人物だけを切り抜く。
かつての「左右端から背景色を推定 → 連結成分 → 内側ホール検出」のヒューリスティック
群（緑バック前提や、足の間が抜けない / 髪の輪郭がガクつく等の問題があった）を
全部 1 つのモデル呼び出しに置き換える。

透過後の追加処理:
- `_crop_to_content`: 透過後の bbox に合わせてクロップし、フロント側 `h-full` で
  立ち絵が列を最大限埋めるようにする。
- `crop_head_square`: アイコン用に「上から正方形」を切り出す。

セッション内ではモデルを使い回せるよう `rembg.new_session` を一度だけ作って
グローバルにキャッシュする (毎回 ONNX を再ロードすると数秒のオーバーヘッドが
乗ってしまうため)。
"""

import cv2
import numpy as np
from rembg import new_session, remove

# rembg モデル。`u2net` が汎用人物・物体セグメンテーションのデフォルト。
# 軽量代替に `u2netp` (小さめ ONNX) もあるが、立ち絵の輪郭品質を優先して `u2net`。
_REMBG_MODEL = "u2net"

# bbox 検出時の alpha しきい値。エッジ周辺はソフトアルファ (1〜数十) になる。
# これらを「中身」と誤検出して bbox が画像端まで広がるのを防ぐため、ある程度の
# 不透明度を持つピクセルだけを「人物」と見なす。
_BBOX_ALPHA_THRESHOLD = 32

# クロップ後に残す上下左右の透過パディング (px)。透明枠がゼロだと
# キャラの輪郭がフロント側の影や drop-shadow で切れて見えるため少し残す。
_BBOX_PADDING = 12

_session = None


def _get_session():
    """rembg セッションをモジュール内でキャッシュして使い回す。"""
    global _session
    if _session is None:
        _session = new_session(_REMBG_MODEL)
    return _session


def remove_background(image_bytes: bytes) -> bytes:
    """画像 bytes (PNG/JPEG) を受け取り、人物以外を透過した PNG bytes を返す。"""
    cutout_bytes = remove(image_bytes, session=_get_session())

    bgra = cv2.imdecode(np.frombuffer(cutout_bytes, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    if bgra is None:
        raise ValueError("Failed to decode rembg output")
    if bgra.ndim != 3 or bgra.shape[2] != 4:
        # rembg は BGRA を返すはずだが念のため
        bgra = cv2.cvtColor(bgra, cv2.COLOR_BGR2BGRA)

    bgra = _crop_to_content(bgra)

    success, encoded = cv2.imencode(".png", bgra)
    if not success:
        raise ValueError("Failed to encode transparent PNG")
    return bytes(encoded)


def crop_head_square(png_bytes: bytes) -> bytes:
    """透過 PNG の「上部分」から正方形を切り出してアイコン用 PNG を返す (T52)。

    `remove_background` で bbox クロップ済みの立ち絵を想定。bbox クロップ後は
    画像の最上部 ≒ 頭頂部 / 最下部 ≒ 足元 の構造になるため、上から1辺
    `min(width, height)` の正方形をクロップすれば頭を中心としたアイコンになる。

    - portrait (height > width): 幅 W の正方形を「上から W ピクセル」切り出す
    - 横長または既に正方形: そのまま返す（無駄なリサイズはしない）
    - 横幅が高さより大きい場合（顔アップ等）は中央寄せで正方形化
    """
    bgra = cv2.imdecode(np.frombuffer(png_bytes, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    if bgra is None:
        raise ValueError("Failed to decode image bytes")
    if bgra.ndim != 3 or bgra.shape[2] != 4:
        # アルファチャンネルが無いなら作る（透明にはしないが、形式を統一）
        bgra = cv2.cvtColor(bgra, cv2.COLOR_BGR2BGRA)

    h, w = bgra.shape[:2]
    side = min(h, w)
    # 縦長: 上から W x W、横幅 (w == side) のまま
    if h > w:
        cropped = bgra[0:side, 0:w]
    # 横長: 上から H x H、中央寄せで X 方向を切る
    elif w > h:
        x_offset = (w - side) // 2
        cropped = bgra[0:h, x_offset : x_offset + side]
    else:
        cropped = bgra

    success, encoded = cv2.imencode(".png", cropped)
    if not success:
        raise ValueError("Failed to encode head-square PNG")
    return bytes(encoded)


def _crop_to_content(bgra: np.ndarray) -> np.ndarray:
    """alpha が `_BBOX_ALPHA_THRESHOLD` を超えるピクセルの最小外接矩形にクロップする。

    全ピクセルが透明（人物検出失敗）の場合は元画像をそのまま返す。
    """
    alpha = bgra[:, :, 3]
    mask = alpha > _BBOX_ALPHA_THRESHOLD
    if not mask.any():
        return bgra

    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    row_indices = np.where(rows)[0]
    col_indices = np.where(cols)[0]
    y0, y1 = int(row_indices[0]), int(row_indices[-1])
    x0, x1 = int(col_indices[0]), int(col_indices[-1])

    h, w = bgra.shape[:2]
    y0 = max(0, y0 - _BBOX_PADDING)
    y1 = min(h - 1, y1 + _BBOX_PADDING)
    x0 = max(0, x0 - _BBOX_PADDING)
    x1 = min(w - 1, x1 + _BBOX_PADDING)

    return bgra[y0 : y1 + 1, x0 : x1 + 1].copy()
