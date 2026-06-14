// Screen 0 (Setup) — Temple of Intellect。
//
// 「アテネの神殿 × ゼルダ (BotW/TotK)」の融合をテーマに、Bento Grid + ガラス
// モーフィズム + シャンパンゴールド/ディープブルーで構成する。マウント時の
// カーテンリビール（左右からの紺幕が中央へ向けて開く）と、submit 時の神殿の
// 門の閉門演出 (DebateStage への切り替えメタファ) を持つ。
//
// 既存の挙動 (props / SetupResult / addCharacter パイプライン / data-testid) は
// 完全に維持する。CONSTRAINTS.md: マジックナンバー禁止のためアニメ秒数は定数化。
import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { addCharacter, type CharacterTemplate } from '../api/client'
import { CharacterTemplatePanel } from '../components/setup/CharacterTemplatePanel'
import type { Gender } from '../types/state'

export interface SetupMember {
  name: string
  avatarUrl: string | null
  // T69: TTS 話者プール用。`/api/add_character` レスポンスまたはテンプレイトに静的定義された値。
  gender?: Gender
  // T72: 発言生成プロンプト用ペルソナ。
  persona?: string
}

export interface SetupResult {
  theme: string
  members: SetupMember[]
  // T58: ユーザー自身のアバター（任意）。未登録なら null。
  userAvatarUrl: string | null
}

type UserAvatarMode = 'upload' | 'generate'

interface SetupScreenProps {
  onSubmit?: (result: SetupResult) => void
}

// ── Temple 配色／タイポ定数 (マジックナンバー禁止) ──
const FONT_TITLE = "'Cinzel', 'Noto Serif JP', 'Georgia', serif"
const FONT_JP_SERIF = "'Noto Serif JP', 'Georgia', serif"
const FONT_BODY = "'Montserrat', 'Noto Sans JP', system-ui, sans-serif"

const COLOR_GOLD = '#c9a96e'
const COLOR_GOLD_DEEP = '#8c6f3a'
const COLOR_DEEP_BLUE = '#1a2742'
const COLOR_DEEP_BLUE_DARK = '#0a1428'
const COLOR_INK = '#2a2113'
const COLOR_INK_SOFT = '#6b5d44'
const COLOR_INK_MUTED = '#9e8d6f'

// ── アニメ秒数 ──
const CURTAIN_REVEAL_SECONDS = 1.15
const GATE_CLOSE_SECONDS = 1.0
const STAGGER_BASE_DELAY_S = CURTAIN_REVEAL_SECONDS - 0.25 // カーテン終盤に重ねて UI を立ち上げる
const STAGGER_STEP_S = 0.15

