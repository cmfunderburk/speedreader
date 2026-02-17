# Comprehension Improvement Milestone Board

Last updated: 2026-02-17

## Decision Log (Locked)
- Cost/latency guardrails:
  - Keep `gemini-3-flash-preview` as the default model.
  - Do not enforce a hard excerpt budget right now.
  - Add UI guidance copy for long passages and monitor latency/cost outcomes.
- Privacy:
  - Build a `Send full text` vs `Send excerpt only` toggle now.
  - Default to `Send full text` while testing in development.
  - Keep implementation flexible so default behavior can be revisited later without schema churn.
- Data model compatibility:
  - `hintsUsed` is a free-form `string[]` for forward compatibility.
- Scheduling metadata:
  - Keep schedule placeholders nested on question records in PR4.
  - Move to a dedicated scheduler store in PR7 for active due-queue state.
- Malformed optional comprehension fields:
  - Preserve attempts when required fields are valid.
  - Sanitize invalid optional fields on load/migration and emit dev-only warnings.

## Milestone Board

| Milestone | Status | Goal | PR slices |
|---|---|---|---|
| M0: Plan Lock | Done | Freeze scope + sequencing for first implementation wave | PR0 |
| M1: Reliability Foundation | Done | Improve request reliability and parsing stability without changing user flows | PR1, PR2, PR3 |
| M2: Data + Scoring Foundations | In Progress | Add richer schema, key-point scoring, confidence capture, calibration output | PR4, PR5, PR6 |
| M3: Spaced Recheck | Planned | Introduce due-item scheduling and recheck loop | PR7 |
| M4: Mode Expansion | Planned | Add interleaving + first new mode family expansions | PR8 |
| M5: Evaluation Harness | Planned | Add adversarial/golden scoring tests and experiment instrumentation | PR9 |
| MX: Platform Spike (Optional) | Backlog | Tauri feasibility spike, not blocking comprehension improvements | PRX |

## PR Slices

### PR0 - Milestone Board + Scope Lock
Status: Done

Scope:
- Convert research synthesis into an implementation board with dependencies and acceptance criteria.
- Record guardrail/privacy decisions from discussion.

Exit criteria:
- Board exists in `docs/` and becomes the source of truth for sequencing.

---

### PR1 - Reliability Foundation (Transport + Schema Plumbing)
Status: Done

Scope:
- Move Gemini auth from URL query parameter to request header.
- Add adapter support for schema-driven response parsing.
- Centralize schema definitions used by generation and scoring calls.
- Preserve current generation/scoring behavior and errors.
- Keep Flash as default model.
- Keep existing quick-check and exam UX unchanged.

Primary files:
- `src/lib/comprehensionAdapter.ts`
- `src/lib/comprehensionSchemas.ts` (new)
- `src/lib/comprehensionAdapter.test.ts`
- `README.md`

Verification:
- `bun run test:run src/lib/comprehensionAdapter.test.ts`
- `bun run lint`

---

### PR2 - Quick-Check Structured Output Migration
Status: Done

Scope:
- Migrate quick-check generation/scoring to schema-first outputs.
- Remove brittle fence-snippet dependence where possible.

Primary files:
- `src/lib/comprehensionPrompts.ts`
- `src/lib/comprehensionPrompts.test.ts`
- `src/lib/comprehensionAdapter.ts`

Verification:
- `bun run test:run src/lib/comprehensionPrompts.test.ts`
- `bun run test:run src/components/ComprehensionCheck.test.tsx`

---

### PR3 - Exam Structured Output Migration
Status: Done

Scope:
- Migrate exam generation pipeline to schema-first outputs.
- Preserve invariant checks (section mix, source coverage, format constraints).

Primary files:
- `src/lib/comprehensionExamPrompts.ts`
- `src/lib/comprehensionExamPrompts.test.ts`
- `src/lib/comprehensionAdapter.ts`

Verification:
- `bun run test:run src/lib/comprehensionExamPrompts.test.ts`
- `bun run test:run src/components/ComprehensionCheck.test.tsx`

---

### PR4 - Comprehension Schema v3
Status: Done

Scope:
- Add optional fields for:
  - item mode, key points, latency target
  - confidence, withheld, hints used, time-to-answer
  - schedule metadata placeholders
