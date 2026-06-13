# ARCHITECTURE.md -- System Design

## Stack

<!-- TODO: fill in once the team decides -->
| Layer              | Technology |
| ------------------ | ---------- |
| Language           | TBD        |
| Framework          | TBD        |
| Database / Storage | TBD        |
| AI / LLM           | TBD        |
| Hosting / Runtime  | TBD        |

## System Overview

<!-- TODO: one paragraph describing the overall system shape -->
TBD

## Layer Diagram

<!-- TODO: replace with actual layers once stack is decided -->

```text
+-------------------+
|   Frontend / UI   |
+-------------------+
         |
+-------------------+
|   Backend / API   |
+-------------------+
         |
+-------------------+
|  Data / Storage   |
+-------------------+
```

## Layer Boundaries

<!-- TODO: define what each layer owns and does NOT own -->

### Frontend

- Renders UI only.
- Never directly accesses the database or filesystem.
- Communicates with backend via [TBD -- REST / IPC / WebSocket / etc.].

### Backend

- Owns business logic.
- Validates all input before processing.
- Never exposes raw database errors to the frontend.

### Data / Storage

- Schema: TBD
- Migration strategy: TBD

## Data Flow

<!-- TODO: trace one critical user action end-to-end -->

```text
1. User does X
2. Frontend calls Y
3. Backend does Z
4. Storage persists W
5. Response returns to UI
```

## Key Decisions

<!-- Record significant architectural choices and the reason behind each -->

| Decision | Choice | Reason   |
| -------- | ------ | -------- |
| TBD      | TBD    | TBD      |

## API / Interface Contract

<!-- TODO: list main endpoints or IPC channels once defined -->
TBD
