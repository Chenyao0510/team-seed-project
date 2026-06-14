import type { DebateState } from '../types/state'
import type { SetupResult } from '../screens/SetupScreen'

// アバター生成が間に合わなかった / 失敗した場合の最後の砦。バックエンドが
// プレースホルダー画像を返すケースも吸収できるよう、フロント側にも保持する。
const FALLBACK_AVATAR_URL = 'https://placeholder.example/avatar.png'

// ユーザー介入発言の話者名（roster 外固定値）。backend (DEFAULT_USER_NAME) と一致させる。
export const USER_NAME = 'あなた'

export function buildInitialDebateState(setup: SetupResult): DebateState {
  return {
    theme: setup.theme,
    current_topic: '',
    active_character: '',
    status: 'waiting',
    current_speech: '',
    current_hook: '',
    current_body: '',
    current_reasoning_target: '',
    current_concepts: [],
    emotion: 'neutral',
    current_points: [],
    characters: setup.members.map(({ name, avatarUrl, persona }) => ({
      name,
      avatar_url: avatarUrl ?? FALLBACK_AVATAR_URL,
      persona: persona ?? '',
    })),
    chat_history: [],
    turn_count: 0,
    // T58: Screen 0 で登録したユーザーアバター。未登録なら空文字（DebateStage 側で placeholder 表示）。
    user: { name: USER_NAME, avatar_url: setup.userAvatarUrl ?? '' },
  }
}
