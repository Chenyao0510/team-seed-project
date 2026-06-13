import { useState } from 'react'

export interface SetupResult {
  theme: string
  members: string[]
}

interface SetupScreenProps {
  // T13 で navigation を担当する callback。T11 時点では未配線で OK。
  onSubmit?: (result: SetupResult) => void
}

export function SetupScreen({ onSubmit }: SetupScreenProps) {
  const [theme, setTheme] = useState('')
  const [memberInput, setMemberInput] = useState('')
  const [members, setMembers] = useState<string[]>([])

  const trimmedInput = memberInput.trim()
  const canAdd = trimmedInput.length > 0 && !members.includes(trimmedInput)
  const canSubmit = theme.trim().length > 0 && members.length >= 2

  const addMember = () => {
    if (!canAdd) return
    setMembers((prev) => [...prev, trimmedInput])
    setMemberInput('')
  }

  const removeMember = (name: string) => {
    setMembers((prev) => prev.filter((n) => n !== name))
  }

  const submit = () => {
    if (!canSubmit) return
    onSubmit?.({ theme: theme.trim(), members })
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-10">
        <h1 className="mb-2 text-4xl font-bold tracking-tight text-gray-900">
          議論をセットアップ
        </h1>
        <p className="text-gray-500">
          テーマと、最初に参加させる人物を決めましょう。
        </p>
      </header>

      <section className="mb-8">
        <label htmlFor="theme" className="mb-2 block text-sm font-semibold text-gray-700">
          議論のテーマ
        </label>
        <input
          id="theme"
          type="text"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="例: 大学は必要か？"
          className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-emerald-500 focus:outline-none"
        />
      </section>

      <section className="mb-10">
        <label htmlFor="member" className="mb-2 block text-sm font-semibold text-gray-700">
          初期メンバー（議論に参加させる人物 / 2 名以上）
        </label>
        <div className="mb-3 flex gap-2">
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
            className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={addMember}
            disabled={!canAdd}
            className="rounded-md bg-emerald-500 px-4 py-2 font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            追加
          </button>
        </div>

        {members.length === 0 ? (
          <p
            data-testid="member-list-empty"
            className="text-sm text-gray-400"
          >
            まだ人物が追加されていません
          </p>
        ) : (
          <ul data-testid="member-list" className="space-y-2">
            {members.map((name) => (
              <li
                key={name}
                data-testid="member-list-item"
                className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-4 py-2 text-gray-900"
              >
                <span>{name}</span>
                <button
                  type="button"
                  onClick={() => removeMember(name)}
                  aria-label={`${name} を削除`}
                  className="text-sm text-gray-400 hover:text-red-500"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="w-full rounded-md bg-emerald-600 px-4 py-3 text-lg font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        議論を開始する
      </button>
    </div>
  )
}
