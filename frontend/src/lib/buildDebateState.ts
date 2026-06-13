import type { DebateState } from '../types/state'
import type { SetupResult } from '../screens/SetupScreen'

// アバター生成が間に合わなかった / 失敗した場合の最後の砦。バックエンドが
// プレースホルダー画像を返すケースも吸収できるよう、フロント側にも保持する。
const FALLBACK_AVATAR_URL = 'https://placeholder.example/avatar.png'

export function buildInitialDebateState(setup: SetupResult): DebateState {
  return {
    theme: setup.theme,
    current_topic: '',
    active_character: '',
    status: 'waiting',
    current_speech: '',
    current_points: [],
    characters: setup.members.map(({ name, avatarUrl }) => ({
      name,
      avatar_url: avatarUrl ?? FALLBACK_AVATAR_URL,
    })),
    chat_history: [],
  }
}
