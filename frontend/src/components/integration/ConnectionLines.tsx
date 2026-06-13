// 中心ノードと周辺カードを繋ぐ関係線 (D15)。
//
// SVG パスを `pathLength: 0 -> 1` でアニメして「線が伸びる」演出を行う。
// viewBox は親 Bento コンテナの aspect-[16/10] と一致させる。
import { motion } from 'framer-motion'
import type { CategorySlot, Point } from '../../lib/integrationLayout'
import {
  LAYOUT_VIEWBOX_HEIGHT,
  LAYOUT_VIEWBOX_WIDTH,
} from '../../lib/integrationLayout'

const LINE_DRAW_DURATION_SECONDS = 0.7
const LINE_STAGGER_SECONDS = 0.12

interface ConnectionLinesProps {
  centerPoint: Point
  pairs: CategorySlot[]
  baseDelay: number
  highlightedCategoryIndex: number | null
}

function lineId(index: number): string {
  return `integration-connection-line-${index}`
}

export function ConnectionLines({
  centerPoint,
  pairs,
  baseDelay,
  highlightedCategoryIndex,
}: ConnectionLinesProps) {
  return (
    <svg
      data-testid="integration-connection-lines"
      viewBox={`0 0 ${LAYOUT_VIEWBOX_WIDTH} ${LAYOUT_VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
    >
      {pairs.map(({ slot, index }) => {
        const isHighlighted = highlightedCategoryIndex === index
        return (
          <motion.line
            key={lineId(index)}
            x1={centerPoint.x}
            y1={centerPoint.y}
            x2={slot.center.x}
            y2={slot.center.y}
            stroke={isHighlighted ? 'rgb(252 211 77 / 0.55)' : 'rgb(110 231 183 / 0.35)'}
            strokeWidth={isHighlighted ? 0.7 : 0.4}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{
              duration: LINE_DRAW_DURATION_SECONDS,
              delay: baseDelay + index * LINE_STAGGER_SECONDS,
              ease: 'easeInOut',
            }}
          />
        )
      })}
    </svg>
  )
}