- Add backward-compatible validation and migration.

Primary files:
- `src/types/index.ts`
- `src/lib/storage.ts`
- `src/test/storage-helpers.test.ts`

Verification:
- `bun run test:run src/test/storage-helpers.test.ts`
- `bun run verify`
- `bun run electron:build` (types/storage touched)

---

### PR5 - KeyPoints-First Scoring
Status: Planned

Scope:
- Add key-point extraction to generated items.
- Score against key points rather than only narrative model answer.
- Persist key-point hit/miss results.

Primary files:
- `src/types/index.ts`
- `src/lib/comprehensionPrompts.ts`
- `src/lib/comprehensionExamPrompts.ts`
- `src/components/ComprehensionCheck.tsx`

Verification:
- `bun run test:run src/lib/comprehensionPrompts.test.ts`
- `bun run test:run src/components/ComprehensionCheck.test.tsx`

---

### PR6 - Confidence + Calibration UX
Status: Planned

Scope:
- Add per-question confidence capture (1-5).
- Add optional withhold/not-sure action.
- Add calibration summary in results/history.
- Add privacy controls:
  - `Send full text` (default in dev)
  - `Send excerpt only`
- Add non-blocking UI guidance copy for long passages (no hard excerpt cap).

Primary files:
- `src/components/ComprehensionCheck.tsx`
- `src/components/HomeScreen.tsx`
- `src/components/SettingsPanel.tsx`
- `src/types/index.ts`

Verification:
- `bun run test:run src/components/ComprehensionCheck.test.tsx`
- `bun run test:run src/components/HomeScreen.test.tsx`
- `bun run lint`

---

### PR7 - Spaced Recheck Scheduler + Flow
Status: Planned

Scope:
- Add default spaced schedule (`+1d`, `+4d`, `+14d`), configurable later.
- Add due-item queue and launch path from Home.
- Reuse scoring stack for micro-rechecks.

Primary files:
- `src/lib/comprehensionSchedule.ts` (new)
- `src/lib/storage.ts`
- `src/lib/appViewState.ts`
- `src/components/App.tsx`
- `src/components/HomeScreen.tsx`

Verification:
- `bun run test:run`
- `bun run verify`
- `bun run electron:build` (shared contracts touched)

---

### PR8 - Interleaved Drill + Mode Expansion
Status: Planned

Scope:
- Add interleaved mixed drills across sources.
- Add first expanded modes:
  - Elaborative Interrogation
  - Self-Explanation
- Keep argument-map and synthesis-v2 as follow-on work after telemetry.

Primary files:
- `src/lib/comprehensionPrompts.ts`
- `src/components/ComprehensionExamBuilder.tsx`
- `src/lib/appViewState.ts`
- `src/components/App.tsx`

Verification:
- `bun run test:run`
- `bun run verify`

---

### PR9 - Evaluation Harness + Experiment Hooks
Status: Planned

Scope:
- Add golden scoring fixtures and adversarial scoring tests.
- Add local experiment flags and event logging for:
  - MCQ-heavy vs short-answer-heavy
  - immediate vs delayed feedback
  - schedule variants

Primary files:
- `src/lib/comprehensionPrompts.test.ts`
- `src/lib/comprehensionExamPrompts.test.ts`
- `src/components/ComprehensionCheck.test.tsx`
- `src/lib/storage.ts`

Verification:
- `bun run test:run`
- `bun run verify:ci`

---

### PRX - Tauri Feasibility Spike (Optional)
Status: Backlog

Scope:
- Validate a minimal desktop shell and one Gemini call via backend boundary.
- Do not block comprehension feature delivery.

Exit criteria:
- Clear go/no-go memo with migration cost and risk profile.

## Sequencing Rules
- Do not start PR4+ until PR1-PR3 are merged.
- Do not start PR7 until PR4-PR6 are merged.
- Run `bun run verify` before merge on every PR.
- Run `bun run electron:build` for any PR that changes shared types/storage/config.

## Out-of-Scope (Current Wave)
- Mandatory excerpt truncation/budget enforcement.
- Full platform migration away from Electron.
- Argument Map mode and Synthesis v2 implementation.
