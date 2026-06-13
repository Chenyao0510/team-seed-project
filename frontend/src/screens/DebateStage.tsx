import { useState, useEffect, Fragment } from 'react'
import type { Character, DebateState, DebateStatus, ChatHistoryEntry, ReflectionSummary } from '../types/state'
import { addCharacter, nextTurn, reflection } from '../api/client'

interface DebateStageProps {
  state: DebateState
  onOpenHistory?: () => void
  onStateChange?: (newState: DebateState) => void
  onIntervene?: (next: DebateState) => void
  onAddCharacter?: (character: Character) => void
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

export function DebateStage({ state, onOpenHistory, onStateChange, onIntervene, onAddCharacter }: DebateStageProps) {
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
  return (
    <aside
      data-testid="points-panel"
      className="w-56 shrink-0 rounded-lg border border-slate-700 bg-slate-800/40 p-4"
    >
      <h2 className="mb-3 text-xs uppercase tracking-wider text-slate-400">
        論点
      </h2>
      {points.length === 0 ? (
        <p className="text-sm text-slate-500">まだ論点が出ていません</p>
      ) : (
        <ul className="space-y-2">
          {points.map((p) => (
            <li
              key={p}
              data-testid="points-item"
              className="rounded bg-slate-700/60 px-3 py-2 text-sm text-slate-100"
            >
              {p}
            </li>
          ))}
        </ul>
      )}
    </aside>
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
}

function ActionBar({
  intervention,
  onSelectIntervention,
  interventionEnabled,
  addCharacterEnabled,
  onOpenAddCharacter,
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
        disabled
        title="議論を整理する（T31 で実装予定）"
        className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-500 opacity-40"
      >
        議論を整理する
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
