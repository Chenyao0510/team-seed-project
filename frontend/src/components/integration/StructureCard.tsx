// Bento UI 周辺カード (D15)。`structure_map[].category_name` と elements を表示する。
//
// stagger pop-in は親側の variants からの container 子に乗る形で発火する想定。
import { motion } from 'framer-motion'
import type { IntegrationStructureCategory } from '../../types/state'

const ELEMENT_STAGGER_SECONDS = 0.07

interface StructureCardProps {
  category: IntegrationStructureCategory
  gridArea: string
  categoryIndex: number
  highlightedCategoryIndex: number | null
  highlightedElementIndex: number | null
}

const cardVariants = {
  hidden: { opacity: 0, scale: 0.85, y: 10 },
  shown: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.55, ease: 'easeOut' as const },
  },
}

export function StructureCard({
  category,
  gridArea,
  categoryIndex,
  highlightedCategoryIndex,
  highlightedElementIndex,
}: StructureCardProps) {
  const isHighlightedCard = highlightedCategoryIndex === categoryIndex

  return (
    <motion.article
      data-testid="integration-structure-cell"
      data-highlighted-card={isHighlightedCard ? 'true' : 'false'}
      data-category-index={categoryIndex}
      style={{ gridArea }}
      variants={cardVariants}
      className="z-10 flex flex-col gap-2 self-center justify-self-center rounded-2xl bg-slate-900/40 px-5 py-4 ring-1 ring-slate-700/40 backdrop-blur-sm"
    >
      <h3 className="text-xs uppercase tracking-wider text-slate-400">
        {category.category_name}
      </h3>
      <ul className="space-y-1">
        {category.elements.map((element, elementIndex) => {
          const isHighlightedElement =
            isHighlightedCard && elementIndex === highlightedElementIndex
          return (
            <motion.li
              key={`${category.category_name}-${element}`}
              data-testid="integration-structure-element"
              data-highlighted={isHighlightedElement ? 'true' : 'false'}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.4,
                delay: (elementIndex + 1) * ELEMENT_STAGGER_SECONDS,
                ease: 'easeOut',
              }}
              className={
                isHighlightedElement
                  ? 'text-base font-semibold text-amber-200'
                  : 'text-sm text-slate-200'
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
