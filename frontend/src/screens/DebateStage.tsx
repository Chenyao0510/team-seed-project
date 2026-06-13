import { useState } from 'react'
import type { DebateState, DebateStatus } from '../types/state'

interface DebateStageProps {
  state: DebateState
  onOpenHistory?: () => void
  onIntervene?: (next: DebateState) => void
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

type InterventionKind = 'objection' | 'viewpoint' | 'question'

const INTERVENTION_LABEL: Record<InterventionKind, string> = {
  objection: '異議',
  viewpoint: '観点',
  question: '質問',
}

export function DebateStage({ state, onOpenHistory, onIntervene }: DebateStageProps) {
  const isActive = (name: string) => state.active_character === name
  const [intervention, setIntervention] = useState<InterventionKind | null>(null)

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

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-slate-100">
      <Header
        theme={state.theme}
        currentTopic={state.current_topic}
        onOpenHistory={onOpenHistory}
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
            <TelopBox
              speaker={state.active_character}
              speech={state.current_speech}
              status={state.status}
              intervention={intervention}
              onCancel={() => setIntervention(null)}
              onSubmit={(text) => submitIntervention(intervention!, text)}
            />
          </section>
        </div>

        <ActionBar
          intervention={intervention}
          onSelectIntervention={setIntervention}
          interventionEnabled={onIntervene !== undefined}
        />
      </main>
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
}

function ActionBar({
  intervention,
  onSelectIntervention,
  interventionEnabled,
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
        disabled
        title="人物追加（T25 で実装予定）"
        className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-500 opacity-40"
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
