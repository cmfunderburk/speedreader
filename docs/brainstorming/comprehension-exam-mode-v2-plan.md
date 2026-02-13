# Comprehension Exam Mode V2 Plan

Status: Draft  
Owner: Product/Engineering  
Related docs:
- `docs/brainstorming/comprehension-companion-v1-spec.md`
- `docs/brainstorming/comprehension-companion-v1-implementation-plan.md`
- `docs/brainstorming/deep-research-report.md` (reference rationale and post-V2 backlog)

## Goal

Extend Comprehension Check into a stronger standalone activity by adding an **exam mode** that can assess understanding across multiple chapters/articles (for quiz, midterm, and final-style practice), while preserving the existing end-of-reading quick check flow.

## Document Role and Scope Guardrails

1. This plan defines the V2 release contract and is the implementation source-of-truth.
2. `reader-exam-mode-v2-guide.md` is a reconciled implementation companion for the same contract.
3. `deep-research-report.md` is a reference document; its ideas are not V2 requirements unless copied here (or into the V2 guide) as explicit scope.
4. V2 is intentionally an **Exam Lite** release; advanced reliability and psychometric systems remain post-V2.

## Current State (Already Implemented)

1. Comprehension Check is already a top-level home activity card.
2. It can also be launched from paced reading at end-of-text (`post-reading` entry point).
3. It currently runs against one selected article, generates 8-10 questions, supports mixed formats, and stores attempt history.
4. Questions are split into closed-book factual first, then open-book non-factual.

The main gap is not discoverability; it is **assessment scope and rigor** for longer-form reading (multi-chapter exams).

## Product Direction

### Two Distinct Experiences Under One Activity

1. **Quick Check (existing behavior, lightly refined)**
   - Single article
   - 8-10 questions
   - Fast feedback loop
   - Entry points: post-reading CTA + launcher

2. **Exam Mode (new)**
   - Multiple selected chapters/articles from one book/group
   - Preset exam blueprints (quiz/midterm/final)
   - Sectioned exam with broader coverage and synthesis questions
   - Entry point: launcher card first (post-reading launch can stay Quick Check in V2)

### V2 Exam Lite Scope

1. Multi-select **2-6 chapters/articles** from the same `group` (book) when available.
2. Exam presets:
   - `quiz`: **12 questions**, target 12-18 minutes (recall 3, interpretation 5, synthesis 4)
   - `midterm`: **18 questions**, target 25-35 minutes (recall 5, interpretation 8, synthesis 5)
   - `final`: **24 questions**, target 40-60 minutes (recall 6, interpretation 11, synthesis 7)
3. Section mix design intent:
   - Recall (closed-book): 25%
   - Interpretation/structure (open-book): 45%
   - Synthesis/evaluative across chapters (open-book): 30%
4. Passage-grounded only (no outside-knowledge scoring in V2).
5. Per-question feedback plus section-level score breakdown.

### Non-Goals (V2)

1. Strictly timed or proctored exam conditions.
2. Cross-book syntopical exams mixing unrelated groups by default.
3. Adaptive item response theory / psychometrics.
4. Full citation-level evidence extraction pipeline.

### Exam Lite Scope Lock (V2)

Required now:
1. Keep Quick Check unchanged.
2. Add Exam Builder with 2-6 source selection and preset-driven generation.
3. Add deterministic bounded context packing for multi-source exams.
4. Enforce strict exam JSON parsing/validation with one retry on malformed output.
5. Add section-level summaries and source coverage in results/history.

Deferred now:
1. Mandatory evidence-span anchoring or citation-level verification.
2. Two-pass distractor generation and NLI-style key/distractor alignment checks.
3. CTT/IRT measurement pipelines as release blockers.
4. Proctoring/integrity systems beyond current mode sequencing.

## UX Plan

### Home Card

Update Comprehension card CTA set:
1. `Quick Check`
2. `Build Exam`
3. `Review History` (existing)

### Exam Builder Flow (New Screen)

