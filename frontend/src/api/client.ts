// Backend (FastAPI) 呼び出しを集約する薄い apiClient モジュール。
// docs/ARCHITECTURE.md: 「バック呼び出しは fetch をラップした薄い apiClient モジュールに集約する」

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

import type { DebateState, Gender, IntegrationState, ReflectionSummary } from '../types/state'

export interface AddCharacterResponse {
  avatar_url: string
  // T69: TTS 話者プール選択に使う。
  gender: Gender
  // T72: 発言生成プロンプト用ペルソナ。
  persona: string
}

// 事前生成キャラクターテンプレート (T5A / D16, T69)。
export interface CharacterTemplate {
  slug: string
  name: string
  avatar_url: string
  // T69: TTS 話者プール選択用。
  gender: Gender
  // T72: 発言生成プロンプト用ペルソナ。
  persona: string
}

export async function getCharacterTemplates(): Promise<CharacterTemplate[]> {
  const response = await fetch(`${API_BASE_URL}/api/character_templates`)
  if (!response.ok) {
    throw new Error(`character_templates failed with status ${response.status}`)
  }
  return (await response.json()) as CharacterTemplate[]
}

export async function nextTurn(state: DebateState): Promise<DebateState> {
  const response = await fetch(`${API_BASE_URL}/api/next_turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  })

  if (!response.ok) {
    throw new Error(`next_turn failed with status ${response.status}`)
  }

  return (await response.json()) as DebateState
}

export async function think(state: DebateState): Promise<DebateState> {
  const response = await fetch(`${API_BASE_URL}/api/think`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  })

  if (!response.ok) {
    throw new Error(`think failed with status ${response.status}`)
  }

  return (await response.json()) as DebateState
}

export async function reflection(state: DebateState): Promise<ReflectionSummary> {
  const response = await fetch(`${API_BASE_URL}/api/reflection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  })

  if (!response.ok) {
    throw new Error(`reflection failed with status ${response.status}`)
  }

  return (await response.json()) as ReflectionSummary
}

export async function addCharacter(name: string): Promise<AddCharacterResponse> {
  const response = await fetch(`${API_BASE_URL}/api/add_character`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })

  if (!response.ok) {
    throw new Error(`add_character failed with status ${response.status}`)
  }

  return (await response.json()) as AddCharacterResponse
}

export async function summarize(state: DebateState): Promise<IntegrationState> {
  const response = await fetch(`${API_BASE_URL}/api/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  })

  if (!response.ok) {
    throw new Error(`summarize failed with status ${response.status}`)
  }

  return (await response.json()) as IntegrationState
}
