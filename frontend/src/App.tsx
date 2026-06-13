import { useState } from 'react'
import { SetupScreen, type SetupResult } from './screens/SetupScreen'
import { DebateStage } from './screens/DebateStage'
import { buildInitialDebateState } from './lib/buildDebateState'
import { debateStateSample } from './mocks'
import type { DebateState } from './types/state'

type View =
  | { kind: 'setup' }
  | { kind: 'debate'; state: DebateState }

// Dev-only shortcut so designers can hit the Debate Stage without filling Setup.
// e.g. `http://localhost:5173/?mock=debate` renders DebateStage with the canonical
// fixture. Remove when E2E (T41) covers the path end-to-end.
function initialView(): View {
  if (typeof window === 'undefined') return { kind: 'setup' }
  const mock = new URLSearchParams(window.location.search).get('mock')
  if (mock === 'debate') return { kind: 'debate', state: debateStateSample }
  return { kind: 'setup' }
}

function App() {
  const [view, setView] = useState<View>(initialView)

  const handleSetupSubmit = (result: SetupResult) => {
    setView({ kind: 'debate', state: buildInitialDebateState(result) })
  }

  if (view.kind === 'debate') {
    return <DebateStage state={view.state} />
  }
  return <SetupScreen onSubmit={handleSetupSubmit} />
}

export default App
