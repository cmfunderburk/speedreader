# Refactor Plan (Phased)

Last updated: February 12, 2026.

## Goals
- Reduce feature coupling in large orchestration files.
- Make boundaries explicit across renderer, Electron, and persistence layers.
- Improve confidence for future changes via stronger type and test gates.

## Phase 1: Foundations (low risk, structural)
- [x] Add shared Electron IPC contract types (`shared/electron-contract.ts`).
- [x] Remove duplicated preload/renderer contract declarations.
- [x] Add Electron TypeScript type-checking (`tsconfig.electron.json` + scripts).
- [x] Move training preference persistence behind storage helpers.
- [x] Follow-up: dependency hygiene pass (remove unused direct deps after validation).

Exit criteria:
- `npm run lint`
- `npm run test:run`
- `npm run build`
- `npm run typecheck:electron`

## Phase 2: Persistence Boundary
- [x] Move remaining direct UI storage access into `src/lib/storage.ts`.
- [x] Introduce explicit storage schema version and migration helpers.
- [x] Add migration tests for backward compatibility.

Exit criteria:
- Existing and migration tests pass.
- No direct `localStorage` access outside storage layer for app-owned keys.

## Phase 3: State Orchestration Split
- [x] Extract `App` view-state transitions into a reducer module.
- [x] Extract close-active-exercise transition planning into pure transition logic.
- [x] Extract launch/continue session planning (`preview`, `continue`, `daily/random`) into pure transition logic.
- [x] Extract `TrainingReader` continue/start phase planning into pure state logic.
- [ ] Continue extracting remaining `App` navigation/session transitions from component callbacks.
- [ ] Continue extracting remaining `TrainingReader` phase transitions into pure state logic.
- Keep rendering components focused on view concerns.

Exit criteria:
- Behavior parity for mode transitions and session restore.
- New tests cover transition tables and edge paths.

## Phase 4: Scaling + Quality Gates
- Evaluate moving large payload storage from `localStorage` to IndexedDB/SQLite.
- Add coverage thresholds for `components` and critical state modules.
- Standardize CI checks to include web + Electron type checks.

Exit criteria:
- Storage strategy documented and implemented for large-content paths.
- CI fails on regressions in type checks and agreed coverage gates.
