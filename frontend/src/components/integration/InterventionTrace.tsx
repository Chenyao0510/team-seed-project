// ユーザー介入トレース (D15) の ★ ラベル本体。
//
// 「中心 → 該当カテゴリ → 該当 element」の sequential 発光は親 IntegrationMap.tsx の
// `useAnimate` で集中制御するため、ここでは静的なマークアップだけを担う。
import { motion } from 'framer-motion'
import type { HighlightTarget } from '../../lib/integrationLayout'

const LABEL_FADE_DURATION_SECONDS = 0.5

interface InterventionTraceProps {
  userCatalyst: string
  delay: number
  target: HighlightTarget
}

export function InterventionTrace({
  userCatalyst,
  delay,
  target,
}: InterventionTraceProps) {
  return (
    <motion.div
      data-testid="integration-trace"
      data-target-category={target.categoryIndex}
      data-target-element={target.elementIndex}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: LABEL_FADE_DURATION_SECONDS,
        delay,
        ease: 'easeOut',
      }}
      className="mx-auto flex max-w-3xl items-center justify-center gap-2 text-center"
    >
      <span
        data-trace-stage="star"
        className="text-amber-300"
        aria-hidden="true"
      >
        ★
      </span>
      <p
        data-testid="integration-catalyst"
        className="text-sm font-medium text-amber-200"
      >
        あなたの介入「{userCatalyst}」
      </p>
    </motion.div>
  )
}

// チェーン完了までの所要時間（FeedbackLine の表示遅延計算に使う）。
// `★ → 中心パルス → カードパルス → 要素パルス` の和。
export const INTERVENTION_CHAIN_DURATION_SECONDS = 0.4 * 4
