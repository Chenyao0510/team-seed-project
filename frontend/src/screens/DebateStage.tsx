import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useIsPresent } from 'framer-motion'
import type { Character, DebateState, DebateStatus, ChatHistoryEntry } from '../types/state'
import { addCharacter, nextTurn } from '../api/client'

// PointsPanel (T33) のアニメーション秒数（CONSTRAINTS.md: マジックナンバー禁止）。
// 1ターンで「追加=最大1 / 入れ替え=最大1」を Gemini 側で強制し (D11 prompt)、
// フロントは差分を派手に演出する: 新規は NEW バッジ + emerald glow をしっかり残し、
// 削除は line-through で滞留させてから去る。
const POINTS_ENTER_DURATION = 0.55
const POINTS_NEW_HIGHLIGHT_DURATION = 3.5 // NEW バッジ表示時間
const POINTS_GLOW_DURATION = 2.8 // glow 減衰時間
const POINTS_EXIT_DURATION = 1.1 // line-through を見せるためゆっくり
const POINTS_GLOW_BOX_SHADOW = '0 0 32px rgba(52, 211, 153, 0.95)'
const POINTS_NO_BOX_SHADOW = '0 0 0px rgba(52, 211, 153, 0)'
const POINTS_NEW_BG = 'rgba(16, 185, 129, 0.35)' // emerald-500 + alpha
const POINTS_KEPT_BG = 'rgba(51, 65, 85, 0.6)' // slate-700/60

interface DebateStageProps {
  state: DebateState
  onOpenHistory?: () => void
  onStateChange?: (newState: DebateState) => void
  onIntervene?: (next: DebateState) => void
  onAddCharacter?: (character: Character) => void
  onSummarize?: () => void
  isSummarizing?: boolean
}

type InterventionKind = 'objection' | 'viewpoint' | 'question'

const INTERVENTION_LABEL: Record<InterventionKind, string> = {
  objection: '異議',
  viewpoint: '観点',
  question: '質問',
}

// T12 が `/api/add_character` を実装するまでの暫定。ユーザーアバターも同じ穴で吸収。
const USER_AVATAR_URL = 'https://placeholder.example/user.png'

// ユーザー介入の発言者名（roster 外固定値。/api/next_turn が roster 外発言を
// 「ユーザー介入」として扱い、次の AI がそれに反応する: DECISIONS D11）。
const USER_SPEAKER = 'あなた'

const STATUS_LABEL: Record<DebateStatus, string> = {
  thinking: '思考中',
  speaking: '発言中',
  waiting: '待機中',
}

// Reflection Turn (T26/T27): 何ターンごとに一時停止して Reflection Panel を表示するか。
// turn_count は backend が `/api/next_turn` のたびに+1して返す値（ユーザー介入はカウントしない）。
const REFLECTION_INTERVAL = 3

