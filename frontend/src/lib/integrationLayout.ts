// Screen 2 (Integration Map) の Bento レイアウトを純関数で返す (D15)。
//
// カテゴリ数 (2〜4) に応じて以下を決定論的に返す:
//   - CSS Grid の grid-template-areas
//   - 中心ノードと各カードの SVG viewBox 座標
//   - 各スロットの grid-area 名
//
// 5 個以上は backend (D14) で 2〜4 に絞られる前提だが、Front 側でも防御的に
// 先頭 4 件で切り詰める。`structure_map` の配列順を尊重する。

import type { IntegrationStructureCategory } from '../types/state'

// SVG viewBox は 16:10 (Bento コンテナの aspect-[16/10] と一致)。
export const LAYOUT_VIEWBOX_WIDTH = 160
export const LAYOUT_VIEWBOX_HEIGHT = 100
export const MAX_CATEGORIES = 4

export type SlotPosition =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'bottom-left'
  | 'bottom-right'

export interface Point {
  x: number
  y: number
}

export interface LayoutSlot {
  area: string
  position: SlotPosition
  center: Point
}

export interface IntegrationLayout {
  gridTemplateAreas: string
  centerArea: string
  centerPoint: Point
  slots: LayoutSlot[]
}

// 3×3 グリッドのセル中心を viewBox 座標で表現したもの。
// 列: 1/6, 1/2, 5/6 → x: 26.67, 80, 133.33
// 行: 1/6, 1/2, 5/6 → y: 16.67, 50, 83.33
const CELL_X_LEFT = (1 / 6) * LAYOUT_VIEWBOX_WIDTH
const CELL_X_CENTER = (1 / 2) * LAYOUT_VIEWBOX_WIDTH
const CELL_X_RIGHT = (5 / 6) * LAYOUT_VIEWBOX_WIDTH
const CELL_Y_TOP = (1 / 6) * LAYOUT_VIEWBOX_HEIGHT
const CELL_Y_MIDDLE = (1 / 2) * LAYOUT_VIEWBOX_HEIGHT
const CELL_Y_BOTTOM = (5 / 6) * LAYOUT_VIEWBOX_HEIGHT

const CENTER_POINT: Point = { x: CELL_X_CENTER, y: CELL_Y_MIDDLE }
const CENTER_AREA = 'center'

// 3×3 グリッドのテンプレート文字列。areas のセル名は CSS grid-template-areas の
// 一行文字列に組み直す。
function joinAreas(rows: string[][]): string {
  return rows.map((row) => `"${row.join(' ')}"`).join(' ')
}

const LAYOUT_2: IntegrationLayout = {
  gridTemplateAreas: joinAreas([
    ['.', '.', '.'],
    ['left', 'center', 'right'],
    ['.', '.', '.'],
  ]),
  centerArea: CENTER_AREA,
  centerPoint: CENTER_POINT,
  slots: [
    { area: 'left', position: 'left', center: { x: CELL_X_LEFT, y: CELL_Y_MIDDLE } },
    { area: 'right', position: 'right', center: { x: CELL_X_RIGHT, y: CELL_Y_MIDDLE } },
  ],
}

// 3カテゴリは「上 + 左下 + 右下」の三角配置。下向きに開く形にして
// 「中心テーマから派生する」体感を出す。
const LAYOUT_3: IntegrationLayout = {
  gridTemplateAreas: joinAreas([
    ['.', 'top', '.'],
    ['.', 'center', '.'],
    ['bottom-left', '.', 'bottom-right'],
  ]),
  centerArea: CENTER_AREA,
  centerPoint: CENTER_POINT,
  slots: [
    { area: 'top', position: 'top', center: { x: CELL_X_CENTER, y: CELL_Y_TOP } },
    {
      area: 'bottom-left',
      position: 'bottom-left',
      center: { x: CELL_X_LEFT, y: CELL_Y_BOTTOM },
    },
    {
      area: 'bottom-right',
      position: 'bottom-right',
      center: { x: CELL_X_RIGHT, y: CELL_Y_BOTTOM },
    },
  ],
}

// 4カテゴリは仕様例の十字配置。
const LAYOUT_4: IntegrationLayout = {
  gridTemplateAreas: joinAreas([
    ['.', 'top', '.'],
    ['left', 'center', 'right'],
    ['.', 'bottom', '.'],
  ]),
  centerArea: CENTER_AREA,
  centerPoint: CENTER_POINT,
  slots: [
    { area: 'top', position: 'top', center: { x: CELL_X_CENTER, y: CELL_Y_TOP } },
    { area: 'right', position: 'right', center: { x: CELL_X_RIGHT, y: CELL_Y_MIDDLE } },
    { area: 'bottom', position: 'bottom', center: { x: CELL_X_CENTER, y: CELL_Y_BOTTOM } },
    { area: 'left', position: 'left', center: { x: CELL_X_LEFT, y: CELL_Y_MIDDLE } },
  ],
}

// `length` が 0 / 1 のときは 2 カテゴリの空きを使ってもレイアウトが破綻するため、
// 暫定で LAYOUT_2 にフォールバックする（slots を 2 件未満で返さない契約は呼び出し側
// で空 slot をスキップして描画する想定）。実用上 backend が 2〜4 を保証する。
export function getIntegrationLayout(categoryCount: number): IntegrationLayout {
  const safe = Math.min(Math.max(categoryCount, 0), MAX_CATEGORIES)
  if (safe >= MAX_CATEGORIES) return LAYOUT_4
  if (safe === 3) return LAYOUT_3
  return LAYOUT_2
}

// `structure_map` を MAX_CATEGORIES で切り詰めて、`getIntegrationLayout` の slots と
// 1:1 で zip した配列を返すユーティリティ。slot 数より少ないカテゴリは undefined を
// 返さず、純粋に「描画できる組」のみを返す。
export interface CategorySlot {
  category: IntegrationStructureCategory
  slot: LayoutSlot
  index: number
}

export function pairCategoriesWithSlots(
  categories: IntegrationStructureCategory[],
  layout: IntegrationLayout,
): CategorySlot[] {
  const trimmed = categories.slice(0, MAX_CATEGORIES)
  return trimmed.map((category, index) => {
    const slot = layout.slots[index]
    return { category, slot, index }
  })
}

// `highlighted_element_index` が最初にセットされたカテゴリを返す（D15: 介入トレースは
// 1 件のみ）。無ければ null。
export interface HighlightTarget {
  categoryIndex: number
  elementIndex: number
}

export function findHighlightTarget(
  categories: IntegrationStructureCategory[],
): HighlightTarget | null {
  for (let i = 0; i < Math.min(categories.length, MAX_CATEGORIES); i += 1) {
    const idx = categories[i].highlighted_element_index
    if (typeof idx === 'number' && idx >= 0 && idx < categories[i].elements.length) {
      return { categoryIndex: i, elementIndex: idx }
    }
  }
  return null
}

// Card の「中心ノード位置への変位量」を、コンテナ寸法に対する分数で返す。
// 呼び出し側で実コンテナ幅・高さに掛けてピクセル offset を得て、
// Framer Motion の x/y 初期値（=中心から飛び出す起点）として使う。
export interface SlotMetrics {
  centerOffsetXFrac: number
  centerOffsetYFrac: number
}

export function getSlotMetrics(slot: LayoutSlot, centerPoint: Point): SlotMetrics {
  return {
    centerOffsetXFrac: (centerPoint.x - slot.center.x) / LAYOUT_VIEWBOX_WIDTH,
    centerOffsetYFrac: (centerPoint.y - slot.center.y) / LAYOUT_VIEWBOX_HEIGHT,
  }
}