export function SetupScreen({ onSubmit }: SetupScreenProps) {
  const [theme, setTheme] = useState('')
  const [memberInput, setMemberInput] = useState('')
  const [members, setMembers] = useState<SetupMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState<Set<string>>(new Set())
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
  const [userAvatarGenerating, setUserAvatarGenerating] = useState(false)
  const [gatesClosing, setGatesClosing] = useState(false)

  const trimmedInput = memberInput.trim()
  const canAdd =
    trimmedInput.length > 0 && !members.some((m) => m.name === trimmedInput)
  const isAvatarLoading = loadingMembers.size > 0 || userAvatarGenerating
  const canSubmit =
    theme.trim().length > 0 && members.length >= 2 && !isAvatarLoading

  const addMember = () => {
    if (!canAdd) return
    const name = trimmedInput
    setMembers((prev) => [...prev, { name, avatarUrl: null }])
    setMemberInput('')

    setLoadingMembers((prev) => new Set(prev).add(name))
    addCharacter(name)
      .then(({ avatar_url, gender, persona }) => {
        setMembers((prev) =>
          prev.map((m) =>
            m.name === name
              ? { ...m, avatarUrl: avatar_url, gender, persona }
              : m,
          ),
        )
      })
      .catch(() => {
        // バックエンド未起動・エラー時はプレースホルダー表示のまま続行する
      })
      .finally(() => {
        setLoadingMembers((prev) => {
          const next = new Set(prev)
          next.delete(name)
          return next
        })
      })
  }

  const removeMember = (name: string) => {
    setMembers((prev) => prev.filter((m) => m.name !== name))
  }

  // T5A: 事前生成テンプレートからの追加。動的アバター生成パイプライン
  // (`addCharacter`) を呼ばずに、解決済み avatar_url ごと members に push する。
  const addMemberByTemplate = (template: CharacterTemplate) => {
    if (members.some((m) => m.name === template.name)) return
    setMembers((prev) => [
      ...prev,
      {
        name: template.name,
        avatarUrl: template.avatar_url,
        gender: template.gender,
        persona: template.persona,
      },
    ])
  }

  const submit = () => {
    if (!canSubmit || gatesClosing) return
    setGatesClosing(true)
    // 門の閉門アニメ完了後に親へ通知 → DebateStage に切り替わる
    window.setTimeout(() => {
      onSubmit?.({ theme: theme.trim(), members, userAvatarUrl })
    }, GATE_CLOSE_SECONDS * 1000)
  }

  const addedNames = new Set(members.map((m) => m.name))

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{
        background: `
          radial-gradient(ellipse 90% 60% at 50% -10%, rgba(255, 238, 196, 0.55) 0%, transparent 60%),
          radial-gradient(ellipse 60% 50% at 50% 110%, rgba(26, 39, 66, 0.10) 0%, transparent 70%),
          linear-gradient(170deg, #fbf7ee 0%, #f3eddc 45%, #e8ddc1 100%)
        `,
        fontFamily: FONT_BODY,
        color: COLOR_INK,
      }}
    >
      <MarbleTexture />
      <PillarSilhouettes />
      <GoldenEntablature />

      <main className="relative mx-auto max-w-6xl px-6 py-12 lg:py-16">
        <TempleHeader />

        <ThemeAltar theme={theme} setTheme={setTheme} />

        <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <CouncilTile
            members={members}
            memberInput={memberInput}
            setMemberInput={setMemberInput}
            addMember={addMember}
            removeMember={removeMember}
            canAdd={canAdd}
            loadingMembers={loadingMembers}
          />
          <CharacterTemplatePanel
            addedNames={addedNames}
            onPick={addMemberByTemplate}
          />
        </div>

        <UserPresenceTile
          avatarUrl={userAvatarUrl}
          onChange={setUserAvatarUrl}
          onGeneratingChange={setUserAvatarGenerating}
        />

        <GateButton
          disabled={!canSubmit}
          loading={isAvatarLoading}
          armed={gatesClosing}
          onClick={submit}
        />
      </main>

      <CurtainReveal />

      <AnimatePresence>
        {gatesClosing && <GateCloseOverlay key="gate-close" />}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 背景チャンク (大理石 / 柱 / エンタブラチュア)
// ─────────────────────────────────────────────────────────────

function MarbleTexture() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full mix-blend-multiply"
      aria-hidden="true"
      style={{ opacity: 0.06 }}
    >
      <filter id="marble-noise">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.012"
          numOctaves="2"
          seed="7"
        />
        <feColorMatrix
          values="0 0 0 0 0.55  0 0 0 0 0.42  0 0 0 0 0.22  0 0 0 1 0"
        />
      </filter>
      <rect width="100%" height="100%" filter="url(#marble-noise)" />
    </svg>
  )
}

function PillarSilhouettes() {
  // 神殿の柱を左右の余白に薄く配置。Bento の中央列に視線が向くよう脇役に留める。
  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 right-0">
      <div
        className="absolute left-0 top-0 hidden h-full w-24 lg:block"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, rgba(140,111,58,0.0) 0px, rgba(140,111,58,0.10) 6px, rgba(140,111,58,0.0) 12px)',
          maskImage:
            'linear-gradient(to right, rgba(0,0,0,0.40), transparent)',
          WebkitMaskImage:
            'linear-gradient(to right, rgba(0,0,0,0.40), transparent)',
        }}
      />
      <div
        className="absolute right-0 top-0 hidden h-full w-24 lg:block"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, rgba(140,111,58,0.0) 0px, rgba(140,111,58,0.10) 6px, rgba(140,111,58,0.0) 12px)',
          maskImage:
            'linear-gradient(to left, rgba(0,0,0,0.40), transparent)',
          WebkitMaskImage:
            'linear-gradient(to left, rgba(0,0,0,0.40), transparent)',
        }}
      />
    </div>
  )
}

