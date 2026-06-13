import type { DebateState } from '../types/state'
import type { SetupResult } from '../screens/SetupScreen'

// T12 が `/api/add_character` を実装したら、avatar_url は実 URL に置き換わる。
// T13 時点ではプレースホルダーで形を整えておく。
const PLACEHOLDER_AVATAR_URL = 'https://placeholder.example/avatar.png'

export function buildInitialDebateState(setup: SetupResult): DebateState {
  return {
    theme: setup.theme,
    current_topic: '',
    active_character: '',
    status: 'waiting',
    current_speech: '',
    current_points: [],
    characters: setup.members.map(({ name }) => ({
      name,
      avatar_url: PLACEHOLDER_AVATAR_URL,
    })),
    chat_history: [],
  }
}
