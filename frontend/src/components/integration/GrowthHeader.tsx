// Screen 2 (Integration Map) 上部の Growth Header (D15)。
// Before / After を小さく並べる導入部。主役ではないため Structure Map に対し
// 視覚的な存在感を抑える。
import { motion } from 'framer-motion'

const FADE_DURATION_SECONDS = 0.6

interface GrowthHeaderProps {
  before: string
  after: string
  delay: number
}

export function GrowthHeader({ before, after, delay }: GrowthHeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: FADE_DURATION_SECONDS, delay, ease: 'easeOut' }}
      className="mx-auto flex max-w-3xl items-stretch justify-center gap-4 text-center"
    >
      <div className="flex-1">
        <p
          data-testid="integration-before-label"
          className="mb-1 text-[10px] uppercase tracking-[0.3em] text-slate-500"
        >
          Before
        </p>
        <p
          data-testid="integration-before"
          className="text-sm leading-snug text-slate-400"
        >
          {before}
        </p>
      </div>

      <div className="flex items-center text-emerald-400/70" aria-hidden="true">
        →
      </div>

      <div className="flex-1">
        <p
          data-testid="integration-after-label"
          className="mb-1 text-[10px] uppercase tracking-[0.3em] text-emerald-300"
        >
          After
        </p>
        <p
          data-testid="integration-after"
          className="text-sm font-semibold leading-snug text-slate-100"
        >
          {after}
        </p>
      </div>
    </motion.header>
  )
}
