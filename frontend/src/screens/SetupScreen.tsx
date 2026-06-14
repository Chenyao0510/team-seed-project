import { useState } from 'react'
import { addCharacter, type CharacterTemplate } from '../api/client'
import { CharacterTemplatePanel } from '../components/setup/CharacterTemplatePanel'
import type { Gender } from '../types/state'

export interface SetupMember {
  name: string
  avatarUrl: string | null
  // T69: TTS 話者プール用。`/api/add_character` レスポンスから受け取った値、
  // またはテンプレに静的定義された値を保持する。avatar 解決と同タイミングでセット。
  gender?: Gender
}

export interface SetupResult {
  theme: string
  members: SetupMember[]
  // T58: ユーザー自身のアバター（任意）。未登録なら null。
  userAvatarUrl: string | null
}

type UserAvatarMode = 'upload' | 'generate'

interface SetupScreenProps {
  // T13 で navigation を担当する callback。T11 時点では未配線で OK。
  onSubmit?: (result: SetupResult) => void
}

export function SetupScreen({ onSubmit }: SetupScreenProps) {
  const [theme, setTheme] = useState('')
  const [memberInput, setMemberInput] = useState('')
  const [members, setMembers] = useState<SetupMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState<Set<string>>(new Set())
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
  const [userAvatarGenerating, setUserAvatarGenerating] = useState(false)

  const trimmedInput = memberInput.trim()
  const canAdd = trimmedInput.length > 0 && !members.some((m) => m.name === trimmedInput)
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
      .then(({ avatar_url, gender }) => {
        setMembers((prev) =>
          prev.map((m) =>
            m.name === name ? { ...m, avatarUrl: avatar_url, gender } : m,
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
      },
    ])
  }

  const submit = () => {
    if (!canSubmit) return
    onSubmit?.({ theme: theme.trim(), members, userAvatarUrl })
  }

  const addedNames = new Set(members.map((m) => m.name))

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10">
        <h1 className="mb-2 text-4xl font-bold tracking-tight text-gray-900">
          議論をセットアップ
        </h1>
        <p className="text-gray-500">
          テーマと、最初に参加させる人物を決めましょう。
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
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
            {members.map(({ name, avatarUrl }) => (
              <li
                key={name}
                data-testid="member-list-item"
                className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-4 py-2 text-gray-900"
              >
                <span className="flex items-center gap-3">
                  <span
                    data-testid="member-avatar"
                    className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100"
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={`${name} のアバター`}
                        className="h-full w-full object-cover"
                      />
                    ) : loadingMembers.has(name) ? (
                      <span
                        data-testid="member-avatar-loading"
                        className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-emerald-500"
                      />
                    ) : (
                      <span className="text-xs text-gray-400">?</span>
                    )}
                  </span>
                  {name}
                </span>
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

      <section className="mb-6">
        <label className="mb-2 block text-sm font-semibold text-gray-700">
          あなたのアバター（任意）
        </label>
        <UserAvatarField
          avatarUrl={userAvatarUrl}
          onChange={setUserAvatarUrl}
          onGeneratingChange={setUserAvatarGenerating}
        />
      </section>

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        data-testid="start-debate"
        className="w-full rounded-md bg-emerald-600 px-4 py-3 text-lg font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {isAvatarLoading ? 'アバター生成中...' : '議論を開始する'}
      </button>
        </div>

        <CharacterTemplatePanel
          addedNames={addedNames}
          onPick={addMemberByTemplate}
        />
      </div>
    </div>
  )
}

interface UserAvatarFieldProps {
  avatarUrl: string | null
  onChange: (url: string | null) => void
  // 親の canSubmit ゲート用に AI 生成中かどうかを通知する。
  onGeneratingChange: (generating: boolean) => void
}

// T58: ユーザー自身のアバター登録。画像アップロード（dataURL）と、メンバーと同じ
// add_character パイプラインでの AI 生成の 2 モードをトグルで切り替える。
function UserAvatarField({ avatarUrl, onChange, onGeneratingChange }: UserAvatarFieldProps) {
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

  const tab = (value: UserAvatarMode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
        mode === value
          ? 'bg-emerald-500 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div data-testid="user-avatar-field" className="flex items-start gap-4">
      <span
        data-testid="user-avatar-preview"
        className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 ring-2 ring-amber-300"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="あなたのアバター" className="h-full w-full object-cover" />
        ) : generating ? (
          <span
            data-testid="user-avatar-loading"
            className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-emerald-500"
          />
        ) : (
          <span className="text-sm text-gray-400">あなた</span>
        )}
      </span>

      <div className="flex-1">
        <div className="mb-3 flex gap-2">
          {tab('upload', '画像アップロード')}
          {tab('generate', 'AIで生成')}
        </div>

        {mode === 'upload' ? (
          <input
            type="file"
            accept="image/*"
            data-testid="user-avatar-upload"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-500 file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-emerald-600"
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
              placeholder="例: 探検家風の自分"
              className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="button"
              data-testid="user-avatar-generate"
              onClick={() => void handleGenerate()}
              disabled={generateInput.trim().length === 0 || generating}
              className="rounded-md bg-emerald-500 px-4 py-2 font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {generating ? '生成中...' : '生成'}
            </button>
          </div>
        )}

        {error && (
          <p data-testid="user-avatar-error" className="mt-2 text-xs text-rose-500">
            {error}
          </p>
        )}
        {avatarUrl && (
          <button
            type="button"
            data-testid="user-avatar-remove"
            onClick={() => onChange(null)}
            className="mt-2 text-xs text-gray-400 hover:text-red-500"
          >
            アバターを削除
          </button>
        )}
      </div>
    </div>
  )
}