export function DebateStage({
  state,
  onOpenHistory,
  onStateChange,
  onIntervene,
  onAddCharacter,
  onSummarize,
  isSummarizing = false,
}: DebateStageProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isAddCharOpen, setIsAddCharOpen] = useState(false)
  const isActive = (name: string) => state.active_character === name
  const [intervention, setIntervention] = useState<InterventionKind | null>(null)
  const [showReflection, setShowReflection] = useState(false)

  const existingNames = state.characters.map((c) => c.name)

  const handleAddCharacter = async (character: Character) => {
    onAddCharacter?.(character)
    setIsAddCharOpen(false)
  }

  const submitIntervention = (kind: InterventionKind, text: string) => {
    const trimmed = text.trim()
    if (trimmed.length === 0) return
    onIntervene?.({
      ...state,
      active_character: USER_SPEAKER,
      current_speech: `（${INTERVENTION_LABEL[kind]}）${trimmed}`,
      status: 'speaking',
    })
    setIntervention(null)
  }

  const handleOpenHistory = () => {
    setIsHistoryOpen(true)
    if (onOpenHistory) onOpenHistory()
  }

  const handleReflectionContinue = () => {
    setShowReflection(false)
    void handleNextTurn()
  }

  const handleReflectionIntervention = (kind: InterventionKind) => {
    setShowReflection(false)
    setIntervention(kind)
  }

  // AI 進行ターンが完了した際の共通処理。backend が返す turn_count が
  // REFLECTION_INTERVAL の倍数になったら Reflection Panel を表示する。
  const maybeShowReflection = (newState: DebateState) => {
    if (newState.turn_count % REFLECTION_INTERVAL === 0) {
      setShowReflection(true)
    }
  }

  const handleNextTurn = async () => {
    if (isGenerating || !onStateChange) return
    setIsGenerating(true)
    try {
      const newState = await nextTurn(state)
      onStateChange(newState)
      maybeShowReflection(newState)
    } catch (err) {
      console.error(err)
      alert('API呼び出しに失敗しました')
    } finally {
      setIsGenerating(false)
    }
  }

  // 最初の発言がない場合は自動でAPIを叩いて会話を始める
  useEffect(() => {
    let mounted = true
    const initTurn = async () => {
      if (!onStateChange) return
      setIsGenerating(true)
      try {
        const newState = await nextTurn(state)
        if (mounted) {
          onStateChange(newState)
          maybeShowReflection(newState)
        }
      } catch (err) {
        console.error(err)
      } finally {
        if (mounted) setIsGenerating(false)
      }
    }

    if (state.chat_history.length === 0 && state.current_speech === '') {
      void initTurn()
    }
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-slate-900 text-slate-100">
      <Header
        theme={state.theme}
        currentTopic={state.current_topic}
        onOpenHistory={handleOpenHistory}
      />

      <main className="flex flex-1 flex-col gap-6 px-6 py-6">
        <div className="flex flex-1 gap-6">
          <PointsPanel points={state.current_points} />

          <section className="flex flex-1 flex-col">
            <CharactersRow
              characters={state.characters}
              isActive={isActive}
              status={state.status}
            />
            <div className="relative">
              <TelopBox
                speaker={state.active_character}
                speech={state.current_speech}
                status={isGenerating ? 'thinking' : state.status}
                intervention={intervention}
                onCancel={() => setIntervention(null)}
                onSubmit={(text) => submitIntervention(intervention!, text)}
              />
              {/* 進行ボタンをテロップ横か下に配置 */}
              <div className="mx-auto mt-4 flex max-w-3xl justify-end">
                <button
                  type="button"
                  onClick={handleNextTurn}
                  disabled={isGenerating}
                  className="rounded bg-emerald-600 px-6 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGenerating ? '思考中...' : '次へ ❯'}
                </button>
              </div>
            </div>
          </section>
        </div>

        <ActionBar
          intervention={intervention}
          onSelectIntervention={setIntervention}
          interventionEnabled={onIntervene !== undefined}
          addCharacterEnabled={onAddCharacter !== undefined}
          onOpenAddCharacter={() => setIsAddCharOpen(true)}
          summarizeEnabled={onSummarize !== undefined}
          isSummarizing={isSummarizing}
          onSummarize={() => onSummarize?.()}
        />
      </main>

      {isAddCharOpen && (
        <AddCharacterModal
          existingNames={existingNames}
          onClose={() => setIsAddCharOpen(false)}
          onCreated={handleAddCharacter}
        />
      )}

      {/* History Drawer Overlay & Panel */}
      {isHistoryOpen && (
        <div className="absolute inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsHistoryOpen(false)}
            data-testid="history-overlay"
          />
          <aside
            data-testid="history-drawer"
            className="relative flex w-full max-w-sm flex-col border-l border-slate-700 bg-slate-800 shadow-2xl transition-transform"
          >
            <div className="flex items-center justify-between border-b border-slate-700 p-4">
              <h2 className="text-lg font-semibold text-slate-100">過去ログ</h2>
              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                data-testid="close-history-button"
                className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-100"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {state.chat_history.length === 0 ? (
                <p className="text-center text-sm text-slate-500">
                  ログはまだありません
                </p>
              ) : (
                state.chat_history.map((entry, i) => (
                  <ChatHistoryItem key={i} entry={entry} />
                ))
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Reflection Turn (T26): 一定ターンごとに討論を一時停止し、ユーザーに主導権を返す */}
      {showReflection && (
        <ReflectionPanel
          theme={state.theme}
          currentTopic={state.current_topic}
          points={state.current_points}
          characters={state.characters}
          onContinue={handleReflectionContinue}
          onAddViewpoint={() => handleReflectionIntervention('viewpoint')}
          onObject={() => handleReflectionIntervention('objection')}
        />
      )}
    </div>
  )
}

interface ReflectionPanelProps {
  theme: string
  currentTopic: string
  points: string[]
  characters: DebateState['characters']
  onContinue: () => void
  onAddViewpoint: () => void
  onObject: () => void
}

// Reflection Panel (T26): AIによる「足りない視点」「追加すべき人物」の提案は禁止。
// 現在の問い・論点構造のみを示し、ユーザーが次の行動を選ぶための余白を作る。
function ReflectionPanel({
  theme,
  currentTopic,
  points,
  characters,
  onContinue,
  onAddViewpoint,
  onObject,
}: ReflectionPanelProps) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <section
        data-testid="reflection-panel"
        className="mx-4 w-full max-w-2xl rounded-2xl border-2 border-emerald-400/60 bg-slate-800 p-8 shadow-2xl"
      >
        <p className="mb-1 text-xs uppercase tracking-wider text-emerald-300">
          Reflection Turn
        </p>
        <h2 className="mb-4 text-sm leading-relaxed text-slate-200">
          ここまでの議論です。続けますか、それともあなたの視点を加えますか？
        </h2>

        <div className="mb-4 space-y-1">
          <p className="text-xs text-slate-400">現在の問い</p>
          <p className="text-base font-semibold text-slate-100" title={theme}>
            {theme}
          </p>
        </div>

        <div className="mb-4 space-y-1">
          <p className="text-xs text-slate-400">フォーカス中の論点</p>
          <p className="text-sm text-slate-100" title={currentTopic}>
            {currentTopic || '未設定'}
          </p>
        </div>

        <div className="mb-4 space-y-2">
          <p className="text-xs text-slate-400">論点一覧</p>
          {points.length === 0 ? (
            <p className="text-sm text-slate-500">まだ論点が出ていません</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {points.map((p) => (
                <li
                  key={p}
                  className="rounded bg-slate-700/60 px-3 py-1 text-sm text-slate-100"
                >
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mb-6 space-y-2">
          <p className="text-xs text-slate-400">参加者</p>
          <ul className="flex gap-3">
            {characters.map((c) => (
              <li key={c.name} className="flex flex-col items-center">
                <div className="h-12 w-12 overflow-hidden rounded-full bg-slate-700 ring-2 ring-slate-600">
                  <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />
                </div>
                <span className="mt-1 text-xs text-slate-300">{c.name}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 border-t border-slate-700 pt-4">
          <button
            type="button"
            data-testid="reflection-continue"
            onClick={onContinue}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500"
          >
            続きを見る
          </button>
          <button
            type="button"
            data-testid="reflection-add-character"
            disabled
            title="人物追加（T25 で実装予定）"
            className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-500 opacity-40"
          >
            人物追加
          </button>
          <button
            type="button"
            data-testid="reflection-add-viewpoint"
            onClick={onAddViewpoint}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-300"
          >
            観点追加
          </button>
          <button
            type="button"
            data-testid="reflection-objection"
            onClick={onObject}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-300"
          >
            異議を唱える
          </button>
          <button
            type="button"
            data-testid="reflection-summarize"
            disabled
            title="議論を整理する（T31 で実装予定）"
            className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-500 opacity-40"
          >
            議論を整理する
          </button>
        </div>
      </section>
    </div>
  )
}

function ChatHistoryItem({ entry }: { entry: ChatHistoryEntry }) {
  const isUser = entry.speaker === 'あなた' || entry.speaker === 'User'
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-slate-700">
        <img src={entry.avatar_url} alt="" className="h-full w-full object-cover" />
      </div>
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <span className="mb-1 text-xs text-slate-400">{entry.speaker}</span>
        <div
          className={`rounded-2xl px-4 py-2 text-sm ${
            isUser
              ? 'bg-emerald-600 text-white rounded-tr-sm'
              : 'bg-slate-700 text-slate-100 rounded-tl-sm'
          }`}
        >
          {entry.text}
        </div>
      </div>
    </div>
  )
}

interface HeaderProps {
  theme: string
  currentTopic: string
  onOpenHistory?: () => void
}

function Header({ theme, currentTopic, onOpenHistory }: HeaderProps) {
  return (
    <header className="grid grid-cols-3 items-center border-b border-slate-700 bg-slate-900/80 px-6 py-3 backdrop-blur">
      <p
        data-testid="header-topic"
        className="truncate text-sm text-emerald-300"
        title={currentTopic}
      >
        {currentTopic ? `論点: ${currentTopic}` : '論点: 未設定'}
      </p>
      <h1
        data-testid="header-theme"
        className="truncate text-center text-lg font-semibold tracking-wide"
        title={theme}
      >
        {theme}
      </h1>
      <div className="text-right">
        <button
          type="button"
          onClick={onOpenHistory}
          disabled={!onOpenHistory}
          data-testid="open-history-button"
          className="rounded border border-slate-600 px-3 py-1 text-sm text-slate-300 hover:border-slate-400 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          過去ログ
        </button>
      </div>
    </header>
  )
}

interface PointsPanelProps {
  points: string[]
}

function PointsPanel({ points }: PointsPanelProps) {
  // 「props 由来の派生 state」パターン。points が変わった瞬間にだけ、直前のスナップ
  // ショットを `previousPoints` に退避して再描画する。マウント直後は previousPoints
  // = points なので「全てが NEW」扱いにならない（初回描画で過剰演出しない）。
  // React 19 の react-hooks/refs ルール対策で useRef ではなく useState を使う。
  const [renderedPoints, setRenderedPoints] = useState<string[]>(points)
  const [previousPoints, setPreviousPoints] = useState<string[]>(points)
  if (renderedPoints !== points) {
    setPreviousPoints(renderedPoints)
    setRenderedPoints(points)
  }

  const previousSet = new Set(previousPoints)
  const currentSet = new Set(points)
  const newItems = points.filter((p) => !previousSet.has(p))
  const removedItems = previousPoints.filter((p) => !currentSet.has(p))

  return (
    <aside
      data-testid="points-panel"
      className="w-56 shrink-0 rounded-lg border border-slate-700 bg-slate-800/40 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider text-slate-400">論点</h2>
        <DiffBadge added={newItems.length} removed={removedItems.length} />
      </div>
      {points.length === 0 ? (
        <p className="text-sm text-slate-500">まだ論点が出ていません</p>
      ) : (
        <ul data-testid="points-list" className="space-y-2">
          <AnimatePresence initial={false}>
            {points.map((p) => {
              const isNew = !previousSet.has(p)
              return (
                <PointItem
                  key={p}
                  point={p}
                  isNew={isNew}
                />
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </aside>
  )
}

interface PointItemProps {
  point: string
  isNew: boolean
}

function PointItem({ point, isNew }: PointItemProps) {
  const isPresent = useIsPresent()
  return (
    <motion.li
      layout
      data-testid="points-item"
      data-state={isPresent ? (isNew ? 'new' : 'kept') : 'removing'}
      initial={
        isNew
          ? {
              opacity: 0,
              x: -24,
              scale: 0.7,
              backgroundColor: POINTS_NEW_BG,
              boxShadow: POINTS_GLOW_BOX_SHADOW,
            }
          : false
      }
      animate={{
        opacity: 1,
        x: 0,
        scale: 1,
        backgroundColor: POINTS_KEPT_BG,
        boxShadow: POINTS_NO_BOX_SHADOW,
        transition: {
          opacity: { duration: POINTS_ENTER_DURATION, ease: 'easeOut' },
          x: { duration: POINTS_ENTER_DURATION, ease: 'easeOut' },
          // 新規は spring で「ポンッ」と入場
          scale: isNew
            ? { type: 'spring', stiffness: 320, damping: 14 }
            : { duration: POINTS_ENTER_DURATION, ease: 'easeOut' },
          backgroundColor: { duration: POINTS_GLOW_DURATION, ease: 'easeOut' },
          boxShadow: { duration: POINTS_GLOW_DURATION, ease: 'easeOut' },
        },
      }}
      exit={{
        opacity: 0,
        x: 32,
        scale: 0.92,
        transition: { duration: POINTS_EXIT_DURATION, ease: 'easeIn' },
      }}
      className="relative flex items-center gap-2 overflow-hidden rounded px-3 py-2 text-sm"
      style={{ willChange: 'transform, opacity, box-shadow, background-color' }}
    >
      <span
        className={
          isPresent
            ? 'flex-1 text-slate-100'
            : 'flex-1 text-rose-200 line-through decoration-rose-400 decoration-2'
        }
      >
        {point}
      </span>
      {isNew && isPresent && <NewBadge />}
    </motion.li>
  )
}

function NewBadge() {
  return (
    <motion.span
      data-testid="points-new-badge"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{
        opacity: [0, 1, 1, 0],
        scale: [0.6, 1, 1, 0.9],
      }}
      transition={{
        duration: POINTS_NEW_HIGHLIGHT_DURATION,
        ease: 'easeOut',
        times: [0, 0.1, 0.75, 1],
      }}
      className="rounded-full bg-emerald-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-900"
    >
      New
    </motion.span>
  )
}

interface DiffBadgeProps {
  added: number
  removed: number
}

function DiffBadge({ added, removed }: DiffBadgeProps) {
  if (added === 0 && removed === 0) return null
  return (
    <motion.span
      key={`${added}-${removed}`}
      data-testid="points-diff-badge"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: [0, 1, 1, 0], y: [-4, 0, 0, -4] }}
      transition={{
        duration: POINTS_NEW_HIGHLIGHT_DURATION,
        ease: 'easeOut',
        times: [0, 0.15, 0.75, 1],
      }}
      className="flex items-center gap-1 text-[10px] font-bold"
    >
      {added > 0 && <span className="text-emerald-300">+{added}</span>}
      {removed > 0 && <span className="text-rose-300">−{removed}</span>}
    </motion.span>
  )
}

interface CharactersRowProps {
  characters: DebateState['characters']
  isActive: (name: string) => boolean
  status: DebateStatus
}

function CharactersRow({ characters, isActive, status }: CharactersRowProps) {
  return (
    <div
      data-testid="stage-row"
      className="flex flex-1 items-end justify-between gap-6 px-2"
    >
      <ul className="flex items-end gap-8">
        {characters.map((c) => (
          <li
            key={c.name}
            data-testid="stage-character"
            data-active={isActive(c.name) ? 'true' : 'false'}
            className={[
              'flex flex-col items-center transition-all duration-300 ease-out',
              isActive(c.name) ? 'scale-110' : 'scale-95 opacity-60',
            ].join(' ')}
          >
            <div
              className={[
                'h-28 w-28 overflow-hidden rounded-full bg-slate-700',
                isActive(c.name)
                  ? 'shadow-[0_0_30px_rgba(52,211,153,0.6)] ring-4 ring-emerald-400'
                  : 'ring-2 ring-slate-600',
              ].join(' ')}
            >
              <img
                src={c.avatar_url}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
            <p className="mt-3 text-sm font-semibold">{c.name}</p>
            {isActive(c.name) && (
              <span className="mt-1 text-xs text-emerald-300">
                {STATUS_LABEL[status]}
              </span>
            )}
          </li>
        ))}
      </ul>

      {/* User avatar is fixed at the far right (PROJECT.md spec). */}
      <div data-testid="stage-user" className="flex flex-col items-center">
        <div className="h-28 w-28 overflow-hidden rounded-full bg-slate-700 ring-2 ring-amber-300">
          <img
            src={USER_AVATAR_URL}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
        <p className="mt-3 text-sm font-semibold text-amber-200">あなた</p>
      </div>
    </div>
  )
}

interface TelopBoxProps {
  speaker: string
  speech: string
  status: DebateStatus
  intervention: InterventionKind | null
  onCancel: () => void
  onSubmit: (text: string) => void
}

function TelopBox({
  speaker,
  speech,
  status,
  intervention,
  onCancel,
  onSubmit,
}: TelopBoxProps) {
  const empty = speech.trim().length === 0
  const [draft, setDraft] = useState('')

  if (intervention) {
    const label = INTERVENTION_LABEL[intervention]
    return (
      <section
        data-testid="stage-telop"
        className="mx-auto mt-6 w-full max-w-3xl rounded-2xl border-2 border-amber-400 bg-slate-800/90 px-8 py-6 shadow-2xl"
      >
        <p
          data-testid="telop-speaker"
          className="mb-2 text-sm font-semibold text-amber-300"
        >
          {USER_SPEAKER}（{label}）
        </p>
        <textarea
          data-testid="intervention-input"
          autoFocus
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setDraft('')
              onCancel()
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              onSubmit(draft)
              setDraft('')
            }
          }}
          placeholder={`${label}を入力（Cmd/Ctrl+Enter で送信、Esc でキャンセル）`}
          className="w-full resize-none rounded-md border border-slate-600 bg-slate-900/60 px-4 py-3 text-lg leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
        />
        <div className="mt-3 flex justify-end gap-3">
          <button
            type="button"
            data-testid="intervention-cancel"
            onClick={() => {
              setDraft('')
              onCancel()
            }}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:border-slate-400 hover:text-slate-100"
          >
            キャンセル
          </button>
          <button
            type="button"
            data-testid="intervention-submit"
            disabled={draft.trim().length === 0}
            onClick={() => {
              onSubmit(draft)
              setDraft('')
            }}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-400"
          >
            送信
          </button>
        </div>
      </section>
    )
  }

  return (
    <section
      data-testid="stage-telop"
      className="mx-auto mt-6 w-full max-w-3xl rounded-2xl border-2 border-slate-600 bg-slate-800/90 px-8 py-6 shadow-2xl"
    >
      {empty ? (
        <p className="text-slate-400" data-testid="telop-empty">
          {status === 'thinking'
            ? `${speaker || 'AI'} が思考中...`
            : '議論が始まるのを待っています...'}
        </p>
      ) : (
        <>
          {speaker && (
            <p
              data-testid="telop-speaker"
              className="mb-2 text-sm font-semibold text-emerald-300"
            >
              {speaker}
            </p>
          )}
          <p
            data-testid="telop-speech"
            className="text-lg leading-relaxed text-slate-100"
          >
            {speech}
          </p>
        </>
      )}
    </section>
  )
}

interface ActionBarProps {
  intervention: InterventionKind | null
  onSelectIntervention: (kind: InterventionKind) => void
  interventionEnabled: boolean
  addCharacterEnabled: boolean
  onOpenAddCharacter: () => void
  summarizeEnabled: boolean
  isSummarizing: boolean
  onSummarize: () => void
}

function ActionBar({
  intervention,
  onSelectIntervention,
  interventionEnabled,
  addCharacterEnabled,
  onOpenAddCharacter,
  summarizeEnabled,
  isSummarizing,
  onSummarize,
}: ActionBarProps) {
  const interventionButtonsDisabled = !interventionEnabled || intervention !== null

  const interventionButton = (kind: InterventionKind, label: string, testId: string) => (
    <button
      type="button"
      data-testid={testId}
      onClick={() => onSelectIntervention(kind)}
      disabled={interventionButtonsDisabled}
      className="rounded-md border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  )

  return (
    <nav
      data-testid="action-bar"
      className="flex flex-wrap items-center justify-center gap-3 border-t border-slate-700 pt-4"
    >
      <button
        type="button"
        data-testid="action-add-character"
        onClick={onOpenAddCharacter}
        disabled={!addCharacterEnabled || intervention !== null}
        className="rounded-md border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        人物追加
      </button>
      {interventionButton('objection', '異議を唱える', 'action-objection')}
      {interventionButton('viewpoint', '観点追加', 'action-viewpoint')}
      {interventionButton('question', '質問', 'action-question')}
      <button
        type="button"
        data-testid="action-summarize"
        onClick={onSummarize}
        disabled={!summarizeEnabled || intervention !== null || isSummarizing}
        className="rounded-md border border-emerald-500 bg-emerald-600/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:border-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isSummarizing ? '整理中...' : '議論を整理する'}
      </button>
    </nav>
  )
}

interface AddCharacterModalProps {
  existingNames: string[]
  onClose: () => void
  onCreated: (character: Character) => void | Promise<void>
}

function AddCharacterModal({ existingNames, onClose, onCreated }: AddCharacterModalProps) {
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = name.trim()
  const isDuplicate = existingNames.includes(trimmed)
  const canSubmit = trimmed.length > 0 && !isDuplicate && !isSubmitting

  const submit = async () => {
    if (!canSubmit) return
    setError(null)
    setIsSubmitting(true)
    try {
      const { avatar_url } = await addCharacter(trimmed)
      await onCreated({ name: trimmed, avatar_url })
    } catch (err) {
      console.error(err)
      setError('アバター生成に失敗しました。時間をおいて再試行してください。')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      data-testid="add-character-modal"
      className="absolute inset-0 z-50 flex items-center justify-center"
    >
      <div
        data-testid="add-character-overlay"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => {
          if (!isSubmitting) onClose()
        }}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-600 bg-slate-800 p-6 shadow-2xl">
        <h2 className="mb-1 text-lg font-semibold text-slate-100">人物を追加</h2>
        <p className="mb-4 text-xs text-slate-400">
          名前を入力すると、アバターを生成してステージに追加します。
        </p>
        <label
          htmlFor="add-character-name"
          className="mb-1 block text-xs font-semibold text-slate-300"
        >
          名前
        </label>
        <input
          id="add-character-name"
          data-testid="add-character-input"
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              if (!isSubmitting) onClose()
            } else if (e.key === 'Enter') {
              e.preventDefault()
              void submit()
            }
          }}
          disabled={isSubmitting}
          placeholder="例: 織田信長"
          className="w-full rounded-md border border-slate-600 bg-slate-900/60 px-4 py-2 text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none disabled:opacity-60"
        />
        {isDuplicate && (
          <p
            data-testid="add-character-duplicate"
            className="mt-2 text-xs text-amber-300"
          >
            この名前は既にステージにいます。
          </p>
        )}
        {error && (
          <p data-testid="add-character-error" className="mt-2 text-xs text-rose-300">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            data-testid="add-character-cancel"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:border-slate-400 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            data-testid="add-character-submit"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-400"
          >
            {isSubmitting ? '生成中...' : '追加'}
          </button>
        </div>
      </div>
    </div>
  )
}
