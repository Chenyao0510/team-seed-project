import { useState, useEffect } from 'react'
import type { Character, DebateState, DebateStatus, ChatHistoryEntry } from '../types/state'
import { addCharacter, nextTurn } from '../api/client'

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

// Reflection Turn (T26): 何ターンごとに一時停止して Reflection Panel を表示するか。
// turn_count はバックエンド未導入 (T27) のため、フロント側でローカルに集計する暫定実装。
const REFLECTION_INTERVAL = 3

export function DebateStage({ state, onOpenHistory, onStateChange, onIntervene }: DebateStageProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isAddCharOpen, setIsAddCharOpen] = useState(false)
  const isActive = (name: string) => state.active_character === name
  const [intervention, setIntervention] = useState<InterventionKind | null>(null)
  const [, setTurnCount] = useState(0)
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

  // AI 進行ターンが完了した際の共通処理。ターン数を集計し、一定数ごとに
  // Reflection Panel を表示する（ユーザー介入はカウントしない）。
  const advanceTurnCount = () => {
    setTurnCount((prev) => {
      const next = prev + 1
      if (next % REFLECTION_INTERVAL === 0) {
        setShowReflection(true)
      }
      return next
    })
  }

  const handleNextTurn = async () => {
    if (isGenerating || !onStateChange) return
    setIsGenerating(true)
    try {
      const newState = await nextTurn(state)
      onStateChange(newState)
      advanceTurnCount()
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
          advanceTurnCount()
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
