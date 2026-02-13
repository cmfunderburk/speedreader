# Reader Exam Mode V2 Implementation Guide (Reconciled)

Status: Draft  
Owner: Product/Engineering  
Related docs:
- `docs/brainstorming/comprehension-exam-mode-v2-plan.md` (source-of-truth for V2 scope)
- `docs/brainstorming/deep-research-report.md` (reference rationale and post-V2 backlog)
- `docs/brainstorming/comprehension-companion-v1-spec.md`

## Purpose

This guide defines what is required to ship Exam Mode in V2 while preserving a clear path for reliability and psychometric upgrades later.

It separates work into:
1. **Required for V2** (ship criteria)
2. **Post-V2 / Experiment Track** (recommended next steps, not blocking V2)

If there is a conflict, follow `comprehension-exam-mode-v2-plan.md` for implementation decisions.

## Document Role and Scope Guardrails

1. `comprehension-exam-mode-v2-plan.md` and this guide are **normative** for V2 delivery.
2. `deep-research-report.md` is a **reference document** for rationale and future options.
3. Items that appear only in the deep research document do **not** become V2 requirements unless promoted into the V2 plan/guide.
4. V2 should ship as **Exam Lite**. Reliability/psychometric upgrades are intentionally deferred unless explicitly re-scoped.

## 1. Product Scope (Required for V2)

### Two experiences under Comprehension

1. **Quick Check**
   - Single article
   - Existing behavior remains intact
   - Entry points: post-reading CTA + launcher

2. **Exam Mode**
   - Multi-select 2-6 chapters/articles
   - Presets: `quiz`, `midterm`, `final`
   - Sectioned progression with broader cross-chapter coverage
   - Launcher-first flow via Exam Builder

### Presets and section mix

Locked preset blueprint for V2:
1. `quiz`: 12 questions, target 12-18 minutes
   - Section counts: recall 3, interpretation 5, synthesis 4
2. `midterm`: 18 questions, target 25-35 minutes
   - Section counts: recall 5, interpretation 8, synthesis 5
3. `final`: 24 questions, target 40-60 minutes
   - Section counts: recall 6, interpretation 11, synthesis 7

Design intent remains approximately:
1. Recall (closed-book): 25%
2. Interpretation/structure (open-book): 45%
3. Synthesis/evaluative (open-book): 30%

### Non-goals (V2)

1. Strict proctoring or hard timers
2. Default cross-book syntopical exams
3. Psychometric calibration as a release dependency (CTT/IRT)
4. Mandatory citation-level evidence extraction/verification pipeline
5. Mandatory multi-pass distractor generation pipeline

### Exam Lite Scope Lock (V2)

Required for this release:
1. Keep Quick Check behavior intact
2. Add Exam Builder (2-6 selected chapters/articles)
3. Add bounded deterministic context packing for exam generation
4. Add strict JSON parsing/validation for exam output with one retry on malformed output
5. Add section-level score summaries and source coverage indicators

Explicitly deferred:
1. Mandatory evidence-span anchoring/verification
2. Two-pass distractor pipelines and answer-key alignment validation loops
3. Psychometric calibration pipelines (CTT/IRT)
4. Integrity/proctoring systems beyond existing sequencing and basic randomization

## 2. UX and Navigation (Required for V2)

### Home card CTA set

1. `Quick Check`
2. `Build Exam`
3. `Review History`

### Builder flow

1. Preset step: `quiz` / `midterm` / `final`
2. Scope step:
   - choose group/book (when at least one group has 2+ eligible chapters/articles)
   - select 2-6 chapters/articles
   - show coverage summary
   - group fallback rule:
     - if one or more groups have at least 2 chapters/articles, require selecting a single group and scope within it
     - if no group has at least 2 eligible chapters/articles, switch to ungrouped mode and allow 2-6 selections from the full library
3. Options step:
   - difficulty target (`standard` / `challenging`)
   - open-book policy confirmation for synthesis (default open)
4. Generate step:
   - progress state
   - cancel/retry actions

### Exam runtime flow

1. Reuse `ComprehensionCheck` surface where practical
2. Closed-book section first, then open-book sections
3. Preserve back/next + final submit behavior
4. Results include:
   - overall score
   - section-level breakdown
   - source coverage indicator

## 3. Data Contracts (Required for V2)

### Core additions

Add run metadata while keeping backward compatibility with existing attempts:

1. `ComprehensionRunMode = 'quick-check' | 'exam'`
2. `ComprehensionExamPreset = 'quiz' | 'midterm' | 'final'`
3. `ComprehensionExamSection = 'recall' | 'interpretation' | 'synthesis'`
4. `ComprehensionSourceRef` (`articleId`, `title`, `group?`)

Generated exam questions should include:
1. `section`
2. `sourceArticleId`

### Compatibility rules

1. Keep storage key `speedread_comprehension_attempts`
2. New exam fields should be optional in persisted attempts
3. V1 attempts must load unchanged
4. History cap remains 200 attempts