1. **Preset step**: quiz, midterm, final.
2. **Scope step**:
   - Choose a group/book (if grouped content exists).
   - Multi-select chapters/articles.
   - Show coverage summary (selected count, estimated read-time/length).
   - Fallback rule when `group` metadata is missing/sparse:
     - If one or more groups have at least 2 eligible chapters/articles, require single-group selection.
     - If no group has at least 2 eligible chapters/articles, switch to ungrouped mode and allow 2-6 selections across the library.
3. **Options step**:
   - Difficulty target: standard/challenging.
   - Open-book policy for synthesis section (default open-book).
4. **Generate step**:
   - Show progress while exam is generated.
   - Allow cancel/retry.

### Exam Taking Flow

1. Reuse existing `ComprehensionCheck` surface where possible.
2. Add section headers and progress by section.
3. Closed-book section first, then open-book sections.
4. Preserve back/next navigation and final submit.

### Results Flow

1. Existing per-question review depth/filter controls stay.
2. Add section summary cards:
   - Recall score
   - Interpretation score
   - Synthesis score
3. Add source coverage indicator (which chapters were assessed).

## Technical Plan

### Data and Types

Extend comprehension types to distinguish run mode and source scope.

Proposed additions in `src/types/index.ts`:
1. `ComprehensionRunMode = 'quick-check' | 'exam'`
2. `ComprehensionExamPreset = 'quiz' | 'midterm' | 'final'`
3. `ComprehensionExamSection = 'recall' | 'interpretation' | 'synthesis'`
4. `ComprehensionSourceRef` containing `articleId`, `title`, `group?`
5. Attempt metadata additions:
   - `runMode`
   - `examPreset?`
   - `sourceArticles?` (selected chapters)
   - `sectionScores?`

Extend generated question shape:
1. `section`
2. `sourceArticleId` (for cross-chapter traceability)

### Storage

`src/lib/storage.ts`:
1. Keep same key (`speedread_comprehension_attempts`) if backward compatible.
2. Add parser support for optional new fields.
3. Bump schema only if migration logic is required.
4. Keep cap at 200 attempts.

### View State and Navigation

`src/lib/appViewState.ts` and `src/lib/appViewSelectors.ts`:
1. Add `screen: 'comprehension-builder'`.
2. Extend `active-comprehension` state to carry launch config:
   - `runMode`
   - selected source articles for exam
   - preset

`src/components/App.tsx`:
1. Wire `Build Exam` button to builder screen.
2. Keep post-reading CTA mapped to quick-check mode in V2.
3. Route builder output into `ComprehensionCheck` with exam config.

### Prompting and Adapter

`src/lib/comprehensionPrompts.ts`:
1. Add exam-generation prompt builder accepting:
   - selected chapter packets
   - preset blueprint (question count + section mix)
2. Require output fields: `section`, `sourceArticleId`.
3. Add guardrails:
   - ensure synthesis questions reference multiple source chapters.
   - ensure factual questions remain source-grounded.
4. Encode deterministic difficulty behavior:
   - recall section objective-only for both `standard` and `challenging`
   - `standard`: minimum constructed-response counts by preset (`quiz` 5, `midterm` 7, `final` 9)
   - `challenging`: minimum constructed-response counts by preset (`quiz` 6, `midterm` 9, `final` 12) and at least one `essay`

`src/lib/comprehensionAdapter.ts`:
1. Extend adapter with `generateExam(...)`.
2. Keep `generateCheck(...)` unchanged for quick-check.
3. Apply strict parser invariants with one retry:
   - exact preset item counts (`quiz` 12, `midterm` 18, `final` 24)
   - exact section counts per preset
   - valid `sourceArticleId` values from selected sources
   - at least 2 distinct sources represented when 2 or more sources are selected
   - format-specific validity (MCQ options/index, true-false boolean, non-empty model answer for short/essay)

### Context Packing Strategy (Critical)

