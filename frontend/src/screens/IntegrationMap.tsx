// Screen 2 (Integration Map) 司令塔 (D15)。
//
// 構成: GrowthHeader → Structure Map (中心 + 周辺 + 関係線) → InterventionTrace → FeedbackLine
// アニメ順序は STAGE_*_DELAY 定数で定義する（マジックナンバー禁止, CONSTRAINTS.md）。
import { useEffect } from 'react'
import { motion, useAnimate } from 'framer-motion'
import type { IntegrationState } from '../types/state'
import {
  findHighlightTarget,
  getIntegrationLayout,
  pairCategoriesWithSlots,
} from '../lib/integrationLayout'
import { GrowthHeader } from '../components/integration/GrowthHeader'
import { CenterNode } from '../components/integration/CenterNode'
import { StructureCard } from '../components/integration/StructureCard'
import { ConnectionLines } from '../components/integration/ConnectionLines'
import {
  INTERVENTION_CHAIN_DURATION_SECONDS,
  InterventionTrace,
} from '../components/integration/InterventionTrace'
import { FeedbackLine } from '../components/integration/FeedbackLine'

// stage 開始時刻 (秒)。0 を基点にした単調増加列で「構造が組み上がる」順序を表現する。
const STAGE_HEADER_DELAY_S = 0.0
const STAGE_CENTER_DELAY_S = 0.6
const STAGE_CARDS_DELAY_S = 1.2
const STAGE_LINES_DELAY_S = 2.0
const STAGE_TRACE_DELAY_S = 2.8
const FEEDBACK_AFTER_TRACE_GAP_S = 0.4
const FEEDBACK_AFTER_LINES_GAP_S = 0.8

// 周辺カードの stagger 間隔。Framer Motion の variants が拾う。
const CARD_STAGGER_SECONDS = 0.18

// 介入チェーンの各パルスの所要時間。
const PULSE_DURATION_SECONDS = 0.4

interface IntegrationMapProps {
  state: IntegrationState
  onBack?: () => void
}

const cardsContainerVariants = {
  hidden: {},
  shown: {
    transition: {
      staggerChildren: CARD_STAGGER_SECONDS,
    },
  },
}

export function IntegrationMap({ state, onBack }: IntegrationMapProps) {
  const layout = getIntegrationLayout(state.structure_map.length)
  const pairs = pairCategoriesWithSlots(state.structure_map, layout)
  const highlight = findHighlightTarget(state.structure_map)
  const hasIntervention = highlight !== null

  const feedbackDelay = hasIntervention
    ? STAGE_TRACE_DELAY_S +
      INTERVENTION_CHAIN_DURATION_SECONDS +
      FEEDBACK_AFTER_TRACE_GAP_S
    : STAGE_LINES_DELAY_S + FEEDBACK_AFTER_LINES_GAP_S

  // 介入チェーン: ★ → 中心ノード → 該当カード → 該当 element の順にパルス発光させる。
  // sequential 発火を保証するため useAnimate の sequence API を使う。
  const [scope, animate] = useAnimate<HTMLDivElement>()

  useEffect(() => {
    if (!hasIntervention) return
    const timer = window.setTimeout(
      () => {
        void animate([
          [
            '[data-trace-stage="star"]',
            { scale: [1, 1.4, 1] },
            { duration: PULSE_DURATION_SECONDS, ease: 'easeOut' },
          ],
          [
            '[data-testid="integration-center"]',
            { scale: [1, 1.08, 1] },
            { duration: PULSE_DURATION_SECONDS, ease: 'easeOut', at: '<' },
          ],
          [
            '[data-highlighted-card="true"]',
            {
              boxShadow: [
                '0 0 0 rgba(245, 158, 11, 0)',
                '0 0 28px rgba(245, 158, 11, 0.55)',
                '0 0 0 rgba(245, 158, 11, 0)',
              ],
            },
            { duration: PULSE_DURATION_SECONDS, ease: 'easeOut' },
          ],
          [
            '[data-highlighted="true"]',
            {
              scale: [1, 1.12, 1],
              textShadow: [
                '0 0 0 rgba(252, 211, 77, 0)',
                '0 0 14px rgba(252, 211, 77, 0.9)',
                '0 0 0 rgba(252, 211, 77, 0)',
              ],
            },
            { duration: PULSE_DURATION_SECONDS, ease: 'easeOut' },
          ],
        ])
      },
      // ★ ラベル本体が表示し終わる頃にチェーン開始
      (STAGE_TRACE_DELAY_S + 0.3) * 1000,
    )
    return () => window.clearTimeout(timer)
  }, [animate, hasIntervention])

  return (
    <div
      ref={scope}
      className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100"
    >
      <main
        data-testid="integration-map"
        className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10"
      >
        <GrowthHeader
          before={state.before_question}
          after={state.after_question}
          delay={STAGE_HEADER_DELAY_S}
        />

        <section
          data-testid="integration-structure"
          className="relative mx-auto aspect-[16/10] w-full"
        >
          <ConnectionLines
            centerPoint={layout.centerPoint}
            pairs={pairs}
            baseDelay={STAGE_LINES_DELAY_S}
            highlightedCategoryIndex={highlight?.categoryIndex ?? null}
          />

          <motion.div
            variants={cardsContainerVariants}
            initial="hidden"
            animate="shown"
            transition={{ delayChildren: STAGE_CARDS_DELAY_S }}
            className="grid h-full w-full grid-cols-3 grid-rows-3 gap-2"
            style={{ gridTemplateAreas: layout.gridTemplateAreas }}
          >
            <CenterNode
              label={state.central_concept}
              delay={STAGE_CENTER_DELAY_S}
              gridArea={layout.centerArea}
            />

            {pairs.map(({ category, slot, index }) => (
              <StructureCard
                key={`${slot.area}-${category.category_name}`}
                category={category}
                gridArea={slot.area}
                categoryIndex={index}
                highlightedCategoryIndex={highlight?.categoryIndex ?? null}
                highlightedElementIndex={highlight?.elementIndex ?? null}
              />
            ))}
          </motion.div>
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
