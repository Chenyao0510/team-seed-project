import type { DebateState } from '../types/state'

interface DebateStageProps {
  state: DebateState
  // T21 で本格 UI を作る。T13 時点では state を受け取り表示することだけが責務。
}

/**
 * Stub for Screen 1. Receives the initial Debate State from Screen 0 and
 * renders enough information to verify the hand-off. The full ギャルゲ風ステージ
 * (T21) will replace this body, keeping the same props contract.
 */
export function DebateStage({ state }: DebateStageProps) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-8">
        <p className="mb-1 text-sm uppercase tracking-wider text-emerald-600">
          Debate Stage (stub — T21 で本実装)
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          {state.theme}
        </h1>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">参加メンバー</h2>
        <ul data-testid="debate-character-list" className="grid grid-cols-2 gap-3">
          {state.characters.map((c) => (
            <li
              key={c.name}
              data-testid="debate-character"
              className="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2"
            >
              <img
                src={c.avatar_url}
                alt=""
                className="h-10 w-10 rounded-full bg-gray-100 object-cover"
              />
              <span className="font-medium text-gray-900">{c.name}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
