// SetupScreen 右側の「テンプレートから追加」パネル (T5A / D16)。
//
// マウント時に `/api/character_templates` を 1 回だけ fetch。クリックすると親に
// onPick(template) を通知し、親はそれを `addCharacter` API スキップで members に
// 追加する。既に追加済みの slug は disabled で重複追加を防ぐ。
import { useEffect, useState } from 'react'
import {
  getCharacterTemplates,
  type CharacterTemplate,
} from '../../api/client'

interface CharacterTemplatePanelProps {
  /** 既に members に追加済みの表示名のセット。disabled 判定に使う。 */
  addedNames: Set<string>
  onPick: (template: CharacterTemplate) => void
}

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
        // バックエンド未起動 or 未 seed: パネル自体は描画したまま空にする
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
    <aside
      data-testid="character-template-panel"
      className="rounded-md border border-gray-200 bg-white p-4"
    >
      <h2 className="mb-1 text-sm font-semibold !text-gray-900">
        テンプレートから追加
      </h2>
      <p className="mb-3 text-xs text-gray-500">
        クリック1回で AI 生成をスキップして追加できます。
      </p>

      {loading ? (
        <p
          data-testid="character-template-loading"
          className="py-6 text-center text-xs text-gray-400"
        >
          読み込み中…
        </p>
      ) : templates.length === 0 ? (
        <p
          data-testid="character-template-empty"
          className="py-6 text-center text-xs text-gray-400"
        >
          {error ?? 'テンプレートが見つかりません。'}
        </p>
      ) : (
        <ul
          data-testid="character-template-list"
          className="grid grid-cols-2 gap-2"
        >
          {templates.map((tpl) => {
            const isAdded = addedNames.has(tpl.name)
            return (
              <li key={tpl.slug}>
                <button
                  type="button"
                  data-testid="character-template-item"
                  data-slug={tpl.slug}
                  data-added={isAdded ? 'true' : 'false'}
                  onClick={() => onPick(tpl)}
                  disabled={isAdded}
                  className="flex w-full items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-2 text-left text-sm text-gray-900 transition hover:border-emerald-400 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                  aria-label={`${tpl.name} を追加`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100">
                    <img
                      src={tpl.avatar_url}
                      alt={tpl.name}
                      className="h-full w-full object-cover object-top"
                    />
                  </span>
                  <span className="flex-1 leading-tight">
                    <span className="block text-xs font-semibold">
                      {tpl.name}
                    </span>
                    {isAdded && (
                      <span className="block text-[10px] text-gray-400">
                        追加済み
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
