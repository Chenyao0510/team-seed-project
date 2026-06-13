import { useState } from 'react'
import { SetupScreen, type SetupResult } from './screens/SetupScreen'
import { DebateStage } from './screens/DebateStage'
import { buildInitialDebateState } from './lib/buildDebateState'
import type { DebateState } from './types/state'

type View =
  | { kind: 'setup' }
  | { kind: 'debate'; state: DebateState }

function App() {
  const [view, setView] = useState<View>({ kind: 'setup' })

  const handleSetupSubmit = (result: SetupResult) => {
    setView({ kind: 'debate', state: buildInitialDebateState(result) })
  }

  if (view.kind === 'debate') {
    return <DebateStage state={view.state} />
  }
  return <SetupScreen onSubmit={handleSetupSubmit} />
}

export default App
