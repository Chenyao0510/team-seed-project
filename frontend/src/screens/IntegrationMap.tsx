// Screen 2 (Integration Map) 司令塔 (D15)。
//
// 構成: GrowthHeader → Structure Map (中心 + 周辺 + 関係線) → InterventionTrace → FeedbackLine
// アニメ順序は STAGE_*_DELAY 定数で定義する（マジックナンバー禁止, CONSTRAINTS.md）。
//
// 周辺カードは「中心ノードから飛び出す」演出を行うため、カード初期位置を
// `useRef`+`ResizeObserver` で測ったセクション実寸に基づくピクセル offset で
// 与える必要がある。実寸が揃うまでカード描画を保留する。
import { useEffect, useRef, useState } from 'react'
import { motion, useAnimate } from 'framer-motion'
import type { IntegrationState } from '../types/state'
import {
  findHighlightTarget,
  getIntegrationLayout,
  getSlotMetrics,
  pairCategoriesWithSlots,
} from '../lib/integrationLayout'
import { GrowthHeader } from '../components/integration/GrowthHeader'
import { CenterNode } from '../components/integration/CenterNode'
import {
  CARD_FLY_DURATION,
  StructureCard,
} from '../components/integration/StructureCard'
import { ConnectionLines } from '../components/integration/ConnectionLines'
import { InterventionTrace } from '../components/integration/InterventionTrace'
import { FeedbackLine } from '../components/integration/FeedbackLine'

// --- ステージ開始時刻 (秒) ---
const STAGE_HEADER_DELAY_S = 0.0
const STAGE_CENTER_DELAY_S = 0.5
const STAGE_CARDS_DELAY_S = 1.0
const CARD_STAGGER_SECONDS = 0.12
// 線は最後のカードがほぼ着地するタイミングで一斉に伸び始める。
// 4 カテゴリ × 0.12 = 0.36 + CARD_FLY_DURATION 1.4 → 約 1.76s
// 1.0 + 1.7 = 2.7s が「最後のカード着地」の目安。
const STAGE_LINES_DELAY_S = STAGE_CARDS_DELAY_S + CARD_FLY_DURATION + 0.3
const LINE_DRAW_DURATION_SECONDS = 0.7
const STAGE_TRACE_DELAY_S =
  STAGE_LINES_DELAY_S + LINE_DRAW_DURATION_SECONDS + 0.3
const FEEDBACK_AFTER_CHAIN_GAP_S = 0.6
const FEEDBACK_AFTER_LINES_GAP_S = 0.8

// 介入チェーン: ★ → 中心ノード → 強調線 → 強調カード → 強調 element の5段
const PULSE_DURATION_SECONDS = 0.5
// 中心着地「ボン」: 全カード着地時の中心ノード flash
const CENTER_BOOM_DURATION_SECONDS = 0.55
const CHAIN_TOTAL_DURATION_S = PULSE_DURATION_SECONDS * 5
const TRACE_LABEL_TO_CHAIN_GAP_S = 0.3

interface IntegrationMapProps {
  state: IntegrationState
  onBack?: () => void
}

// 黄金比スプレッドで決定論的にパーティクル位置を生成（ランダム禁止）
const STAR_COUNT = 80
const GOLDEN_ANGLE = 137.508
const stars = Array.from({ length: STAR_COUNT }, (_, i) => ({
  id: i,
  cx: `${((i * GOLDEN_ANGLE * 1.3) % 100).toFixed(2)}%`,
  cy: `${((i * 97.31) % 100).toFixed(2)}%`,
  r: i % 7 === 0 ? 1.5 : i % 3 === 0 ? 1.0 : 0.6,
  opacity: 0.2 + (i % 5) * 0.12,
  twinkleDuration: 2.5 + (i % 6) * 0.7,
  twinkleDelay: (i % 11) * 0.3,
}))

// スパークル: 内側に凹んだ4点星 (凹型ひし形辺)
// SVGパス: cubic bezier の制御点を 0.15 に設定することで辺が内側に湾曲
const SPARKLE_PATH =
  'M 0,-1 C 0.15,-0.15 0.15,-0.15 1,0 C 0.15,0.15 0.15,0.15 0,1 C -0.15,0.15 -0.15,0.15 -1,0 C -0.15,-0.15 -0.15,-0.15 0,-1 Z'
