# Near-Verbatim Memorization Project: Companion Recommendations

Status: Companion notes / implementation suggestions
Date: 2026-02-21

This document complements `docs/memorization-project.md` with extra product and implementation recommendations. It aims to reduce ambiguity in the "what counts" questions (text canonicalization, scoring, mastery), and to suggest a pragmatic path to a first shippable version inside Reader.

## 1. Clarify the Core Contract (What Exactly Are We Memorizing?)

Near-verbatim practice only works long-term if the system is consistent about what it thinks the "correct text" is.

Recommendations:

- **Canonical text snapshot per passage**: store the exact text as captured and never silently mutate it.
- **Text versioning**: attach a stable `textHash` (or `sourceHash`) to each passage/work so later edits to an article/work do not invalidate history invisibly.
- **Explicit normalization policy**: define what "exact" means for each mode. Examples:
  - Prose exact: case-insensitive, punctuation-insensitive, Unicode-normalized, diacritics-aware (configurable).
  - Verse exact: line-break-aware (see verse mode below).
  - "Typo tolerance": optional for learning; off for final mastery checks.
- **Tokenization invariants**: decide how to treat hyphenation, apostrophes, em-dashes, ellipses, and abbreviations. A surprising amount of user frustration comes from inconsistent token boundaries, not from memory failure.

Pragmatic default: make normalization forgiving by default during learning, but provide a "verbatim strict" toggle for mastery validation.

## 2. Scheduling: Use a Real Model, but Start With a Minimal Surface Area

The best leverage in `docs/memorization-project.md` is correct: algorithmic scheduling turns a manual practice into a sustainable portfolio.

Recommendations:

- **Pick one scheduler and commit**:
  - If you want maximal long-term quality: FSRS-style stability/difficulty modeling.
  - If you want simplest possible first pass: SM-2 style intervals, with a clean migration path.
- **Define a fixed rating scale** that can be derived from typed recall (and optionally from self-report playback):
  - `Again` (failed / blank)
  - `Hard` (barely recovered)
  - `Good` (correct with effort)
  - `Easy` (correct and automatic)
- **Map Reader scoring -> scheduler rating** explicitly. For typed recall:
  - Use both `exact` and `known` scores, but do not let "typo tolerance" distort scheduling in strict mode.
  - Consider a penalty for preview forfeits (Tab preview) and for hinting (first-letter scaffold) so the scheduler sees "assisted performance" as less stable.
- **Store schedule metadata per passage** (and later per granularity level):
  - `nextDueAt`, `lastReviewedAt`
  - `stability`, `difficulty` (or their SM-2 equivalents)
  - `lapseCount`
  - `lastGrade` and `lastScore` (for debugging and analytics)

Minimal ship target: a "Due today" queue (plus overdue) and automatic rescheduling on each review completion.

## 3. Mastery: Separate Learning, Maintenance, and Demonstration

The document notes that verbatim recall wants ~100%. True, but requiring 100% from the beginning can slow acquisition and create demoralizing loops.

Recommendations:

- **Three distinct states** (per passage, and later per paragraph/section):
  1. `Learning`: assistance allowed (scaffold, previews) and non-perfect performance acceptable.
  2. `Maintenance`: scheduler-driven reviews; assistance optional but recorded.
  3. `Demonstration`: strict checks, used to mark "mastered" and to confirm durable retention.
- **Mastery definition as a streak across time**, not a single performance:
  - Example: "mastered" requires `N` consecutive strict-perfect recalls, each separated by at least `X` days, with no lapses.
- **Graceful lapses**: a lapse should not delete progress; it should reduce stability and increase review frequency.

This approach aligns with real practice: learning is not maintenance, and maintenance is not the same as proving mastery.

## 4. Progressive Granularity: Make "Sentence -> Paragraph -> Section" a First-Class Ladder

The existing one-sentence drill constraint is exactly the kind of sharp edge that blocks near-verbatim work.

Recommendations:

- **Granularity ladder**:
  - Sentence units: acquisition and quick checks.
  - Paragraph units: composition of mastered sentences.
  - Section units (optional): composition of paragraphs for "mental playback" and long-form retention.
- **Graduation rules**:
  - Sentence set graduates to paragraph practice when sentence mastery hits a threshold (or schedule stability is above a cutoff).
  - Paragraph practice can occasionally "spot-check" constituent sentences to prevent brittle composition.
- **Interleaving**: once a work has enough mastered units, interleave older units into learning sessions to avoid a "front-loaded" memory decay.

Implementation note: keep the scheduler metadata at the unit level that is actually reviewed. If paragraph-level reviews exist, they need their own schedule, not just inherited sentence schedules.

## 5. Work/Portfolio Entities: Model the Practice, Not Just Captured Passages