function GoldenEntablature() {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-amber-700/50 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-[6px] h-px bg-gradient-to-r from-transparent via-amber-600/30 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-700/40 to-transparent" />
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// セクション部品
// ─────────────────────────────────────────────────────────────

function TempleHeader() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: STAGGER_BASE_DELAY_S, ease: 'easeOut' }}
      className="text-center"
    >
      <OrnamentRow />
      <h1
        className="select-none"
        style={{
          fontFamily: FONT_TITLE,
          fontSize: 'clamp(1.6rem, 3.2vw, 2.6rem)',
          fontWeight: 600,
          letterSpacing: '0.34em',
          color: COLOR_DEEP_BLUE,
          textShadow: '0 2px 18px rgba(201,169,110,0.22)',
        }}
      >
        AGORA
      </h1>
      <p
        className="mt-3 text-xs sm:text-sm"
        style={{
          fontFamily: FONT_JP_SERIF,
          letterSpacing: '0.5em',
          color: COLOR_INK_SOFT,
        }}
      >
        知性の神殿へ
      </p>
      <OrnamentRow tight />
    </motion.header>
  )
}

function OrnamentRow({ tight = false }: { tight?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center gap-3 ${
        tight ? 'mt-4' : 'mb-3'
      }`}
      aria-hidden="true"
    >
      <span
        className={`h-px ${tight ? 'w-20' : 'w-16'} bg-gradient-to-r from-transparent`}
        style={{ background: `linear-gradient(to right, transparent, ${COLOR_GOLD_DEEP}80)` }}
      />
      <span
        className={tight ? 'text-[8px]' : 'text-[10px]'}
        style={{ color: COLOR_GOLD_DEEP, opacity: 0.85 }}
      >
        ◆
      </span>
      <span
        className={`h-px ${tight ? 'w-20' : 'w-16'}`}
        style={{ background: `linear-gradient(to left, transparent, ${COLOR_GOLD_DEEP}80)` }}
      />
    </div>
  )
}

interface ThemeAltarProps {
  theme: string
  setTheme: (value: string) => void
}

function ThemeAltar({ theme, setTheme }: ThemeAltarProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.7,
        delay: STAGGER_BASE_DELAY_S + STAGGER_STEP_S,
        ease: 'easeOut',
      }}
      className="mx-auto mt-10 max-w-3xl text-center"
    >
      <label
        htmlFor="theme"
        className="mb-4 inline-block text-[11px] uppercase"
        style={{
          fontFamily: FONT_TITLE,
          fontWeight: 600,
          letterSpacing: '0.46em',
          color: COLOR_GOLD_DEEP,
        }}
      >
        Today&apos;s Question — 本日の論題
      </label>
      <div className="relative">
        <input
          id="theme"
          type="text"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="例: 大学は必要か？"
          className="w-full bg-transparent text-center outline-none"
          style={{
            fontFamily: FONT_JP_SERIF,
            fontSize: 'clamp(1.25rem, 2.6vw, 1.85rem)',
            fontWeight: 500,
            color: COLOR_DEEP_BLUE,
            letterSpacing: '0.06em',
            padding: '0.6rem 0',
            border: 'none',
          }}
        />
        <div
          className="mx-auto h-px w-full"
          style={{
            background: `linear-gradient(to right, transparent, ${COLOR_GOLD}, transparent)`,
          }}
        />
        <div
          className="mx-auto mt-1 h-px w-2/3"
          style={{
            background: `linear-gradient(to right, transparent, ${COLOR_GOLD_DEEP}55, transparent)`,
          }}
        />
      </div>
    </motion.section>
  )
}

interface CouncilTileProps {
  members: SetupMember[]
  memberInput: string
  setMemberInput: (v: string) => void
  addMember: () => void
  removeMember: (name: string) => void
  canAdd: boolean
  loadingMembers: Set<string>
}

function CouncilTile({
  members,
  memberInput,
  setMemberInput,
  addMember,
  removeMember,
  canAdd,
  loadingMembers,
}: CouncilTileProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.7,
        delay: STAGGER_BASE_DELAY_S + STAGGER_STEP_S * 2,
        ease: 'easeOut',
      }}
      className="relative overflow-hidden rounded-2xl p-6"
      style={{
        background:
          'linear-gradient(155deg, rgba(255,253,247,0.72) 0%, rgba(248,240,222,0.62) 100%)',
        border: '1px solid rgba(201,169,110,0.40)',
        boxShadow:
          '0 10px 30px -12px rgba(60,40,10,0.18), inset 0 0 0 1px rgba(255,255,255,0.4)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-700/50 to-transparent" />

      <TileHeader
        kicker="The Council"
        title="議会を編成"
        hint="議論に参加させる人物を 2 名以上"
      />

      <div className="mb-5 flex gap-2">
        <input
          id="member"
          type="text"
          value={memberInput}
          onChange={(e) => setMemberInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addMember()
            }
          }}
          placeholder="例: ソクラテス"
          className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          style={{
            fontFamily: FONT_JP_SERIF,
            color: COLOR_DEEP_BLUE,
            border: '1px solid rgba(201,169,110,0.45)',
            borderRadius: '0.5rem',
            background: 'rgba(255,255,255,0.5)',
            letterSpacing: '0.03em',
          }}
        />
        <motion.button
          type="button"
          onClick={addMember}
          disabled={!canAdd}
          whileHover={canAdd ? { y: -1 } : undefined}
          whileTap={canAdd ? { scale: 0.97 } : undefined}
          className="shrink-0 rounded-lg px-5 py-2 text-sm transition-colors disabled:cursor-not-allowed"
          style={{
            fontFamily: FONT_TITLE,
            fontWeight: 600,
            letterSpacing: '0.18em',
            color: canAdd ? '#fffaf0' : '#bfae8a',
            background: canAdd
              ? `linear-gradient(180deg, ${COLOR_GOLD} 0%, ${COLOR_GOLD_DEEP} 100%)`
              : 'rgba(232,219,191,0.6)',
            border: `1px solid ${canAdd ? COLOR_GOLD_DEEP : 'rgba(180,160,120,0.35)'}`,
            boxShadow: canAdd
              ? '0 6px 16px -6px rgba(140,111,58,0.45), inset 0 0 0 1px rgba(255,245,210,0.4)'
              : 'none',
          }}
        >
          召喚
        </motion.button>
      </div>

      {members.length === 0 ? (
        <p
          data-testid="member-list-empty"
          className="rounded-xl py-10 text-center text-xs"
          style={{
            color: COLOR_INK_MUTED,
            letterSpacing: '0.18em',
            border: '1px dashed rgba(201,169,110,0.35)',
            background: 'rgba(255,253,247,0.35)',
          }}
        >
          ◇ まだ誰も議会に集っていません ◇
        </p>
      ) : (
        <ul
          data-testid="member-list"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          {members.map((member) => (
            <MemberCard
              key={member.name}
              member={member}
              loading={loadingMembers.has(member.name)}
              onRemove={() => removeMember(member.name)}
            />
          ))}
        </ul>
      )}
    </motion.section>
  )
}

interface MemberCardProps {
  member: SetupMember
  loading: boolean
  onRemove: () => void
}

function MemberCard({ member, loading, onRemove }: MemberCardProps) {
  const { name, avatarUrl } = member
  return (
    <motion.li
      data-testid="member-list-item"
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 360, damping: 26 }}
      className="group relative flex flex-col items-center gap-2 rounded-2xl px-3 py-4"
      style={{
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(252,243,220,0.5) 100%)',
        border: '1px solid rgba(201,169,110,0.45)',
        boxShadow:
          '0 6px 18px -10px rgba(140,111,58,0.30), inset 0 0 0 1px rgba(255,255,255,0.4)',
      }}
    >
      <span
        data-testid="member-avatar"
        className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full"
        style={{
          background: 'rgba(255,253,247,0.7)',
          boxShadow:
            '0 0 0 2px rgba(201,169,110,0.75), 0 0 0 4px rgba(255,253,247,0.8), 0 4px 14px -6px rgba(140,111,58,0.35)',
        }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={`${name} のアバター`}
            className="h-full w-full object-cover object-top"
          />
        ) : loading ? (
          <span
            data-testid="member-avatar-loading"
            className="h-5 w-5 animate-spin rounded-full"
            style={{
              border: '2px solid rgba(201,169,110,0.3)',
              borderTopColor: COLOR_GOLD_DEEP,
            }}
          />
        ) : (
          <span className="text-xs" style={{ color: COLOR_INK_MUTED }}>
            ?
          </span>
        )}
      </span>
      <span
        className="text-center text-[13px] leading-tight"
        style={{
          fontFamily: FONT_JP_SERIF,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: COLOR_INK,
        }}
      >
        {name}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${name} を削除`}
        className="text-[10px] tracking-widest opacity-60 transition-opacity hover:opacity-100"
        style={{ color: '#8a3a2e' }}
      >
        退場
      </button>
    </motion.li>
  )
}

