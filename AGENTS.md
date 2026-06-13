# AGENTS.md -- Hackathon Agent Rules

## Startup

Before writing any code, complete these steps in order:

1. Read this file completely.
2. Read `CLAUDE.md` for the quick-reference build commands.
3. Read `docs/PROJECT.md` to understand what we are building and why.
4. Read `docs/ARCHITECTURE.md` for layer boundaries and data flow.
5. Run build verification once the stack exists (`TBD command`).
6. If verification is already failing, fix that first -- do not add features on a broken baseline.

## Docs Hierarchy

```text
docs/
  PROJECT.md       -- problem, features, constraints, UI sketch
  ARCHITECTURE.md  -- stack, system layers, data flow, key decisions
```

When adding features, update the relevant doc before writing code.

## Working Rules

- Work on one feature at a time.
- Prefer durable repo artifacts over chat summaries -- record decisions in `docs/`.
- Do not change architecture without updating `docs/ARCHITECTURE.md`.
- Do not silently widen scope; keep changes within the current task unless a blocker forces a narrow supporting fix.
- No magic numbers -- use named constants.
- No mutation -- return new objects.

## Definition of Done

A feature is done when all of the following are true:

1. It builds without errors.
2. The target behavior is implemented and manually verified.
3. Tests exist and pass (80% coverage minimum).
4. `docs/ARCHITECTURE.md` is current if layers or dependencies changed.
5. The repo is in a state where the next person can run the startup workflow and continue.

## Session Handoff

Update `session-handoff.md` at the end of each session with:

- What was accomplished
- What remains
- Any blockers or decisions made
- Files modified

When resuming, read `session-handoff.md` before touching any code.
