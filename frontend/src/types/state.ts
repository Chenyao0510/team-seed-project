// Canonical State types. Source of truth: DECISIONS.md D01 and fixtures/*.json.
// Keep this file in sync with the JSON fixtures and backend pydantic models.

export interface Character {
  name: string;
  avatar_url: string;
}

export interface ChatHistoryEntry {
  speaker: string;
  text: string;
  avatar_url: string;
  emotion: string;
}

export type DebateStatus = "thinking" | "speaking" | "waiting";

export interface AgentThought {
  willingness_to_speak: boolean;
  thought: string;
  current_speech: string;
  current_points: string[];
  current_topic: string;
  emotion: string;
}

// ステージ右端に固定表示されるユーザー自身 (T58)。`name` は介入発言の話者名
// （既定 'あなた'）、`avatar_url` は Screen 0 で登録したアバター（未登録は空文字）。
export interface User {
  name: string;
  avatar_url: string;
}

export interface DebateState {
  theme: string;
  current_topic: string;
  active_character: string;
  status: DebateStatus;
  current_speech: string;
  emotion: string;
  current_points: string[];
  characters: Character[];
  chat_history: ChatHistoryEntry[];
  turn_count: number;
  user: User;
  agent_thoughts?: Record<string, AgentThought>;
}

export interface ReflectionStance {
  label: string;
  summary: string;
  characters: string[];
}

export interface ReflectionBlock {
  topic: string;
  stances: ReflectionStance[];
}

export interface ReflectionSummary {
  facilitator_comment: string;
  blocks: ReflectionBlock[];
}

export interface IntegrationStructureCategory {
  category_name: string;
  elements: string[];
  highlighted_element_index?: number;
}

export interface IntegrationState {
  central_concept: string;
  before_question: string;
  after_question: string;
  structure_map: IntegrationStructureCategory[];
  user_catalyst: string;
  connective_value_praise: string;
}