interface UserPresenceTileProps {
  avatarUrl: string | null
  onChange: (url: string | null) => void
  onGeneratingChange: (generating: boolean) => void
}

function UserPresenceTile({
  avatarUrl,
  onChange,
  onGeneratingChange,
}: UserPresenceTileProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.7,
        delay: STAGGER_BASE_DELAY_S + STAGGER_STEP_S * 3,
        ease: 'easeOut',
      }}
      className="relative mt-6 overflow-hidden rounded-2xl p-6"
      style={{
        background:
          'linear-gradient(155deg, rgba(255,253,247,0.70) 0%, rgba(245,236,216,0.60) 100%)',
        border: '1px solid rgba(201,169,110,0.40)',
        boxShadow:
          '0 10px 30px -12px rgba(60,40,10,0.16), inset 0 0 0 1px rgba(255,255,255,0.4)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-700/50 to-transparent" />

      <TileHeader
        kicker="Your Presence"
        title="あなたの姿"
        hint="任意 — 議場に座すあなた自身のアバター"
      />

      <UserAvatarField
        avatarUrl={avatarUrl}
        onChange={onChange}
        onGeneratingChange={onGeneratingChange}
      />
    </motion.section>
  )
}

interface TileHeaderProps {
  kicker: string
  title: string
  hint?: string
}