### Naming and enum consistency

Use existing format conventions in code contracts:
1. `true-false` (not `true/false`)
2. Existing dimension/format enums remain valid for Quick Check

## 4. Generation Architecture (Required for V2)

### Adapter contract

1. Keep existing `generateCheck(...)` path unchanged
2. Add `generateExam(...)` for exam mode
3. Keep adapter boundary provider-agnostic even if current implementation targets Gemini

### Context packing

Introduce deterministic bounded packing for multi-source exam generation:

1. Build per-source excerpt packets (title + trimmed text + source markers)
2. Apply per-source and global budgets
3. Favor coverage across selected sources over depth in one source
4. Preserve source traceability for `sourceArticleId`

Context budgeting guidance (from research, configurable rather than hard-coded policy):
`ContextBudget = C - O - I - B`

Where:
1. `C` = model context window
2. `O` = reserved output tokens
3. `I` = instruction/schema overhead
4. `B` = guard band (typically 5-10%)

### Structured output

1. Return strict JSON for generation responses
2. Validate required fields in parser
3. Retry once on malformed output before surfacing failure
4. Do not require full evidence-span anchoring as a V2 ship gate

Required parser invariants for `generateExam(...)`:
1. Top-level object contains an `items` array
2. Item count matches preset exactly (`quiz` 12, `midterm` 18, `final` 24)
3. Every item has a unique `id`
4. Every item has valid `section` and `sourceArticleId`
5. Section counts match preset blueprint exactly
6. Each `sourceArticleId` belongs to the selected source set
7. If 2 or more sources are selected, at least 2 distinct sources appear in generated items
8. Format-specific checks:
   - `multiple-choice`: exactly 4 unique non-empty options and valid `correctOptionIndex`
   - `true-false`: boolean `correctAnswer`
   - `short-answer` / `essay`: non-empty `modelAnswer`
9. Difficulty-target checks (below) are satisfied
10. On any invariant failure, retry once; if retry fails, surface generation error

Difficulty target behavior (V2, deterministic):
1. Recall section remains objective-only (`multiple-choice` or `true-false`) for both targets
2. `standard`:
   - minimum constructed-response (`short-answer` or `essay`) counts:
     - `quiz`: 5
     - `midterm`: 7
     - `final`: 9
3. `challenging`:
   - minimum constructed-response (`short-answer` or `essay`) counts:
     - `quiz`: 6
     - `midterm`: 9
     - `final`: 12
   - include at least one `essay` item

## 5. Scoring and Feedback (Required for V2)

1. Keep existing objective scoring for MC/`true-false`
2. Keep free-response scoring via adapter call
3. Add section-level score summaries in results
4. Keep per-question explanatory feedback behavior

Not required for V2:
1. Mandatory second-pass rubric model for every short/essay response
2. Partial-credit psychometric calibration pipeline

## 6. QA Gates (Required for V2)

### Functional acceptance

1. Quick Check post-reading flow unchanged
2. Quick Check launcher flow unchanged
3. Builder supports 2-6 chapter selection
4. Presets enforce fixed blueprint counts:
   - quiz 12 (3/5/4), midterm 18 (5/8/5), final 24 (6/11/7)
5. Closed-book then open-book sequencing works
6. Generation failures support retry without corrupting state
7. History renders old and new attempt types

### Engineering gates

1. `bun run verify` passes
2. `bun run verify:ci` passes before PR
3. `bun run electron:build` passes when Electron-relevant files change

## 7. Post-V2 / Experiment Track (Non-blocking)

These items are valuable, but should not be treated as V2 release blockers unless explicitly promoted.

### Reliability upgrades

1. Evidence-anchor requirements (`evidenceSpan` / excerpt IDs)
2. Validate-and-repair generation loops with stricter invariants
3. Two-pass distractor generation and filtering
4. Alignment checks (NLI/LLM-assisted) for key-vs-distractor correctness
5. Prompt A/B variants (few-shot, planning-first, rerank emphasis)

### Measurement upgrades

1. Item-level response persistence for CTT metrics
2. Difficulty/discrimination reporting
3. IRT feasibility experiments on sufficient item-response volume

### Compliance and UX hardening

1. Stronger accessibility and accommodation controls
2. Copyright-minimizing evidence quote limits and retention rules
3. More explicit exam-integrity controls (randomization/retake policy)

## 8. Delivery Sequence (V2)

1. Foundation: mode/types/view-state wiring, CTA split
2. Builder: preset + scope + options flow
3. Generation/runtime: context packer + `generateExam(...)` + sectioned rendering
4. Persistence/history: exam metadata + compatibility coverage
5. QA pass: functional checklist + verify gates

## 9. V2 Decisions (Locked for this Release)

1. Mixed-group chapter selection is out of scope for V2; same-group selection is the default behavior.
2. Preset question counts stay fixed by preset in V2 (no chapter-count auto-scaling).
3. Synthesis prompts should be cross-source in generation intent, but user-facing citation requirements are not mandatory in V2.