Multi-chapter input can exceed model context if naive concatenation is used.  
V2 should introduce deterministic packing in a new helper (for example `src/lib/comprehensionExamContext.ts`):

1. Per selected chapter, create a bounded excerpt packet (title + trimmed content).
2. Apply per-chapter character budget and total max budget.
3. Prefer coverage across chapters over depth in one chapter.
4. Include source markers so returned questions can reference `sourceArticleId`.

This avoids extra model calls in V2 while keeping token usage controlled.

## File-Level Implementation Plan

| Area | Files | Change |
|---|---|---|
| Types | `src/types/index.ts` | Add exam mode, preset, section, source refs, and attempt metadata fields. |
| View state | `src/lib/appViewState.ts`, `src/lib/appViewSelectors.ts` | Add builder screen and launch config flow for exam mode. |
| App wiring | `src/components/App.tsx` | Add builder routing, mode-aware launch (`quick-check` vs `exam`). |
| Home UI | `src/components/HomeScreen.tsx` | Add `Build Exam` CTA next to `Quick Check`. |
| Builder UI | `src/components/ComprehensionExamBuilder.tsx` (new) | Preset selection + multi-chapter scope selection + options. |
| Context packing | `src/lib/comprehensionExamContext.ts` (new) | Bounded multi-source prompt payload generation. |
| Prompts | `src/lib/comprehensionPrompts.ts` | Add exam prompt + parser support for section/source fields. |
| Adapter | `src/lib/comprehensionAdapter.ts` | Add `generateExam()` path. |
| Main check UI | `src/components/ComprehensionCheck.tsx` | Support section rendering and exam metadata/results. |
| Storage | `src/lib/storage.ts` | Parse/persist added attempt metadata compatibly. |
| Tests | `src/components/*.test.tsx`, `src/lib/*.test.ts` | Builder flow, prompt parsing, context packing, attempt persistence compatibility. |

## Delivery Milestones

### Milestone 1: Mode and Navigation Foundation

1. Add new types and view-state routes.
2. Add home card CTA split (`Quick Check`, `Build Exam`).
3. Keep quick-check behavior unchanged.

Acceptance:
1. Existing comprehension tests remain green.
2. New navigation paths work without runtime errors.

### Milestone 2: Exam Builder + Source Selection

1. Implement builder UI with preset selection.
2. Support multi-select chapters (2-6) with same-group default filtering.
3. Produce validated launch config.

Acceptance:
1. User can configure and start exam without manual JSON/config editing.

### Milestone 3: Exam Generation + Runtime

1. Add context packer and `generateExam()` prompt path.
2. Render sectioned exam in `ComprehensionCheck`.
3. Score and display results with section summaries.

Acceptance:
1. Midterm/final presets generate valid question sets with section/source metadata.
2. Results show both overall and section-level outcomes.

### Milestone 4: Persistence + History Improvements

1. Persist exam metadata in attempts.
2. Update history panel to display exam preset and source coverage.
3. Add migration/compat tests for older attempts.

Acceptance:
1. Old attempts still load.
2. New exam attempts round-trip with no data loss.

## QA Checklist

1. Quick Check from post-reading still works unchanged.
2. Quick Check from launcher still works unchanged.
3. Build Exam flow supports selecting multiple chapters.
4. Exam preset enforces fixed counts and section blueprint:
   - quiz 12 (3/5/4), midterm 18 (5/8/5), final 24 (6/11/7).
5. Closed-book section hides passage; later sections show passage.
6. Questions include chapter/source attribution in results.
7. Failed generation can retry without corrupting state.
8. History renders both old quick-check and new exam attempts.
9. `bun run verify` passes.

## V2 Decisions (Locked for this Release)

1. Chapter selection is same-group by default; mixed-group selection is out of scope for V2.
2. Exam timing remains advisory only in V2 (no strict timer/proctoring).
3. Synthesis generation should encourage cross-source reasoning, but explicit user citation requirements are not mandatory in V2.
4. Question counts remain fixed by preset in V2 (no chapter-count auto-scaling).