Captured passages are a good bootstrap, but a memorization project needs an explicit "work" concept.

Recommendations:

- **Work entity**:
  - `title`, `author`, `language`, `edition/translation`, `source`
  - segmentation config (sentence rules, verse rules)
  - ordered curriculum: list of units with stable IDs
- **Portfolio view**:
  - cross-work "due" queue
  - per-work progress: units learned, units due, recent lapses
  - session planner: pick a time budget (10/20/40 minutes) and generate a mixed set (maintenance + learning)

Keep the MVP small: a work is just a named collection of passages plus ordering metadata.

## 6. Verse Mode: Treat Line Breaks as Meaning, Not Formatting

Verse memorization is not word-by-word prose memorization.

Recommendations:

- **Line-based scoring**:
  - primary unit: line
  - allow minor punctuation variance (configurable)
  - optionally track meter-relevant tokens, but do not make that v1
- **Reveal UX**:
  - "line-by-line reveal" for playback checks
  - optional "hide every Kth line" spot-checks during maintenance
- **Layout-preserving capture**:
  - capture should preserve line breaks exactly, and training display should avoid reflow that changes lineation.

## 7. Non-English / Non-Latin Support: Decide Early, Because It Touches Scoring

If German, Greek, and later other scripts are in scope, ASCII-only normalization will mis-score.

Recommendations:

- **Unicode-aware normalization**:
  - normalize to a consistent form (NFKC or NFC) before tokenization/scoring
  - decide whether to fold diacritics (often "no" for language learning, "yes" for cross-keyboard tolerance)
- **Tokenization by Unicode categories** rather than `[A-Za-z]` heuristics.
- **Detail-word detection must be language-aware**:
  - case-based proper noun heuristics work for German/English but fail in scripts without case.
  - provide a per-work setting: "treat capitalization as detail" on/off.

Even if Greek is "later", build the scoring pipeline so it does not assume ASCII.

## 8. Reduce Typing Friction Without Losing Rigor

Typing every word is a high-friction interface for maintenance at scale.

Recommendations:

- **Mental playback mode with scheduled spot-checking**:
  - self-report grade (Again/Hard/Good/Easy)
  - occasional typed verification: hide a random subset of sentences/lines and require exact recall for those
- **Chunked input**:
  - allow users to type an entire sentence/line at once and score token-level differences afterward (faster than word-by-word submit).
- **Assistive modalities** (optional):
  - dictation input (speech-to-text) as a lower-friction capture of recall, with strict scoring afterward

Key principle: the scheduler can tolerate some noisy self-report if you periodically re-anchor with strict typed checks.

## 9. Metrics That Matter (and Those That Don't)

Long-horizon projects need feedback loops, but the wrong metrics incentivize the wrong behavior.

Recommendations:

- **Top metrics**:
  - due count by day and by work
  - stability trend per work (are items becoming easier over months?)
  - lapse rate (and where lapses happen: learning vs maintenance)
- **Avoid "vanity" speed metrics** for memorization practice; WPM is helpful for reading but can distort recall training incentives.
- **Debug view for scheduling** (optional but very helpful): show last grade, next due, and stability/difficulty so the system is inspectable.

## 10. Data Portability and Safety

If this is lifelong, local-only data needs basic durability.

Recommendations:

- **Export/import**:
  - JSON export of works, passages, and scheduling metadata
  - import with conflict resolution (merge by stable IDs)
- **Backups**:
  - remind users (or auto-prompt) when a portfolio grows past a threshold
- **Privacy**:
  - keep everything local by default; if sync is later added, design for end-to-end encryption early.

## 11. A Pragmatic v1 -> v2 Path

Suggested first shipping sequence:

1. **Passage scheduling v1**: due queue + rescheduling on review completion (typed recall only).
2. **Mastery controls**: configurable threshold and streak-based mastery definition.
3. **Progressive drill**: allow 1/2/paragraph length for drills; start with prose.
4. **Work entity**: grouping + ordering + per-work settings (language, strictness, detail-word rules).
5. **Mental playback mode**: self-report + scheduled spot-checks.
6. **Verse mode**: line-based capture and scoring.

This order keeps the project "useful immediately" while steadily reducing friction and increasing scope.

## 12. Extra Open Questions (Worth Deciding Before Building)

- **Canonicalization policy**: if a user edits captured text (fixing OCR, choosing a different translation), do we treat it as the same unit with a new version, or a new unit?
- **Granularity interaction**: when paragraph and sentence schedules disagree, which drives the day plan?
- **Assistive credit assignment**: should assisted recalls (scaffold on, preview used) update stability at all, or only partially?
- **Time budgeting**: do we optimize for a fixed daily time budget (most realistic) or for clearing all due items (often unrealistic)?