function TileHeader({ kicker, title, hint }: TileHeaderProps) {
  return (
    <header className="mb-5">
      <p
        className="mb-1 text-[10px] uppercase"
        style={{
          fontFamily: FONT_TITLE,
          fontWeight: 600,
          letterSpacing: '0.42em',
          color: COLOR_GOLD_DEEP,
        }}
      >
        {kicker}
      </p>
      <h2
        className="text-lg"
        style={{
          fontFamily: FONT_JP_SERIF,
          fontWeight: 700,
          letterSpacing: '0.16em',
          color: COLOR_INK,
        }}
      >
        {title}
      </h2>
      {hint && (
        <p
          className="mt-1 text-[11px]"
          style={{ color: COLOR_INK_SOFT, letterSpacing: '0.06em' }}
        >
          {hint}
        </p>
      )}
    </header>
  )
}

// ─────────────────────────────────────────────────────────────
// ゲートボタン
// ─────────────────────────────────────────────────────────────

interface GateButtonProps {
  disabled: boolean
  loading: boolean
  armed: boolean
  onClick: () => void
}

function GateButton({ disabled, loading, armed, onClick }: GateButtonProps) {
  const interactive = !disabled && !armed
  const label = armed
    ? '神殿の門が開きます…'
    : loading
      ? 'アバター生成中…'
      : '議論を開始する'
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.7,
        delay: STAGGER_BASE_DELAY_S + STAGGER_STEP_S * 4,
        ease: 'easeOut',
      }}
      className="mt-10 flex justify-center"
    >
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled || armed}
        data-testid="start-debate"
        whileHover={interactive ? { y: -2 } : undefined}
        whileTap={interactive ? { scale: 0.98 } : undefined}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        className="group relative overflow-hidden rounded-sm px-14 py-4 disabled:cursor-not-allowed"
        style={{
          fontFamily: FONT_TITLE,
          fontWeight: 600,
          letterSpacing: '0.30em',
          fontSize: '0.95rem',
          color: interactive ? '#fffaf0' : '#bfae8a',
          background: interactive
            ? `linear-gradient(180deg, ${COLOR_GOLD} 0%, ${COLOR_GOLD_DEEP} 100%)`
            : 'rgba(232,219,191,0.7)',
          border: `1px solid ${interactive ? COLOR_GOLD_DEEP : 'rgba(180,160,120,0.35)'}`,
          boxShadow: interactive
            ? '0 12px 30px -12px rgba(140,111,58,0.55), inset 0 0 0 1px rgba(255,245,210,0.45), inset 0 0 24px rgba(255,235,180,0.18)'
            : 'none',
          textShadow: interactive ? '0 1px 2px rgba(80,52,14,0.45)' : 'none',
        }}
      >
        {/* Hover の光の流れ */}
        {interactive && (
          <span
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(255,236,180,0.55) 0%, transparent 65%)',
            }}
          />
        )}
        <span className="relative inline-flex items-center gap-3">
          <span className="text-[10px]" aria-hidden="true">
            ◆
          </span>
          {label}
          <span className="text-[10px]" aria-hidden="true">
            ◆
          </span>
        </span>
      </motion.button>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────
