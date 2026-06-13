import { useEffect, useState, useRef, Fragment, useCallback } from 'react'
import { AnimatePresence, motion, useIsPresent } from 'framer-motion'
import type { Character, DebateState, DebateStatus, ChatHistoryEntry, ReflectionSummary, AgentThought } from '../types/state'
import { addCharacter, nextTurn, reflection, think, API_BASE_URL } from '../api/client'

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

// ユーザーがアバター未登録 (state.user.avatar_url が空) のときのフォールバック表示 (T58)。
const USER_AVATAR_FALLBACK = 'https://placeholder.example/user.png'

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
  const [reflectionSummary, setReflectionSummary] = useState<ReflectionSummary | null>(null)
  const [reflectionLoading, setReflectionLoading] = useState(false)

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
      active_character: state.user.name,
      current_speech: `（${INTERVENTION_LABEL[kind]}）${trimmed}`,
      status: 'speaking',
      agent_thoughts: {},
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
  // REFLECTION_INTERVAL の倍数になったら Reflection Panel を表示し、
  // facilitator 一言 + 論点×立場×キャラの構造化要約を /api/reflection から取得する。
  const maybeShowReflection = (newState: DebateState) => {
    if (newState.turn_count % REFLECTION_INTERVAL === 0) {
      setShowReflection(true)
      setReflectionSummary(null)
      setReflectionLoading(true)
      reflection(newState)
        .then((summary) => setReflectionSummary(summary))
        .catch((err) => console.error(err))
        .finally(() => setReflectionLoading(false))
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

  const handleThink = useCallback(async (currentState: DebateState) => {
    if (isGenerating || !onStateChange) return
    // すでに思考結果がある、または待機中以外はスキップ（多重発火防止）
    if (currentState.status !== 'speaking' || (currentState.agent_thoughts && Object.keys(currentState.agent_thoughts).length > 0)) {
      return
    }

    // status: thinking への遷移はバックエンドで行われるが、
    // フロントエンドでも即座に isGenerating を true にしてガードする
    setIsGenerating(true)
    try {
      const newState = await think(currentState)
      // 通信中にユーザーが介入ボタンを押した場合は、結果を反映しない (T63)
      if (interventionRef.current === null) {
        onStateChange(newState)
      }
    } catch (err) {
      console.error('Auto-think failed:', err)
    } finally {
      setIsGenerating(false)
    }
  }, [isGenerating, onStateChange])

  // 最新の intervention 状態を参照するための Ref
  const interventionRef = useRef<InterventionKind | null>(intervention)
  useEffect(() => {
    interventionRef.current = intervention
  }, [intervention])

  // 発言が完了したタイミングで自動的に「思考」を開始する (T63)
  useEffect(() => {
    if (state.status === 'speaking' && state.current_speech !== '' && !isGenerating) {
      // ユーザーが介入モード（モーダル入力中など）でないことを確認
      if (intervention === null && !isAddCharOpen && !showReflection) {
        const timer = setTimeout(() => {
          void handleThink(state)
        }, 1500) // 少し待ってから思考開始（読了感のため）
        return () => clearTimeout(timer)
      }
    }
  }, [state.current_speech, state.status, isGenerating, intervention, isAddCharOpen, showReflection, handleThink, state])

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
              isActive={(name) => (intervention || showReflection ? false : isActive(name))}
              status={state.status}
              userName={state.user.name}
              userAvatarUrl={state.user.avatar_url || USER_AVATAR_FALLBACK}
              agentThoughts={intervention || showReflection ? {} : state.agent_thoughts}
              isUserActive={!!intervention || showReflection || isActive(state.user.name)}
            />
            <div className="relative">
              <TelopBox
                speaker={state.active_character}
                speech={state.current_speech}
                status={isGenerating ? 'thinking' : state.status}
                intervention={intervention}
                onCancel={() => setIntervention(null)}
                onSubmit={(text) => submitIntervention(intervention!, text)}
                userName={state.user.name}
                agentThoughts={state.agent_thoughts}
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
          currentTopic={state.current_topic}
          characters={state.characters}
          summary={reflectionSummary}
          loading={reflectionLoading}
          onContinue={handleReflectionContinue}
          onSelectIntervention={handleReflectionIntervention}
        />
      )}
    </div>
  )
}

