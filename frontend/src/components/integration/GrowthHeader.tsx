// Screen 2 (Integration Map) 上部の Growth Header (D15)。
//
// Before / After を色付き背景ブロックで表現。
// After が Before より面積を広く取ることで「成長・拡張」を視覚的に伝える。
// Before: 35% 幅 / スレートトーン  After: 65% 幅 / エメラルドトーン
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
      className="mx-auto flex max-w-3xl items-stretch gap-0 overflow-hidden rounded-xl"
    >
      {/* Before ブロック: 35% 幅・暗いスレート */}
      <div
        className="relative flex w-[35%] flex-col justify-center px-5 py-4"
        style={{
          background: 'linear-gradient(135deg, rgba(30,41,59,0.9) 0%, rgba(15,23,42,0.95) 100%)',
          borderRight: '1px solid rgba(100,116,139,0.25)',
        }}
      >
        {/* 左端アクセントライン */}
        <div className="absolute left-0 top-0 h-full w-0.5 bg-slate-600/60" />
        <p
          data-testid="integration-before-label"
          className="mb-1.5 text-[9px] font-black uppercase tracking-[0.3em] text-slate-500"
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

      {/* 矢印区切り */}
      <div
        className="flex shrink-0 items-center justify-center px-3"
        style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(6,36,30,0.90) 100%)' }}
        aria-hidden="true"
      >
        <span className="text-base text-emerald-400/70">→</span>
      </div>

      {/* After ブロック: 65% 幅・エメラルドトーン */}
      <div
        className="relative flex flex-1 flex-col justify-center px-5 py-4"
        style={{
          background: 'linear-gradient(135deg, rgba(6,36,30,0.90) 0%, rgba(2,44,34,0.85) 60%, rgba(4,60,46,0.80) 100%)',
          boxShadow: 'inset 0 0 40px rgba(52,211,153,0.06)',
        }}
      >
        {/* 右端アクセントライン */}
        <div className="absolute right-0 top-0 h-full w-0.5 bg-emerald-500/40" />
        {/* 右上コーナーグロー */}
        <div
          className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full opacity-40"
          style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.3) 0%, transparent 70%)' }}
        />
        <p
          data-testid="integration-after-label"
          className="mb-1.5 text-[9px] font-black uppercase tracking-[0.3em] text-emerald-400"
        >
          After
        </p>
        <p
          data-testid="integration-after"
          className="text-base font-bold leading-snug text-slate-100"
        >
          {after}
        </p>
      </div>
    </motion.header>
  )
}