const SPARKLE_COLORS = [
  'rgba(52,211,153,',   // emerald
  'rgba(167,139,250,',  // violet
  'rgba(251,191,36,',   // amber
  'rgba(148,163,184,',  // slate
  'rgba(34,211,238,',   // cyan
] as const
const sparkles = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  // calc() で中心合わせ: FM の transform と干渉しない
  left: `calc(${((i * GOLDEN_ANGLE * 2.7) % 100).toFixed(1)}% - ${6 + (i % 5) * 3}px)`,
  top:  `calc(${((i * 61.18) % 100).toFixed(1)}% - ${6 + (i % 5) * 3}px)`,
  size: 12 + (i % 5) * 6,  // 12 ~ 36px
  fillOpacity: 0.75 + (i % 3) * 0.08, // 0.75 ~ 0.91 (常に見える)
  color: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
  rotateDeg: (i % 2 === 0 ? 360 : -360), // 向き交互
  rotateDuration: 18 + (i % 8) * 5,
  pulseDuration: 1.8 + (i % 5) * 0.7,
  delay: (i % 9) * 0.5,
}))

export function IntegrationMap({ state, onBack }: IntegrationMapProps) {
  const layout = getIntegrationLayout(state.structure_map.length)
  const pairs = pairCategoriesWithSlots(state.structure_map, layout)
  const highlight = findHighlightTarget(state.structure_map)
  const hasIntervention = highlight !== null

  const feedbackDelay = hasIntervention
    ? STAGE_TRACE_DELAY_S +
      TRACE_LABEL_TO_CHAIN_GAP_S +
      CHAIN_TOTAL_DURATION_S +
      FEEDBACK_AFTER_CHAIN_GAP_S
    : STAGE_LINES_DELAY_S +
      LINE_DRAW_DURATION_SECONDS +
      FEEDBACK_AFTER_LINES_GAP_S

  // --- セクション実寸測定 (カードの "fly-from-center" 初期 offset 用) ---
  const sectionRef = useRef<HTMLDivElement>(null)
  const [sectionSize, setSectionSize] = useState({ w: 0, h: 0 })
  const isReady = sectionSize.w > 0

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setSectionSize({ w: rect.width, h: rect.height })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // --- 介入チェーン & 中心「ボン」 (useAnimate sequence) ---
  const [scope, animate] = useAnimate<HTMLDivElement>()

  // 中心ノード着地「ボン」: 全カード着地直後に中心ノードを flash させる
  useEffect(() => {
    const boomAt = STAGE_LINES_DELAY_S * 1000 - 100 // 線が伸び始める直前
    const timer = window.setTimeout(() => {
      void animate(
        '[data-testid="integration-center"]',
        {
          scale: [1, 1.22, 1],
          filter: [
            'drop-shadow(0 0 0 rgba(110, 231, 183, 0))',
            'drop-shadow(0 0 36px rgba(110, 231, 183, 0.85))',
            'drop-shadow(0 0 0 rgba(110, 231, 183, 0))',
          ],
        },
        { duration: CENTER_BOOM_DURATION_SECONDS, ease: 'easeOut' },
      )
    }, boomAt)
    return () => window.clearTimeout(timer)
  }, [animate])

  // 介入チェーン: ★ → 中心 → 強調線 → 強調カード → 強調 element
  useEffect(() => {
    if (!hasIntervention) return
    const chainStartAt =
      (STAGE_TRACE_DELAY_S + TRACE_LABEL_TO_CHAIN_GAP_S) * 1000
    const timer = window.setTimeout(() => {
      void animate([
        [
          '[data-trace-stage="star"]',
          { scale: [1, 1.6, 1], rotate: [0, 360] },
          { duration: PULSE_DURATION_SECONDS, ease: 'easeOut' },
        ],
        [
          '[data-testid="integration-center"]',
          {
            scale: [1, 1.18, 1],
            filter: [
              'drop-shadow(0 0 0 rgba(252, 211, 77, 0))',
              'drop-shadow(0 0 32px rgba(252, 211, 77, 0.85))',
              'drop-shadow(0 0 0 rgba(252, 211, 77, 0))',
            ],
          },
          { duration: PULSE_DURATION_SECONDS, ease: 'easeOut' },
        ],
        [
          '[data-line-highlighted="true"]',
          {
            strokeWidth: [0.7, 2.2, 0.9],
            opacity: [0.55, 1, 0.8],
          },
          { duration: PULSE_DURATION_SECONDS, ease: 'easeOut' },
        ],
        [
          '[data-highlighted-card="true"]',
          {
            scale: [1, 1.1, 1],
            boxShadow: [
              '0 0 0 rgba(245, 158, 11, 0)',
              '0 0 36px rgba(245, 158, 11, 0.7)',
              '0 0 0 rgba(245, 158, 11, 0)',
            ],
          },
          { duration: PULSE_DURATION_SECONDS, ease: 'easeOut' },
        ],
        [
          '[data-highlighted="true"]',
          {
            scale: [1, 1.22, 1],
            textShadow: [
              '0 0 0 rgba(252, 211, 77, 0)',
              '0 0 18px rgba(252, 211, 77, 1)',
              '0 0 0 rgba(252, 211, 77, 0)',
            ],
          },
          { duration: PULSE_DURATION_SECONDS, ease: 'easeOut' },
        ],
      ])
    }, chainStartAt)
    return () => window.clearTimeout(timer)
  }, [animate, hasIntervention])

  return (
    <div
      ref={scope}
      className="relative min-h-screen bg-[#04060f] text-slate-100"
    >
      {/* ── 星空背景レイヤー ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* エメラルドglobブラー (右上) */}
        <div
          className="absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full opacity-[0.13]"
          style={{ background: 'radial-gradient(circle, #34d399 0%, transparent 68%)' }}
        />
        {/* インディゴglobブラー (左下) */}
        <div
          className="absolute -bottom-56 -left-56 h-[600px] w-[600px] rounded-full opacity-[0.10]"
          style={{ background: 'radial-gradient(circle, #818cf8 0%, transparent 65%)' }}
        />
        {/* 星空パーティクル */}
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          {stars.map((s) => (
            <motion.circle
              key={s.id}
              cx={s.cx}
              cy={s.cy}
              r={s.r}
              fill="white"
              initial={{ opacity: s.opacity }}
              animate={{ opacity: [s.opacity, s.opacity * 0.25, s.opacity] }}
              transition={{
                duration: s.twinkleDuration,
                delay: s.twinkleDelay,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}
        </svg>
        {/* スパークル: 凹型4点星 — calc()で中心合わせ、FMのtransformと干渉しない */}
        {sparkles.map((s) => (
          <motion.div
            key={`sparkle-${s.id}`}
            className="pointer-events-none absolute"
            style={{
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
            }}
            animate={{ opacity: [s.fillOpacity, 0.20, s.fillOpacity] }}
            transition={{
              duration: s.pulseDuration,
              delay: s.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <svg
              viewBox="-1.3 -1.3 2.6 2.6"
              style={{ width: '100%', height: '100%', overflow: 'visible' }}
            >
              <motion.g
                animate={{ rotate: [0, s.rotateDeg] }}
                transition={{ duration: s.rotateDuration, repeat: Infinity, ease: 'linear' }}
                style={{ originX: '0px', originY: '0px' }}
              >
                <path
                  d={SPARKLE_PATH}
                  fill={`${s.color}${s.fillOpacity})`}
                  style={{ filter: `drop-shadow(0 0 5px ${s.color}1.0)` }}
                />
              </motion.g>
            </svg>
          </motion.div>
        ))}
      </div>
      <main
        data-testid="integration-map"
        className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6"
      >
        <GrowthHeader
          before={state.before_question}
          after={state.after_question}
          delay={STAGE_HEADER_DELAY_S}
        />

        <section
          ref={sectionRef}
          data-testid="integration-structure"
          className="relative mx-auto aspect-[16/7] w-full"
        >
          <ConnectionLines
            centerPoint={layout.centerPoint}
            pairs={pairs}
            baseDelay={STAGE_LINES_DELAY_S}
            highlightedCategoryIndex={highlight?.categoryIndex ?? null}
          />

          <div
            className="grid h-full w-full grid-cols-3 grid-rows-3 gap-2"
            style={{ gridTemplateAreas: layout.gridTemplateAreas }}
          >
            <CenterNode
              label={state.central_concept}
              delay={STAGE_CENTER_DELAY_S}
              gridArea={layout.centerArea}
            />

            {isReady &&
              pairs.map(({ category, slot, index }) => {
                const metrics = getSlotMetrics(slot, layout.centerPoint)
                const offsetX = metrics.centerOffsetXFrac * sectionSize.w
                const offsetY = metrics.centerOffsetYFrac * sectionSize.h
                return (
                  <StructureCard
                    key={`${slot.area}-${category.category_name}`}
                    category={category}
                    gridArea={slot.area}
                    categoryIndex={index}
                    highlightedCategoryIndex={highlight?.categoryIndex ?? null}
                    highlightedElementIndex={highlight?.elementIndex ?? null}
                    centerOffsetX={offsetX}
                    centerOffsetY={offsetY}
                    delay={STAGE_CARDS_DELAY_S + index * CARD_STAGGER_SECONDS}
                  />
                )
              })}
          </div>
        </section>

        {hasIntervention && (
          <InterventionTrace
            userCatalyst={state.user_catalyst}
            delay={STAGE_TRACE_DELAY_S}
            target={highlight}
          />
        )}

        <FeedbackLine praise={state.connective_value_praise} delay={feedbackDelay} />

        {onBack && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: 0.4,
              delay: feedbackDelay + 0.4,
              ease: 'easeOut',
            }}
            className="flex justify-center"
          >
            <button
              type="button"
              data-testid="integration-back"
              onClick={onBack}
              className="rounded-md border border-slate-600 px-6 py-2 text-sm text-slate-300 hover:border-emerald-400 hover:text-emerald-200"
            >
              ステージに戻る
            </button>
          </motion.div>
        )}
      </main>
    </div>
  )
}
