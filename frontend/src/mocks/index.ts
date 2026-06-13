// Canonical sample State JSON. Source of truth lives at /fixtures at the repo root,
// shared with backend pytest. Use these to render screens without a running backend.
//
// Schema is defined in DECISIONS.md D01 and frontend/src/types/state.ts.

import debateRaw from '../../../fixtures/debate_state_sample.json'
import integrationRaw from '../../../fixtures/integration_state_sample.json'
import reflectionRaw from '../../../fixtures/reflection_summary_sample.json'
import type { DebateState, IntegrationState, ReflectionSummary } from '../types/state'

export const debateStateSample = debateRaw as DebateState
export const integrationStateSample = integrationRaw as IntegrationState
export const reflectionSummarySample = reflectionRaw as ReflectionSummary
