// SetupScreen 右側の「殿堂（テンプレートから追加）」パネル (T5A / D16)。
//
// Temple of Intellect テーマに合わせ、ガラスモーフィズム + ゴールドの細枠で
// 哲学者の胸像が並ぶ「神殿の控えの間」をイメージ。マウント時に
// `/api/character_templates` を 1 回だけ fetch。既に追加済みの slug は disabled。
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  getCharacterTemplates,
  type CharacterTemplate,
} from '../../api/client'

interface CharacterTemplatePanelProps {
  /** 既に members に追加済みの表示名のセット。disabled 判定に使う。 */
  addedNames: Set<string>
  onPick: (template: CharacterTemplate) => void
}

const FONT_TITLE = "'Cinzel', 'Noto Serif JP', 'Georgia', serif"
const FONT_JP_SERIF = "'Noto Serif JP', 'Georgia', serif"
const COLOR_GOLD_DEEP = '#8c6f3a'
const COLOR_INK = '#2a2113'
const COLOR_INK_SOFT = '#6b5d44'

const PANEL_FADE_DELAY_S = 1.5
const PANEL_FADE_DURATION_S = 0.6

export function CharacterTemplatePanel({
  addedNames,
  onPick,
}: CharacterTemplatePanelProps) {
  const [templates, setTemplates] = useState<CharacterTemplate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getCharacterTemplates()
      .then((items) => {
        if (cancelled) return
        setTemplates(items)
        setError(null)
      })
      .catch(() => {
        if (cancelled) return
        setTemplates([])
        setError('テンプレートを読み込めませんでした。')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <motion.aside
      data-testid="character-template-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: PANEL_FADE_DURATION_S,
        delay: PANEL_FADE_DELAY_S,
        ease: 'easeOut',
      }}
      className="relative overflow-hidden rounded-2xl p-6"
      style={{
        background: 'linear-gradient(155deg, rgba(255,253,247,0.72) 0%, rgba(248,240,222,0.62) 100%)',
        border: '1px solid rgba(201,169,110,0.40)',
        boxShadow:
          '0 10px 30px -12px rgba(60,40,10,0.18), inset 0 0 0 1px rgba(255,255,255,0.4)',
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* 上部の金線アクセント */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-700/50 to-transparent" />

      <header className="mb-4">
        <p
          className="mb-1 text-[10px] uppercase"
          style={{
            fontFamily: FONT_TITLE,
            fontWeight: 600,
            letterSpacing: '0.42em',
            color: COLOR_GOLD_DEEP,
          }}
        >
          Hall of Sages
        </p>
        <h2
          className="text-base"
          style={{
            fontFamily: FONT_JP_SERIF,
            fontWeight: 700,
            letterSpacing: '0.18em',
            color: COLOR_INK,
          }}
        >
          殿堂より召喚
        </h2>
        <p
          className="mt-1 text-[11px]"
          style={{ color: COLOR_INK_SOFT, letterSpacing: '0.05em' }}
        >
          一押しで AI 生成をスキップし、<br></br>議会へ招待します。
        </p>
      </header>

      {loading ? (
        <p
          data-testid="character-template-loading"
          className="py-8 text-center text-xs"
          style={{ color: COLOR_INK_SOFT, letterSpacing: '0.18em' }}
        >
          ◇ 召喚中 ◇
        </p>
      ) : templates.length === 0 ? (
        <p
          data-testid="character-template-empty"
          className="py-8 text-center text-xs"
          style={{ color: COLOR_INK_SOFT }}
        >
          {error ?? '殿堂は静まり返っています。'}
        </p>
      ) : (
        <ul
          data-testid="character-template-list"
          className="grid grid-cols-2 gap-2.5"
        >
          {templates.map((tpl) => {
            const isAdded = addedNames.has(tpl.name)
            return (
              <li key={tpl.slug}>
                <motion.button
                  type="button"
                  data-testid="character-template-item"
                  data-slug={tpl.slug}
                  data-added={isAdded ? 'true' : 'false'}
                  onClick={() => onPick(tpl)}
                  disabled={isAdded}
                  whileHover={isAdded ? undefined : { y: -2 }}
                  whileTap={isAdded ? undefined : { scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed"
                  style={{
                    background: isAdded
                      ? 'rgba(232,219,191,0.5)'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(252,243,220,0.45) 100%)',
                    border: `1px solid ${isAdded ? 'rgba(180,160,120,0.25)' : 'rgba(201,169,110,0.55)'}`,
                    boxShadow: isAdded
                      ? 'none'
                      : '0 4px 14px -8px rgba(140,111,58,0.30), inset 0 0 0 1px rgba(255,255,255,0.5)',
                    color: isAdded ? '#a89473' : COLOR_INK,
                  }}
                  aria-label={`${tpl.name} を追加`}
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full"
                    style={{
                      background: 'rgba(255,253,247,0.6)',
                      boxShadow:
                        '0 0 0 1.5px rgba(201,169,110,0.7), 0 0 0 3px rgba(255,253,247,0.6)',
                    }}
                  >
                    <img
                      src={tpl.avatar_url}
                      alt={tpl.name}
                      className="h-full w-full object-cover object-top"
                    />
                  </span>
                  <span className="flex-1 leading-tight">
                    <span
                      className="block text-xs"
                      style={{
                        fontFamily: FONT_JP_SERIF,
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                      }}
                    >
                      {tpl.name}
                    </span>
                    {isAdded && (
                      <span
                        className="block text-[10px]"
                        style={{ color: '#a89473', letterSpacing: '0.1em' }}
                      >
                        召喚済
                      </span>
                    )}
                  </span>
                </motion.button>
              </li>
            )
          })}
        </ul>
      )}

      {/* 下部の金線アクセント */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-700/40 to-transparent" />
    </motion.aside>
  )
}
