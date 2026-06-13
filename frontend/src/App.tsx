import { useState } from 'react'
import { SetupScreen, type SetupResult } from './screens/SetupScreen'
import { DebateStage } from './screens/DebateStage'
import { IntegrationMap } from './screens/IntegrationMap'
import { buildInitialDebateState } from './lib/buildDebateState'
import { summarize } from './api/client'
import { debateStateSample, integrationStateSample } from './mocks'
import type { DebateState, IntegrationState } from './types/state'

type View =
  | { kind: 'setup' }
  | { kind: 'debate'; state: DebateState; isSummarizing: boolean }
  | { kind: 'integration'; debate: DebateState; integration: IntegrationState }

// Dev-only shortcut so designers can hit a downstream screen without filling Setup.
// e.g. `?mock=debate` or `?mock=integration`. Remove when E2E (T41) covers the path.
function initialView(): View {
  if (typeof window === 'undefined') return { kind: 'setup' }
  const mock = new URLSearchParams(window.location.search).get('mock')
  if (mock === 'debate') {
    return { kind: 'debate', state: debateStateSample, isSummarizing: false }
  }
  if (mock === 'integration') {
    return {
      kind: 'integration',
      debate: debateStateSample,
      integration: integrationStateSample,
    }
  }
  return { kind: 'setup' }
}

function App() {
  const [view, setView] = useState<View>(initialView)

  const handleSetupSubmit = (result: SetupResult) => {
    setView({
      kind: 'debate',
      state: buildInitialDebateState(result),
      isSummarizing: false,
    })
  }

  if (view.kind === 'integration') {
    return (
      <IntegrationMap
        state={view.integration}
        onBack={() =>
          setView({ kind: 'debate', state: view.debate, isSummarizing: false })
        }
      />
    )
  }

  if (view.kind === 'debate') {
    const current = view.state
    const handleSummarize = async () => {
      setView({ kind: 'debate', state: current, isSummarizing: true })
      try {
        const integration = await summarize(current)
        setView({ kind: 'integration', debate: current, integration })
      } catch (err) {
        console.error(err)
        alert('議論の整理に失敗しました')
        setView({ kind: 'debate', state: current, isSummarizing: false })
      }
    }

    return (
      <DebateStage
        state={current}
        isSummarizing={view.isSummarizing}
        onIntervene={(next) =>
          setView({ kind: 'debate', state: next, isSummarizing: false })
        }
        onStateChange={(next) =>
          setView({ kind: 'debate', state: next, isSummarizing: false })
        }
        onAddCharacter={(character) =>
          setView({
            kind: 'debate',
            state: {
              ...current,
              characters: [...current.characters, character],
            },
            isSummarizing: false,
          })
        }
        onSummarize={() => void handleSummarize()}
      />
    )
  }
  return <SetupScreen onSubmit={handleSetupSubmit} />
}

export default App
