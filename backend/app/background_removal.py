"""OpenCV による「エッジ自動推定」型の背景透過処理。

Gemini (nano banana) のプロンプト変更により背景色は「単色」とだけ指定し、
具体的な色（緑等）は固定しなくなった (T52)。AI が出力する単色背景は完全な
均一色ではないため、以下の素直な方式で透過する:

1. 画像の左端 1px 列と右端 1px 列を縦方向に走査し、それらの **平均色** を
   背景色として推定する。
2. 各ピクセルと推定背景色の BGR ユークリッド距離を取り、`_BG_COLOR_DISTANCE`
   以下のピクセルを「背景候補」とする。
3. connectedComponents で背景候補の連結成分を計算する。
   - **画像の四辺いずれかに触れている成分**: 外側の純粋な背景なので透過。
   - **内部に閉じ込められている成分** (例: 足の間、脇の隙間、肘の内側):
     ノイズではない一定サイズ以上（`_MIN_ENCLOSED_HOLE_AREA`）なら、これも
     透過する。プロンプトで「服や髪に背景と同じ色を使わない」と明言している
     ので、内部の bg 色領域は実体としての穴と判断できる。

透過後は人物の外接矩形（alpha > しきい値の最小外接 bbox）にクロップする。
これによりフロント側が `h-full` で表示したとき立ち絵が列を最大限埋める。
"""

import cv2
import numpy as np

# 背景色との「同じ色とみなす」BGR ユークリッド距離しきい値。
# AI 出力は単色指定でも JPEG 圧縮や微妙なシェーディングで ±20 程度ぶれる。
# 40 だと余裕を持って同色判定でき、肌・服のはっきり違う色は別判定になる。
_BG_COLOR_DISTANCE = 40.0

# 内部に閉じ込められた bg 候補領域を「実体としての穴」とみなす最小面積 (px)。
# これより小さい孤立ピクセル群は JPEG ノイズ・ハイライト等とみなして無視する。
# 8x8 相当 = 64 px なら、実用上のノイズは弾きつつ、足の間など人物の意図的な
# 空白は確実に拾える。
_MIN_ENCLOSED_HOLE_AREA = 64

# モルフォロジーで微小ノイズを潰し、境界のジャギーを整える。
_MORPH_KERNEL_SIZE = 3
_MORPH_ITERATIONS = 1

# 境界ぼかし用のガウシアンカーネル。フリンジを軽減する。
_EDGE_BLUR_KERNEL = (5, 5)

# bbox 検出時の alpha しきい値。GaussianBlur 後はエッジ周辺で alpha が
# 1〜数十の小さな値になる。これらを「中身」と誤検出して bbox が画像端まで
# 広がるのを防ぐため、ある程度の透明度を持つピクセルだけを「人物」と見なす。
_BBOX_ALPHA_THRESHOLD = 32

# クロップ後に残す上下左右の透過パディング (px)。透明枠がゼロだと
# キャラの輪郭がフロント側の影や drop-shadow で切れて見えるため少し残す。
_BBOX_PADDING = 12


def remove_background(image_bytes: bytes) -> bytes:
    """画像 bytes (PNG/JPEG) を受け取り、推定背景色を透過した PNG bytes を返す。"""
    buffer = np.frombuffer(image_bytes, dtype=np.uint8)
    bgr = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError("Failed to decode image bytes")

    bg_color = _estimate_background_color(bgr)
    bg_mask = _edge_connected_background_mask(bgr, bg_color)

    # モルフォロジー: 内部に紛れ込んだ小さな背景判定や、人物境界のジャギーを
    # ある程度滑らかにする。
    kernel = np.ones((_MORPH_KERNEL_SIZE, _MORPH_KERNEL_SIZE), np.uint8)
    bg_mask = cv2.morphologyEx(bg_mask, cv2.MORPH_OPEN, kernel, iterations=_MORPH_ITERATIONS)
    bg_mask = cv2.morphologyEx(bg_mask, cv2.MORPH_CLOSE, kernel, iterations=_MORPH_ITERATIONS)

    alpha = cv2.bitwise_not(bg_mask)
    # 境界をぼかしてエッジのジャギーや色フリンジを軽減
    alpha = cv2.GaussianBlur(alpha, _EDGE_BLUR_KERNEL, 0)

    bgra = cv2.cvtColor(bgr, cv2.COLOR_BGR2BGRA)
    bgra[:, :, 3] = alpha

    bgra = _crop_to_content(bgra)

    success, encoded = cv2.imencode(".png", bgra)
    if not success:
        raise ValueError("Failed to encode transparent PNG")
    return bytes(encoded)


def _estimate_background_color(bgr: np.ndarray) -> np.ndarray:
    """左右の端 1px 列を縦に走査し、その平均色を背景色として返す (BGR float)。"""
    left_col = bgr[:, 0, :]  # (H, 3)
    right_col = bgr[:, -1, :]  # (H, 3)
    edge_pixels = np.vstack([left_col, right_col]).astype(np.float32)  # (2H, 3)
    return edge_pixels.mean(axis=0)  # (3,) BGR


def _edge_connected_background_mask(bgr: np.ndarray, bg_color: np.ndarray) -> np.ndarray:
    """背景色との色距離が近く、かつ「画像端と連結」または「内部の穴」と判定された
    ピクセル群を背景マスクとする。

    返り値: 背景=255, 前景=0 の uint8 マスク (H, W)。
    """
    diff = bgr.astype(np.float32) - bg_color.reshape(1, 1, 3)
    distance = np.sqrt((diff * diff).sum(axis=2))  # (H, W)
    candidate = (distance <= _BG_COLOR_DISTANCE).astype(np.uint8)

    if not candidate.any():
        return np.zeros(candidate.shape, dtype=np.uint8)

    # candidate=1 のピクセル群を連結成分にラベリング (背景候補=1, 前景=0 で 4-近傍)。
    # label 0 は candidate=0 のセル（=前景候補）に割当てられるので除外する。
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(candidate, connectivity=4)
    if num_labels <= 1:
        return np.zeros(candidate.shape, dtype=np.uint8)

    # 1. 画像端に触れているラベル = 外側の純粋な背景
    edge_label_set = set()
    edge_label_set.update(int(v) for v in labels[0, :])
    edge_label_set.update(int(v) for v in labels[-1, :])
    edge_label_set.update(int(v) for v in labels[:, 0])
    edge_label_set.update(int(v) for v in labels[:, -1])
    edge_label_set.discard(0)

    bg_label_set = set(edge_label_set)

    # 2. 内部に閉じ込められた候補領域も「実体としての穴」(例: 足の間、脇の隙間)
    #    と見なし、ノイズ閾値以上の面積なら透過対象に加える。
    for label_id in range(1, num_labels):
        if label_id in bg_label_set:
            continue
        area = int(stats[label_id, cv2.CC_STAT_AREA])
        if area >= _MIN_ENCLOSED_HOLE_AREA:
            bg_label_set.add(label_id)

    if not bg_label_set:
        return np.zeros(candidate.shape, dtype=np.uint8)

    is_bg = np.isin(labels, np.fromiter(bg_label_set, dtype=labels.dtype))
    return (is_bg.astype(np.uint8)) * 255


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