// カーテン (マウント時) / 門 (submit 時)
// ─────────────────────────────────────────────────────────────

function CurtainReveal() {
  // 紺色の幕が左右に分かれて開く。中央の合わせ目には金線を入れる。
  const ease = [0.7, 0, 0.25, 1] as const
  return (
    <>
      <motion.div
        initial={{ x: 0 }}
        animate={{ x: '-101%' }}
        transition={{ duration: CURTAIN_REVEAL_SECONDS, ease, delay: 0.05 }}
        className="pointer-events-none fixed inset-y-0 left-0 z-[60] w-1/2"
        style={{
          background: `linear-gradient(90deg, ${COLOR_DEEP_BLUE_DARK} 0%, ${COLOR_DEEP_BLUE} 80%, #243558 100%)`,
        }}
      >
        <div
          className="absolute right-0 top-0 h-full w-px"
          style={{
            background: `linear-gradient(to bottom, transparent, ${COLOR_GOLD} 50%, transparent)`,
            boxShadow: `0 0 18px ${COLOR_GOLD}`,
          }}
        />
      </motion.div>
      <motion.div
        initial={{ x: 0 }}
        animate={{ x: '101%' }}
        transition={{ duration: CURTAIN_REVEAL_SECONDS, ease, delay: 0.05 }}
        className="pointer-events-none fixed inset-y-0 right-0 z-[60] w-1/2"
        style={{
          background: `linear-gradient(270deg, ${COLOR_DEEP_BLUE_DARK} 0%, ${COLOR_DEEP_BLUE} 80%, #243558 100%)`,
        }}
      >
        <div
          className="absolute left-0 top-0 h-full w-px"
          style={{
            background: `linear-gradient(to bottom, transparent, ${COLOR_GOLD} 50%, transparent)`,
            boxShadow: `0 0 18px ${COLOR_GOLD}`,
          }}
        />
      </motion.div>
    </>
  )
}

function GateCloseOverlay() {
  // 神殿の門が中央へ閉まる。submit と同時に発火し、DebateStage へ遷移する手前で完了。
  const ease = [0.55, 0, 0.2, 1] as const
  return (
    <>
      <motion.div
        initial={{ x: '-101%' }}
        animate={{ x: 0 }}
        exit={{ x: '-101%' }}
        transition={{ duration: GATE_CLOSE_SECONDS, ease }}
        className="pointer-events-none fixed inset-y-0 left-0 z-[70] w-1/2"
        style={{
          background: `linear-gradient(135deg, ${COLOR_DEEP_BLUE} 0%, ${COLOR_DEEP_BLUE_DARK} 80%)`,
          boxShadow: 'inset -24px 0 36px -16px rgba(0,0,0,0.55)',
        }}
      >
        <GateCarving side="left" />
      </motion.div>
      <motion.div
        initial={{ x: '101%' }}
        animate={{ x: 0 }}
        exit={{ x: '101%' }}
        transition={{ duration: GATE_CLOSE_SECONDS, ease }}
        className="pointer-events-none fixed inset-y-0 right-0 z-[70] w-1/2"
        style={{
          background: `linear-gradient(225deg, ${COLOR_DEEP_BLUE} 0%, ${COLOR_DEEP_BLUE_DARK} 80%)`,
          boxShadow: 'inset 24px 0 36px -16px rgba(0,0,0,0.55)',
        }}
      >
        <GateCarving side="right" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.55, 0] }}
        transition={{
          duration: GATE_CLOSE_SECONDS,
          times: [0, 0.72, 1],
          ease: 'easeOut',
        }}
        className="pointer-events-none fixed inset-0 z-[80]"
        style={{
          background:
            'radial-gradient(circle at center, rgba(255,222,138,0.65) 0%, transparent 60%)',
        }}
      />
    </>
  )
}

