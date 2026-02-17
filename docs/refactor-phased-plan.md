# Refactor Plan (Phased)

Last updated: February 12, 2026.

For PR open/close criteria and final go/no-go gates, see `docs/refactor-pr-readiness-plan.md`.

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
- `bun run lint`
- `bun run test:run`
- `bun run build`
- `bun run typecheck:electron`

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
- [x] Extract `TrainingReader` reading sweep and scaffold recall transition planning into pure state logic.
- [x] Extract `TrainingReader` scoring/finalization math into pure helpers with tests.
- [x] Extract `TrainingReader` recall token scoring and preview-key derivation into pure helpers with tests.
- [x] Extract `TrainingReader` give-up remaining-miss scoring into pure helper logic.
- [x] Extract `App` escape-key navigation planning into pure helper logic.
- [x] Extract `App` passage-review launch/session planning into pure helper logic.
- [x] Extract `App` featured daily/random launch cache+upsert flow into shared helper logic.
- [x] Extract `App` passage-review queue ordering logic into pure helper logic.
- [x] Extract `App` continue-session and header back-action selectors into pure helper logic.
- [x] Extract `App` feed add/refresh merge and timestamp transition planning into pure helper logic.
- [x] Extract `TrainingReader` finish-recall feedback/sentence-advance planning into pure helper logic.
- [x] Extract `TrainingReader` scaffold recall-submission planning (miss/advance/finish) into pure helper logic.
- [x] Extract `App` passage capture sentence/paragraph/last-lines selection planning into pure helper logic.
- [x] Extract `App` featured daily/random fetch result and error-message planning into shared helper logic.
- [x] Phase 3 closure: audit remaining `App` callbacks and classify each as either planner-backed or intentionally wiring-only (no business branching).
- [x] Extract `TrainingReader` miss-continue transition branching (`handleMissContinue`) into pure planner/helper logic.
- [x] Extract `TrainingReader` no-scaffold token-input parsing flow (`handleRecallInputChange`) into pure helper logic.
- [x] Add one integration smoke test for `App` mode/session transitions (home/content-browser/preview/active-reader/back).
- [x] Add one integration smoke test for `TrainingReader` recall transitions (miss/continue/finish/feedback/continue).
- [x] Refresh `docs/refactor-session-handoff-2026-02-12.md` with current HEAD and validation totals after Phase 3 closure.

Exit criteria:
- All Phase 3 checklist items above are complete.
- `App` and `TrainingReader` retain behavior parity for mode transitions and session restore.
- Transition tables and edge paths are covered by pure-helper tests plus the new integration smoke tests.

### App callback audit (2026-02-12)
- Planner-backed callbacks: `closeActiveExercise`, `handleStartDaily`, `handleStartRandom`, `handleContentBrowserSelectArticle`, `handleStartReading`, `handleContinue` (via `appViewSelectors`, `sessionTransitions`, `featuredArticleLaunch`, and related helpers).
- Intentionally wiring-only callbacks: `handleSelectActivity`, `handleStartDrill`, `handleProgressChange`, and direct settings toggles that only dispatch UI state/storage writes without branching domain rules.

## Phase 4: Scaling + Quality Gates
- [x] Decide storage strategy for this PR scope: keep `localStorage` and document explicit re-evaluation triggers.
- [x] Add coverage thresholds for `components` and critical state modules.
- [x] Standardize CI checks to include web + Electron type checks.
- [x] Add a single local gate command (`bun run verify`) to run lint + tests + build consistently.
- [x] Add CI gate command (`bun run verify:ci`) to enforce coverage thresholds before build.

Exit criteria:
- Storage strategy is explicitly documented and deferred/implemented intentionally.
- CI fails on regressions in type checks and agreed coverage gates.

## Current Status
- This phased refactor scope is complete and ready for PR packaging.
- Remaining improvement opportunities are tracked in:
  - `docs/refactor-pr-readiness-plan.md` (`Future Pass Improvement Areas`)
  - `docs/refactor-pr-draft.md` (`Future Improvement Areas (Post-PR)`)