interface ReflectionPanelProps {
  currentTopic: string
  characters: DebateState['characters']
  summary: ReflectionSummary | null
  loading: boolean
  onContinue: () => void
  onSelectIntervention: (kind: InterventionKind) => void
}

const REFLECTION_INTERVENTION: { kind: InterventionKind; label: string; testId: string }[] = [
  { kind: 'objection', label: '異議を唱える', testId: 'reflection-objection' },
  { kind: 'viewpoint', label: '観点追加', testId: 'reflection-add-viewpoint' },
  { kind: 'question', label: '質問', testId: 'reflection-question' },
]

// Reflection Panel (T26/T26残作業): AIによる「足りない視点」「追加すべき人物」の提案は禁止。
// 認知負荷を最小化するため、現在の論点と「対立構造マップ」(VS表示) のみを示し、
// ユーザーは「見守る」か「発言する」かのどちらかを選ぶだけでよい。
function ReflectionPanel({
  currentTopic,
  characters,
  summary,
  loading,
  onContinue,
  onSelectIntervention,
}: ReflectionPanelProps) {
  // 論点は直近2件のみ表示する（古い論点は折り返しなしで切り捨てる）。
  const blocks = (summary?.blocks ?? []).slice(-2)
  const [showInterventionChoices, setShowInterventionChoices] = useState(false)

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <section
        data-testid="reflection-panel"
        className="mx-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border-2 border-emerald-400/60 bg-slate-800 p-8 shadow-2xl"
      >
        <p className="mb-1 text-xs uppercase tracking-wider text-emerald-300">
          Reflection Turn
        </p>
        <h2
          data-testid="reflection-topic"
          className="mb-6 text-xl font-bold text-slate-100"
          title={currentTopic}
        >
          現在の論点：{currentTopic || '未設定'}
        </h2>

        {loading ? (
          <p className="mb-6 text-center text-sm text-slate-400" data-testid="reflection-loading">
            対立構造を読み込み中...
          </p>
        ) : blocks.length > 0 ? (
          <div className="mb-6 space-y-4" data-testid="reflection-blocks">
            {blocks.map((block) => (
              <div key={block.topic} data-testid="reflection-block">
                {blocks.length > 1 && (
                  <p className="mb-2 text-center text-xs text-slate-400">{block.topic}</p>
                )}
                <VsRow stances={block.stances} characters={characters} />
              </div>
            ))}
          </div>
        ) : (
          <div className="mb-6 space-y-2" data-testid="reflection-participants">
            <p className="text-center text-xs text-slate-400">参加者</p>
            <ul className="flex justify-center gap-3">
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
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 border-t border-slate-700 pt-4">
          {showInterventionChoices ? (
            REFLECTION_INTERVENTION.map(({ kind, label, testId }) => (
              <button
                key={kind}
                type="button"
                data-testid={testId}
                onClick={() => onSelectIntervention(kind)}
                className="rounded-md border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-300"
              >
                {label}
              </button>
            ))
          ) : (
            <>
              <button
                type="button"
                data-testid="reflection-intervene"
                onClick={() => setShowInterventionChoices(true)}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500"
              >
                発言する（異議/観点/質問）
              </button>
              <button
                type="button"
                data-testid="reflection-continue"
                onClick={onContinue}
                className="rounded-md border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-300"
              >
                このまま議論を見守る（次へ）
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

interface VsRowProps {
  stances: ReflectionSummary['blocks'][number]['stances']
  characters: DebateState['characters']
}

// 対立構造マップ。
// 立場が2つの場合: [アイコンA] ラベル(立場)  VS  ラベル(立場) [アイコンB] の左右ミラー表示。
// 立場が3つ以上の場合: 同じ立場の人物をひとつのブロックにまとめ、ブロックを縦に積んで
// 間に "VS" の区切りを挟む（3人目・4人目以降の立場も同じ形式でブロックを追加するだけで
// 拡張できる）。
function VsRow({ stances, characters }: VsRowProps) {
  if (stances.length === 2) {
    return (
      <div className="flex items-center gap-3">
        <StanceChip stance={stances[0]} characters={characters} />
        <span className="shrink-0 text-xs font-bold text-slate-500">VS</span>
        <StanceChip stance={stances[1]} characters={characters} reverse />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {stances.map((stance, i) => (
        <Fragment key={stance.label}>
          <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
            <StanceChip stance={stance} characters={characters} />
          </div>
          {i < stances.length - 1 && (
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <span className="h-px flex-1 bg-slate-700" />
              VS
              <span className="h-px flex-1 bg-slate-700" />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  )
}

interface StanceChipProps {
  stance: ReflectionSummary['blocks'][number]['stances'][number]
  characters: DebateState['characters']
  reverse?: boolean
}

// 立場ごとのチップ。label を太字で強調し、summary はその下に小さめのグレー文字で常時表示する。
function StanceChip({ stance, characters, reverse }: StanceChipProps) {
  return (
    <div
      data-testid="reflection-stance"
      className={`flex flex-1 items-center gap-2 ${reverse ? 'flex-row-reverse text-right' : ''}`}
    >
      {stance.characters.length > 0 && (
        <ul className={`flex shrink-0 flex-col -space-y-2 ${reverse ? 'items-end' : 'items-start'}`}>
          {stance.characters.map((name) => {
            const character = characters.find((c) => c.name === name)
            return (
              <li
                key={name}
                title={name}
                className="h-10 w-10 overflow-hidden rounded-full bg-slate-700 ring-2 ring-slate-900"
              >
                {character && (
                  <img src={character.avatar_url} alt={name} className="h-full w-full object-cover" />
                )}
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex flex-col">
        <span className="text-sm font-bold text-slate-100">{stance.label}</span>
        <span className="text-sm text-gray-400">{stance.summary}</span>
      </div>
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
  userName: string
  userAvatarUrl: string
  agentThoughts?: Record<string, AgentThought>
  isUserActive?: boolean
}

function CharactersRow({ characters, isActive, status, userName, userAvatarUrl, agentThoughts, isUserActive }: CharactersRowProps) {
  return (
    <div
      data-testid="stage-row"
      className="flex flex-1 items-end justify-between gap-6 px-2"
    >
      <ul className="flex items-end gap-8">
        {/* ... (AI characters loop) ... */}
        {characters.map((c) => {
          const active = isActive(c.name)
          const thought = agentThoughts?.[c.name]
          const isWilling = thought?.willingness_to_speak

          return (
            <li
              key={c.name}
              data-testid="stage-character"
              data-active={active ? 'true' : 'false'}
              className={[
                'flex flex-col items-center transition-all duration-300 ease-out',
                active ? 'scale-110' : 'scale-95 opacity-60',
              ].join(' ')}
            >
              <div className="relative">
                <div
                  className={[
                    'h-28 w-28 overflow-hidden rounded-full bg-slate-700',
                    active
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
                {/* 発言意欲のインジケーター (T63) */}
                {status === 'thinking' && isWilling && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 shadow-lg"
                    title="発言したい！"
                  >
                    <span className="text-lg">✋</span>
                  </motion.div>
                )}
              </div>
              <p className="mt-3 text-sm font-semibold">{c.name}</p>
              {active && (
                <span className="mt-1 text-xs text-emerald-300">
                  {status === 'thinking' ? '思考中...' : STATUS_LABEL[status]}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      {/* User avatar is fixed at the far right (PROJECT.md spec). T58: Screen 0 で登録した user.avatar_url を表示。 */}
      <div
        data-testid="stage-user"
        className={[
          'flex flex-col items-center transition-all duration-300 ease-out',
          isUserActive ? 'scale-110' : 'scale-95 opacity-60',
        ].join(' ')}
      >
        <div
          className={[
            'h-28 w-28 overflow-hidden rounded-full bg-slate-700',
            isUserActive
              ? 'shadow-[0_0_30px_rgba(251,191,36,0.6)] ring-4 ring-amber-400'
              : 'ring-2 ring-slate-600',
          ].join(' ')}
        >
          <img
            src={userAvatarUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
        <p className="mt-3 text-sm font-semibold text-amber-200">{userName}</p>
        {isUserActive && (
          <span className="mt-1 text-xs text-amber-300">
            {isUserActive && !isActive(userName) ? '入力中...' : (status === 'speaking' ? '発言中' : '待機中')}
          </span>
        )}
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
  userName?: string
  agentThoughts?: Record<string, AgentThought>
}

function TelopBox({
  speaker,
  speech,
  status,
  intervention,
  onCancel,
  onSubmit,
  userName = 'あなた',
  agentThoughts,
}: TelopBoxProps) {
  const empty = speech.trim().length === 0
  const [draft, setDraft] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 音声再生ロジック
  useEffect(() => {
    // 既存の音声を停止
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ""
      audioRef.current = null
      setIsPlaying(false)
    }

    // AIの発言かつ発言が存在する場合のみ自動再生を試みる
    if (!empty && speaker && speaker !== USER_SPEAKER && speaker !== userName) {
      const url = `${API_BASE_URL}/api/tts?text=${encodeURIComponent(speech)}&character_name=${encodeURIComponent(speaker)}`
      const audio = new Audio(url)
      audioRef.current = audio
      
      audio.onended = () => setIsPlaying(false)
      audio.onpause = () => setIsPlaying(false)
      audio.onplay = () => setIsPlaying(true)
      
      audio.play().catch((err) => {
        console.error("TTS autoplay failed (usually due to browser policy):", err)
        setIsPlaying(false)
      })
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ""
        audioRef.current = null
      }
    }
  }, [speech, speaker, userName, empty])

  const handlePlayClick = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      } else {
        audioRef.current.currentTime = 0
        audioRef.current.play().catch(console.error)
      }
    }
  }

  const isUserSpeaker = speaker === USER_SPEAKER || speaker === userName

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
        <div className="flex flex-col gap-1" data-testid="telop-empty">
          <p className="text-slate-400">
            {status === 'thinking'
              ? (Object.keys(agentThoughts || {}).length > 0 ? '発言の準備が整いました' : 'AIたちが思考中...')
              : '議論が始まるのを待っています...'}
          </p>
          {status === 'thinking' && Object.keys(agentThoughts || {}).length > 0 && (
            <p className="text-xs text-emerald-400 animate-pulse">「次へ」を押して議論を再開してください</p>
          )}
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            {speaker && (
              <p
                data-testid="telop-speaker"
                className="text-sm font-semibold text-emerald-300"
              >
                {speaker}
              </p>
            )}
            {/* 再生ボタン (ユーザー以外の場合) */}
            {!isUserSpeaker && speaker && (
              <button
                onClick={handlePlayClick}
                className="flex h-8 items-center justify-center rounded bg-slate-700/50 px-3 text-xs text-slate-300 hover:bg-slate-700 hover:text-emerald-300 transition-colors"
                title="音声を再生/停止"
              >
                {isPlaying ? (
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center justify-center gap-0.5 h-3">
                      <motion.div className="w-[2px] bg-emerald-400 rounded-full" animate={{ height: ['4px', '12px', '4px'] }} transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }} />
                      <motion.div className="w-[2px] bg-emerald-400 rounded-full" animate={{ height: ['8px', '16px', '8px'] }} transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay: 0.2 }} />
                      <motion.div className="w-[2px] bg-emerald-400 rounded-full" animate={{ height: ['4px', '10px', '4px'] }} transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay: 0.4 }} />
                    </div>
                    <span className="text-emerald-400">再生中</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                    </svg>
                    <span>音声を再生</span>
                  </div>
                )}
              </button>
            )}
          </div>
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
