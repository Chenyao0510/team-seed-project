// Bento UI 中心ノード (D15)。`central_concept` の短い名詞句を表示する。
//
// 演出:
//   - 初期: 大きく scale 0 → spring pop-in
//   - 永続装飾: 外側の点線リングが slow 回転、内側コアが breathing pulse
//   - 「ボン」: 全カードが着地するタイミングで親側 useAnimate から flash 発火される
//     （`[data-testid="integration-center"]` を scale + boxShadow キーフレームで叩く）
import { motion } from 'framer-motion'

const POP_DURATION_SECONDS = 0.7
const RING_SPIN_DURATION_SECONDS = 18
const CORE_BREATH_DURATION_SECONDS = 3.5

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
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: POP_DURATION_SECONDS,
        delay,
        type: 'spring',
        stiffness: 220,
        damping: 16,
      }}
      className="relative z-20 flex aspect-square items-center justify-center self-center justify-self-center"
    >
      {/* 外側点線リング: ゆっくり永続回転 */}
      <motion.div
        aria-hidden="true"
        animate={{ rotate: 360 }}
        transition={{
          duration: RING_SPIN_DURATION_SECONDS,
          repeat: Infinity,
          ease: 'linear',
          delay,
        }}
        className="absolute -inset-5 rounded-full border border-dashed border-emerald-300/30"
      />
      {/* 中側ハロー: 永続ブリージング */}
      <motion.div
        aria-hidden="true"
        animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.85, 0.5] }}
        transition={{
          duration: CORE_BREATH_DURATION_SECONDS,
          repeat: Infinity,
          ease: 'easeInOut',
          delay,
        }}
        className="absolute inset-0 rounded-full bg-emerald-300/15 blur-2xl"
      />
      {/* コア: テキストを含む円 */}
      <div className="relative flex h-44 w-44 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400/35 to-emerald-600/25 ring-2 ring-emerald-300/50 backdrop-blur-sm">
        <p className="relative px-4 text-center text-xl font-bold leading-tight tracking-tight text-emerald-50">
          {label}
        </p>
      </div>
    </motion.div>
  )
}