function GateCarving({ side }: { side: 'left' | 'right' }) {
  // 門の合わせ目側に縦の金線・宝玉装飾を彫る。視覚的に「重い扉」感を出す。
  const seamPos = side === 'left' ? 'right-0' : 'left-0'
  const shadowDir = side === 'left' ? 'to left' : 'to right'
  return (
    <>
      <div
        className={`absolute top-0 h-full w-px ${seamPos}`}
        style={{
          background: `linear-gradient(to bottom, transparent, ${COLOR_GOLD} 30%, ${COLOR_GOLD} 70%, transparent)`,
          boxShadow: `0 0 22px ${COLOR_GOLD}, 0 0 60px rgba(201,169,110,0.55)`,
        }}
      />
      <div
        className={`absolute top-1/2 h-24 w-24 -translate-y-1/2 ${seamPos === 'right-0' ? 'right-[-48px]' : 'left-[-48px]'} rounded-full`}
        style={{
          background:
            'radial-gradient(circle, rgba(255,225,150,0.55) 0%, rgba(255,200,110,0.25) 35%, transparent 70%)',
          filter: 'blur(2px)',
        }}
      />
      <div
        className="absolute inset-y-12 inset-x-12 rounded-sm"
        style={{
          border: '1px solid rgba(201,169,110,0.35)',
          background: `linear-gradient(${shadowDir}, rgba(201,169,110,0.0) 0%, rgba(201,169,110,0.06) 100%)`,
        }}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// ユーザーアバター（画像アップロード / AI 生成 タブ）
// ─────────────────────────────────────────────────────────────

interface UserAvatarFieldProps {
  avatarUrl: string | null
  onChange: (url: string | null) => void
  onGeneratingChange: (generating: boolean) => void
}

// T58: ユーザー自身のアバター登録。画像アップロード（dataURL）と、メンバーと同じ
// add_character パイプラインでの AI 生成の 2 モードをトグルで切り替える。
function UserAvatarField({
  avatarUrl,
  onChange,
  onGeneratingChange,
}: UserAvatarFieldProps) {
  const [mode, setMode] = useState<UserAvatarMode>('upload')
  const [generateInput, setGenerateInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = (file: File | undefined) => {
    if (!file) return
    setError(null)
    const reader = new FileReader()
    reader.onload = () =>
      onChange(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => setError('画像の読み込みに失敗しました。')
    reader.readAsDataURL(file)
  }

  const handleGenerate = async () => {
    const keyword = generateInput.trim()
    if (keyword.length === 0 || generating) return
    setError(null)
    setGenerating(true)
    onGeneratingChange(true)
    try {
      const { avatar_url } = await addCharacter(keyword)
      onChange(avatar_url)
    } catch {
      setError('アバター生成に失敗しました。時間をおいて再試行してください。')
    } finally {
      setGenerating(false)
      onGeneratingChange(false)
    }
  }

  return (
    <div data-testid="user-avatar-field" className="flex items-start gap-5">
      <UserAvatarPreview
        avatarUrl={avatarUrl}
        generating={generating}
      />

      <div className="flex-1">
        <div className="mb-3 inline-flex rounded-full p-1"
          style={{
            background: 'rgba(255,253,247,0.55)',
            border: '1px solid rgba(201,169,110,0.45)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.4)',
          }}
        >
          <AvatarTab
            active={mode === 'upload'}
            onClick={() => setMode('upload')}
            label="画像アップロード"
          />
          <AvatarTab
            active={mode === 'generate'}
            onClick={() => setMode('generate')}
            label="AI で召喚"
          />
        </div>

        {mode === 'upload' ? (
          <input
            type="file"
            accept="image/*"
            data-testid="user-avatar-upload"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="block w-full text-sm"
            style={{
              color: COLOR_INK_SOFT,
              fontFamily: FONT_BODY,
            }}
          />
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={generateInput}
              data-testid="user-avatar-generate-input"
              onChange={(e) => setGenerateInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleGenerate()
                }
              }}
              placeholder="例: 探検家風の男性"
              className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
              style={{
                fontFamily: FONT_JP_SERIF,
                color: COLOR_DEEP_BLUE,
                border: '1px solid rgba(201,169,110,0.45)',
                borderRadius: '0.5rem',
                background: 'rgba(255,255,255,0.5)',
              }}
            />
            <motion.button
              type="button"
              data-testid="user-avatar-generate"
              onClick={() => void handleGenerate()}
              disabled={generateInput.trim().length === 0 || generating}
              whileHover={
                generateInput.trim().length > 0 && !generating
                  ? { y: -1 }
                  : undefined
              }
              whileTap={
                generateInput.trim().length > 0 && !generating
                  ? { scale: 0.97 }
                  : undefined
              }
              className="shrink-0 rounded-lg px-4 py-2 text-sm disabled:cursor-not-allowed"
              style={{
                fontFamily: FONT_TITLE,
                fontWeight: 600,
                letterSpacing: '0.18em',
                color:
                  generateInput.trim().length > 0 && !generating
                    ? '#fffaf0'
                    : '#bfae8a',
                background:
                  generateInput.trim().length > 0 && !generating
                    ? `linear-gradient(180deg, ${COLOR_GOLD} 0%, ${COLOR_GOLD_DEEP} 100%)`
                    : 'rgba(232,219,191,0.6)',
                border: `1px solid ${
                  generateInput.trim().length > 0 && !generating
                    ? COLOR_GOLD_DEEP
                    : 'rgba(180,160,120,0.35)'
                }`,
              }}
            >
              {generating ? '召喚中…' : '召喚'}
            </motion.button>
          </div>
        )}

        {error && (
          <p
            data-testid="user-avatar-error"
            className="mt-2 text-xs"
            style={{ color: '#9b3a2c', letterSpacing: '0.04em' }}
          >
            {error}
          </p>
        )}
        {avatarUrl && (
          <button
            type="button"
            data-testid="user-avatar-remove"
            onClick={() => onChange(null)}
            className="mt-2 text-[11px] tracking-widest opacity-60 transition-opacity hover:opacity-100"
            style={{ color: '#8a3a2e' }}
          >
            アバターを削除
          </button>
        )}
      </div>
    </div>
  )
}

interface AvatarTabProps {
  active: boolean
  onClick: () => void
  label: ReactNode
}

function AvatarTab({ active, onClick, label }: AvatarTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-4 py-1.5 text-[11px] transition-all"
      style={{
        fontFamily: FONT_TITLE,
        fontWeight: 600,
        letterSpacing: '0.20em',
        color: active ? '#fffaf0' : COLOR_INK_SOFT,
        background: active
          ? `linear-gradient(180deg, ${COLOR_GOLD} 0%, ${COLOR_GOLD_DEEP} 100%)`
          : 'transparent',
        boxShadow: active
          ? '0 4px 12px -6px rgba(140,111,58,0.45), inset 0 0 0 1px rgba(255,245,210,0.35)'
          : 'none',
      }}
    >
      {label}
    </button>
  )
}

interface UserAvatarPreviewProps {
  avatarUrl: string | null
  generating: boolean
}

function UserAvatarPreview({ avatarUrl, generating }: UserAvatarPreviewProps) {
  return (
    <span
      data-testid="user-avatar-preview"
      className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{
        background: 'rgba(255,253,247,0.7)',
        boxShadow:
          '0 0 0 2.5px rgba(201,169,110,0.85), 0 0 0 5px rgba(255,253,247,0.9), 0 8px 22px -8px rgba(140,111,58,0.45)',
      }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt="あなたのアバター"
          className="h-full w-full object-cover object-top"
        />
      ) : generating ? (
        <span
          data-testid="user-avatar-loading"
          className="h-6 w-6 animate-spin rounded-full"
          style={{
            border: '2px solid rgba(201,169,110,0.3)',
            borderTopColor: COLOR_GOLD_DEEP,
          }}
        />
      ) : (
        <span
          className="text-[11px]"
          style={{
            fontFamily: FONT_JP_SERIF,
            letterSpacing: '0.2em',
            color: COLOR_INK_MUTED,
          }}
        >
          あなた
        </span>
      )}
    </span>
  )
}
