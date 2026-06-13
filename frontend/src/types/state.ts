// Canonical State types. Source of truth: DECISIONS.md D01 and fixtures/*.json.
// Keep this file in sync with the JSON fixtures and backend pydantic models.

export interface Character {
  name: string
  avatar_url: string
}

export interface ChatHistoryEntry {
  speaker: string
  text: string
  avatar_url: string
}

export type DebateStatus = 'thinking' | 'speaking' | 'waiting'

export interface DebateState {
  theme: string
  current_topic: string
  active_character: string
  status: DebateStatus
  current_speech: string
  current_points: string[]
  characters: Character[]
  chat_history: ChatHistoryEntry[]
  turn_count: number
}

export interface IntegrationStructureCategory {
  category_name: string
  elements: string[]
  highlighted_element_index?: number
}

export interface IntegrationState {
  before_question: string
  after_question: string
  structure_map: IntegrationStructureCategory[]
  user_catalyst: string
  connective_value_praise: string
}
