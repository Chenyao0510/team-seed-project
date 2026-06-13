// Bento UI 中心ノード (D15)。`central_concept` の短い名詞句を pop-in 表示する。
import { motion } from 'framer-motion'

const POP_DURATION_SECONDS = 0.7

interface CenterNodeProps {
  label: string
  delay: number
  gridArea: string
}

export function CenterNode({ label, delay, gridArea }: CenterNodeProps) {
  return (
    <motion.div
      data-testid="integration-center"
      style={{ gridArea }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: POP_DURATION_SECONDS,
        delay,
        type: 'spring',
        stiffness: 220,
        damping: 18,
      }}
      className="z-20 flex aspect-square items-center justify-center self-center justify-self-center"
    >
      <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400/30 to-emerald-600/20 ring-1 ring-emerald-300/40 backdrop-blur-sm">
        <div className="absolute inset-0 rounded-full bg-emerald-300/10 blur-2xl" />
        <p className="relative px-3 text-center text-lg font-semibold leading-tight text-emerald-50">
          {label}
        </p>
      </div>
    </motion.div>
  )
}
