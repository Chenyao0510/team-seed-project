// Bento UI 周辺カード (D15)。
//
// 中心ノードから「飛び出す」演出: 初期 transform は中心ノード位置に重なる
// オフセット (centerOffsetX/Y) + scale 0 + opacity 0 + 大きな回転。
// アニメーションは「回転しながら外側へ → わずかにオーバーシュート → バウンスして着地」
// のキーフレーム配列で表現する。Stagger は親 IntegrationMap が delay で制御する。
//
// 惑星テーマ: categoryIndex ごとに異なる色パレットを適用。
// style={{ gridArea }} と style={{ boxShadow }} は必ず 1 つの style オブジェクトにまとめること
// （2 つ書くと後者が前者を上書きし gridArea が消える）。
import { motion } from 'framer-motion'
import type { IntegrationStructureCategory } from '../../types/state'

const CARD_FLY_DURATION_SECONDS = 1.4
const ELEMENT_STAGGER_SECONDS = 0.07
const ELEMENT_FADE_DURATION_SECONDS = 0.4

// 惑星パレット: index 0−3 で各カードに別の色を割り当てる
const PLANET_PALETTE = [
  {
    ring: 'ring-1 ring-cyan-400/40',
    bg: 'bg-cyan-950/55',
    border: 'border-l-2 border-cyan-400/60',
    heading: 'text-cyan-300',
    glow: 'rgba(34,211,238,0.18)',
    glowInner: 'rgba(34,211,238,0.09)',
  },
  {
    ring: 'ring-1 ring-rose-400/40',
    bg: 'bg-rose-950/55',
    border: 'border-l-2 border-rose-400/60',
    heading: 'text-rose-300',
    glow: 'rgba(251,113,133,0.18)',
    glowInner: 'rgba(251,113,133,0.09)',
  },
  {
    ring: 'ring-1 ring-emerald-400/40',
    bg: 'bg-emerald-950/55',
    border: 'border-l-2 border-emerald-400/60',
    heading: 'text-emerald-300',
    glow: 'rgba(52,211,153,0.18)',
    glowInner: 'rgba(52,211,153,0.09)',
  },
  {
    ring: 'ring-1 ring-violet-400/40',
    bg: 'bg-violet-950/55',
    border: 'border-l-2 border-violet-400/60',
    heading: 'text-violet-300',
    glow: 'rgba(167,139,250,0.18)',
    glowInner: 'rgba(167,139,250,0.09)',
  },
] as const

interface StructureCardProps {
  category: IntegrationStructureCategory
  gridArea: string
  categoryIndex: number
  highlightedCategoryIndex: number | null
  highlightedElementIndex: number | null
  // 中心ノード位置への変位 (px)。
  centerOffsetX: number
  centerOffsetY: number
  delay: number
}

export function StructureCard({
  category,
  gridArea,
  categoryIndex,
  highlightedCategoryIndex,
  highlightedElementIndex,
  centerOffsetX,
  centerOffsetY,
  delay,
}: StructureCardProps) {
  const isHighlightedCard = highlightedCategoryIndex === categoryIndex
  const palette = PLANET_PALETTE[categoryIndex % PLANET_PALETTE.length]

  // キーフレーム列 (t=0 → 1)
  const xKeyframes = [centerOffsetX, centerOffsetX * 0.35, centerOffsetX * -0.18, centerOffsetX * 0.06, 0]
  const yKeyframes = [centerOffsetY, centerOffsetY * 0.35, centerOffsetY * -0.18, centerOffsetY * 0.06, 0]
  const scaleKeyframes = [0, 0.45, 1.18, 0.94, 1]
  const opacityKeyframes = [0, 1, 1, 1, 1]
  const rotateKeyframes = [-720, -360, -90, 30, 0]
  const keyframeTimes = [0, 0.3, 0.65, 0.85, 1]

  return (
    <motion.article
      data-testid="integration-structure-cell"
      data-highlighted-card={isHighlightedCard ? 'true' : 'false'}
      data-category-index={categoryIndex}
      // gridArea と boxShadow は必ず同一 style オブジェクトで渡す
      style={{
        gridArea,
        boxShadow: isHighlightedCard
          ? [
              '0 0 0 1px rgba(251,191,36,0.45)',       // border ring
              '0 0 25px 8px rgba(251,191,36,0.40)',    // inner tight
              '0 0 80px 30px rgba(251,191,36,0.18)',   // mid
              '0 0 180px 80px rgba(251,191,36,0.08)',  // far
              '0 0 320px 140px rgba(251,191,36,0.04)', // ~460px
            ].join(', ')
          : [
              `0 0 0 1px ${palette.glow}`,              // border ring
              `0 0 25px 8px ${palette.glow}`,           // inner tight
              `0 0 80px 30px ${palette.glowInner}`,    // mid
              `0 0 180px 80px ${palette.glowInner}`,   // far
              `0 0 320px 140px ${palette.glowInner}`,  // ~460px
            ].join(', '),
      }}
      initial={{
        x: centerOffsetX,
        y: centerOffsetY,
        scale: 0,
        opacity: 0,
        rotate: -720,
      }}
      animate={{
        x: xKeyframes,
        y: yKeyframes,
        scale: scaleKeyframes,
        opacity: opacityKeyframes,
        rotate: rotateKeyframes,
      }}
      transition={{
        duration: CARD_FLY_DURATION_SECONDS,
        delay,
        ease: 'easeOut',
        times: keyframeTimes,
      }}
      className={[
        'relative z-10 flex flex-col gap-3 self-center justify-self-center rounded-2xl backdrop-blur-sm px-6 py-5',
        isHighlightedCard
          ? 'bg-amber-950/55 ring-1 ring-amber-400/45 border-l-2 border-amber-400/70'
          : `${palette.bg} ${palette.ring} ${palette.border}`,
      ].join(' ')}
    >
      {/* 惑星グロー: 常時 breathing */}
      <motion.div
        aria-hidden="true"
        animate={{ opacity: [0.4, 0.85, 0.4] }}
        transition={{ duration: 3 + categoryIndex * 0.4, repeat: Infinity, ease: 'easeInOut', delay: categoryIndex * 0.6 }}
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background: isHighlightedCard
            ? 'radial-gradient(ellipse at 30% 30%, rgba(251,191,36,0.10), transparent 70%)'
            : `radial-gradient(ellipse at 30% 30%, ${palette.glowInner}, transparent 70%)`,
        }}
      />
      <h3 className={[
        'relative text-sm font-bold uppercase tracking-widest',
        isHighlightedCard ? 'text-amber-300' : palette.heading,
      ].join(' ')}>
        {category.category_name}
      </h3>
      <ul className="relative space-y-1">
        {category.elements.map((element, elementIndex) => {
          const isHighlightedElement = isHighlightedCard && elementIndex === highlightedElementIndex
          return (
            <motion.li
              key={`${category.category_name}-${element}`}
              data-testid="integration-structure-element"
              data-highlighted={isHighlightedElement ? 'true' : 'false'}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: ELEMENT_FADE_DURATION_SECONDS,
                delay: delay + CARD_FLY_DURATION_SECONDS + (elementIndex + 1) * ELEMENT_STAGGER_SECONDS,
                ease: 'easeOut',
              }}
              className={
                isHighlightedElement
                  ? 'text-lg font-bold text-amber-200'
                  : 'text-base font-medium text-slate-200'
              }
            >
              {element}
            </motion.li>
          )
        })}
      </ul>
    </motion.article>
  )
}

// 親側のステージタイミング計算で参照する公開定数。
export const CARD_FLY_DURATION = CARD_FLY_DURATION_SECONDS
