// Screen 2 末尾の Feedback Line (D15)。`connective_value_praise` を 1〜2 行で表示する。
import { motion } from 'framer-motion'

const FADE_DURATION_SECONDS = 0.6

interface FeedbackLineProps {
  praise: string
  delay: number
}

export function FeedbackLine({ praise, delay }: FeedbackLineProps) {
  return (
    <motion.p
      data-testid="integration-praise"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: FADE_DURATION_SECONDS, delay, ease: 'easeOut' }}
      className="mx-auto max-w-3xl text-center text-sm leading-relaxed text-emerald-100/90"
    >
      {praise}
    </motion.p>
  )
}
