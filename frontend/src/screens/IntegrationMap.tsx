import { motion } from 'framer-motion'
import type { IntegrationState, IntegrationStructureCategory } from '../types/state'

// Stagger 構築タイミング（命名定数, CONSTRAINTS.md: マジックナンバー禁止）
const FADE_DURATION_SECONDS = 0.6
const STAGGER_DELAY_SECONDS = 0.35
const STRUCTURE_STAGGER_SECONDS = 0.18
const ELEMENT_STAGGER_SECONDS = 0.08

// Stage 順序: Before → 矢印 → After → Structure → Catalyst → Praise
const STAGE_BEFORE_INDEX = 0
const STAGE_ARROW_INDEX = 1
const STAGE_AFTER_INDEX = 2
const STAGE_STRUCTURE_INDEX = 3
const STAGE_CATALYST_INDEX = 4
const STAGE_PRAISE_INDEX = 5

interface IntegrationMapProps {
  state: IntegrationState
  onBack?: () => void
}

export function IntegrationMap({ state, onBack }: IntegrationMapProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <main
        data-testid="integration-map"
        className="mx-auto flex max-w-5xl flex-col gap-16 px-6 py-16"
      >
        <SectionFade delay={stageDelay(STAGE_BEFORE_INDEX)}>
          <p
            data-testid="integration-before-label"
            className="mb-2 text-xs uppercase tracking-[0.3em] text-slate-500"
          >
            Before
          </p>
          <p
            data-testid="integration-before"
            className="text-xl leading-relaxed text-slate-400"
          >
            {state.before_question}
          </p>
        </SectionFade>

        <SectionFade delay={stageDelay(STAGE_ARROW_INDEX)}>
          <div className="flex justify-center" aria-hidden="true">
            <span className="text-3xl text-emerald-400/70">↓</span>
          </div>
        </SectionFade>

        <SectionFade delay={stageDelay(STAGE_AFTER_INDEX)}>
          <p
            data-testid="integration-after-label"
            className="mb-2 text-xs uppercase tracking-[0.3em] text-emerald-300"
          >
            After
          </p>
          <p
            data-testid="integration-after"
            className="text-3xl font-semibold leading-snug text-slate-50"
          >
            {state.after_question}
          </p>
        </SectionFade>

        <StructureGrid
          categories={state.structure_map}
          baseDelay={stageDelay(STAGE_STRUCTURE_INDEX)}
        />

        <SectionFade delay={stageDelay(STAGE_CATALYST_INDEX)}>
          <p className="mb-2 text-xs uppercase tracking-[0.3em] text-amber-300">
            User Catalyst
          </p>
          <p
            data-testid="integration-catalyst"
            className="text-2xl font-semibold text-amber-200"
          >
            「{state.user_catalyst}」
          </p>
        </SectionFade>

        <SectionFade delay={stageDelay(STAGE_PRAISE_INDEX)}>
          <p
            data-testid="integration-praise"
            className="text-lg leading-relaxed text-emerald-100"
          >
            {state.connective_value_praise}
          </p>
        </SectionFade>

        {onBack && (
          <SectionFade delay={stageDelay(STAGE_PRAISE_INDEX) + STAGGER_DELAY_SECONDS}>
            <div className="flex justify-center">
              <button
                type="button"
                data-testid="integration-back"
                onClick={onBack}
                className="rounded-md border border-slate-600 px-6 py-2 text-sm text-slate-300 hover:border-emerald-400 hover:text-emerald-200"
              >
                ステージに戻る
              </button>
            </div>
          </SectionFade>
        )}
      </main>
    </div>
  )
}

function stageDelay(index: number): number {
  return index * STAGGER_DELAY_SECONDS
}

interface SectionFadeProps {
  delay: number
  children: React.ReactNode
}

function SectionFade({ delay, children }: SectionFadeProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: FADE_DURATION_SECONDS, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.section>
  )
}

interface StructureGridProps {
  categories: IntegrationStructureCategory[]
  baseDelay: number
}

function StructureGrid({ categories, baseDelay }: StructureGridProps) {
  return (
    <section
      data-testid="integration-structure"
      className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
    >
      {categories.map((category, index) => (
        <StructureCell
          key={category.category_name}
          category={category}
          delay={baseDelay + index * STRUCTURE_STAGGER_SECONDS}
        />
      ))}
    </section>
  )
}

interface StructureCellProps {
  category: IntegrationStructureCategory
  delay: number
}

function StructureCell({ category, delay }: StructureCellProps) {
  return (
    <motion.article
      data-testid="integration-structure-cell"
      initial={{ opacity: 0, scale: 0.92, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: FADE_DURATION_SECONDS, delay, ease: 'easeOut' }}
      className="flex flex-col gap-3"
    >
      <h3 className="text-xs uppercase tracking-wider text-slate-400">
        {category.category_name}
      </h3>
      <ul className="space-y-2">
        {category.elements.map((element, elementIndex) => {
          const isHighlighted = elementIndex === category.highlighted_element_index
          return (
            <motion.li
              key={`${category.category_name}-${element}`}
              data-testid="integration-structure-element"
              data-highlighted={isHighlighted ? 'true' : 'false'}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: FADE_DURATION_SECONDS,
                delay: delay + (elementIndex + 1) * ELEMENT_STAGGER_SECONDS,
                ease: 'easeOut',
              }}
              className={
                isHighlighted
                  ? 'text-lg font-semibold text-amber-200'
                  : 'text-base text-slate-200'
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
