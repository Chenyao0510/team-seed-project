// Backend (FastAPI) 呼び出しを集約する薄い apiClient モジュール。
// docs/ARCHITECTURE.md: 「バック呼び出しは fetch をラップした薄い apiClient モジュールに集約する」

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export interface AddCharacterResponse {
  avatar_url: string
}

import type { DebateState, IntegrationState } from '../types/state'

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
