// 中心ノードと周辺カードを繋ぐ関係線 (D15)。
//
// SVG defs: glow filter。各線は pathLength 0→1 でアニメ。
// glow halo 重ね + ハイライト線は琥珀色・太め。
import { motion } from 'framer-motion'
import type { CategorySlot, Point } from '../../lib/integrationLayout'
import { LAYOUT_VIEWBOX_HEIGHT, LAYOUT_VIEWBOX_WIDTH } from '../../lib/integrationLayout'

const LINE_DRAW_DURATION_SECONDS = 0.7
const LINE_STAGGER_SECONDS = 0.12

// 惑星パレットと対応させた線色 (index 0−3)
const LINE_PALETTE = [
  { core: 'rgba(34,211,238,0.55)',  halo: 'rgba(34,211,238,0.18)'  }, // cyan
  { core: 'rgba(251,113,133,0.55)', halo: 'rgba(251,113,133,0.18)' }, // rose
  { core: 'rgba(52,211,153,0.55)',  halo: 'rgba(52,211,153,0.18)'  }, // emerald
  { core: 'rgba(167,139,250,0.55)', halo: 'rgba(167,139,250,0.18)' }, // violet
]

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
      <defs>
        <filter id="lineGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {pairs.map(({ slot, index }) => {
        const isHighlighted = highlightedCategoryIndex === index
        const pal = LINE_PALETTE[index % LINE_PALETTE.length]
        const lineDelay = baseDelay + index * LINE_STAGGER_SECONDS

        return (
          <g key={lineId(index)}>
            {/* glow halo */}
            <motion.line
              x1={centerPoint.x} y1={centerPoint.y}
              x2={slot.center.x} y2={slot.center.y}
              stroke={isHighlighted ? 'rgba(251,191,36,0.30)' : pal.halo}
              strokeWidth={isHighlighted ? 5 : 3}
              strokeLinecap="round"
              filter="url(#lineGlow)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: LINE_DRAW_DURATION_SECONDS, delay: lineDelay, ease: 'easeInOut' }}
            />
            {/* core line */}
            <motion.line
              key={lineId(index)}
              data-line-highlighted={isHighlighted ? 'true' : 'false'}
              x1={centerPoint.x} y1={centerPoint.y}
              x2={slot.center.x} y2={slot.center.y}
              stroke={isHighlighted ? 'rgba(252,211,77,0.80)' : pal.core}
              strokeWidth={isHighlighted ? 1.2 : 0.6}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: LINE_DRAW_DURATION_SECONDS, delay: lineDelay, ease: 'easeInOut' }}
            />
          </g>
        )
      })}
    </svg>
  )
}
