# CLAUDE.md -- Quick Reference

## Project

<!-- TODO: one-line summary once the idea is locked -->
**What**: TBD  
**Stack**: TBD (framework, language, and runtime not yet decided)

## Build & Run

```bash
# TBD -- fill in once stack is chosen
# install      e.g. npm install / pip install / cargo build
# dev          e.g. npm run dev
# type-check   e.g. npm run check / mypy / cargo check
# test         e.g. npm test / pytest / cargo test
```

## Key Files

| File                   | Purpose                               |
| ---------------------- | ------------------------------------- |
| `AGENTS.md`            | Operating rules for AI agents         |
| `docs/PROJECT.md`      | What we're building and why           |
| `docs/ARCHITECTURE.md` | System design and layer boundaries    |

## How to Add a Feature

<!-- TODO: update when stack and architecture are finalized -->
1. Check `docs/ARCHITECTURE.md` to understand where the change belongs.
2. Write the test first (RED).
3. Implement to pass the test (GREEN).
4. Update `docs/ARCHITECTURE.md` if new layers or dependencies are added.

## Testing

<!-- TODO: fill in testing commands once stack is chosen -->
Target: 80% line coverage minimum.
