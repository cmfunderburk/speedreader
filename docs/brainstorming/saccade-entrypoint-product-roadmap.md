# Saccade-First Product Roadmap

Status: Draft  
Owner: Product/Engineering  
Audience: Maintainers, testers, power users  

## Purpose

Define a practical and ambitious roadmap for making Saccade mode the natural paced-reading entrypoint, while reducing friction for study workflows that combine:

1. Paced reading
2. Recall/prediction practice
3. Passage-level review and repetition

This document is intended for iterative review during QA and user testing.

## Current State (After Recent Improvements)

The product now has a strong Saccade foundation:

1. Saccade is the default launch path for Paced Reading.
2. Figure-aware rendering is available in Saccade.
3. Figure sizing/pagination is substantially improved.
4. Paused-state click-to-zoom is available for figures.
5. Statistical Rethinking chapter extraction for local use has been validated in-app.

Main remaining gap: moving between read and train states is still too manual for serious learners.

## Product Hypothesis

If we treat reading as the center of a learning loop, then users should be able to move from:

1. Reading a meaningful passage
2. Capturing it instantly
3. Testing memory/prediction on that exact passage
4. Returning to the same reading flow

with near-zero navigation overhead.

Expected result: more repetitions per session, better retention, less setup friction.

## User Archetypes and Likely Workflows

## Avid Reader (Throughput-Focused)

Goal: cover more material while maintaining comprehension.

Likely loop:

1. Open text in Saccade.
2. Pause at dense or interesting section.
3. Quick check (prediction/recall) on short passage.
4. Resume reading at the same position.

Pain today: context switch overhead is high; passage targeting is manual.

## Autodidact (Retention-Focused)

Goal: convert reading into durable knowledge.

Likely loop:

1. Read in Saccade.
2. Save key passages/claims/definitions.
3. Review saved passages later with spaced recall.
4. Re-read only when needed.

Pain today: no dedicated passage object or review queue.

## Analyst/Technical Reader (Precision-Focused)

Goal: deeply understand methods, equations, and argument structure.

Likely loop:

1. Read with figures/equations in Saccade.
2. Zoom or inspect visuals.
3. Test understanding using targeted prompts.
4. Compare confidence over time.

Pain today: limited tooling for passage-level metadata and progression tracking.

## Friction Map (Current)

1. Mode handoff friction.
Context is lost when moving from Saccade to Recall/Prediction.

2. Passage targeting friction.
No single action to select "this exact chunk/paragraph/range for training."

3. Loop restart friction.
Returning to original reading position requires extra user effort.

4. Review planning friction.
No clear queue for "what should I revisit next?"

## Product Principles

1. Reading-first.
Training features should feel like extensions of reading, not separate apps.

2. Low ceremony.
Capture, review, and resume should require minimal clicks and no repeated setup.

3. Passage-centric.
The core unit for training should be a saved passage with stable offsets and metadata.

4. Progressive complexity.
Ship low-risk primitives first; layer adaptive/intelligent systems later.

## Near-Term Direction (Recommended First Build)

## 1) Passage Capture Primitive

Add a durable `Passage` model:

1. `id`
2. `articleId`
3. `startOffset`, `endOffset` (or line/chunk anchors + fallback text hash)
4. `sourceMode` (saccade/rsvp/etc.)
5. `createdAt`, `lastReviewedAt`
6. Optional tags (`definition`, `argument`, `formula`, `quote`)

Capture actions in paused Saccade:

1. Save current line
2. Save paragraph
3. Save last N lines

## 2) One-Click Mode Handoff

From a saved passage:

1. Open in Prediction
2. Open in Recall
3. Return to reading position

Handoff should preserve:

1. Source article
2. Passage boundary
3. Intended review mode

## 3) Lightweight Review Queue

Add a "Today/Next Up" queue seeded by:

1. New captures
2. Passages marked difficult
3. Recently failed recall/prediction attempts

Queue operations:

1. Start review session
2. Skip
3. Snooze
4. Mark easy/hard

## 4) Session Continuity

Add session snapshots:

1. Current reading anchor
2. Last training anchor
3. Last transition path (`read -> recall -> read`)

Make "Back to reading" deterministic and instant.

## Medium-Term Extensions

## 1) Passage Workspace

Dedicated surface for:

1. Saved passages by book/chapter/tag
2. Quick filtering and search
3. Batch review launch

## 2) Workflow Templates

User-selectable session templates:

1. Read-only sprint
2. Read + periodic prediction checks
3. Read + end-of-chapter recall drill

## 3) Friction-Aware Prompts

Optional unobtrusive prompts:

1. "Save this passage?" after repeated pauses
2. "Quick recall before moving on?" at chapter boundaries

## Ambitious Ideas (Longer Horizon)

## 1) Adaptive Review Scheduling

Use difficulty signals to schedule passage resurfacing:

1. Prediction loss
2. Recall misses
3. Time since last successful retrieval

Could evolve toward a spaced repetition model tailored to prose passages.

## 2) Passage Graphs

Build semantic links between passages:

1. Definitions linked to examples
2. Claims linked to evidence
3. Formula passages linked to conceptual explanations

Use graph links to produce "follow-up review chains."

## 3) Contextual Comprehension Checks

Move beyond single-word prediction:

1. Next-sentence prediction
2. Short claim reconstruction
3. Explain-in-own-words prompts

## 4) Multimodal Saccade Training

Extend figure handling into training loops:

1. Figure-to-caption recall
2. Diagram-based question prompts
3. “Interpret this figure” checkpoints

## 5) Adaptive Pace Policy

Dynamic Saccade pacing tied to user behavior:

1. Slow down around repeatedly difficult passages
2. Increase speed in stable sections
3. Use confidence signals to tune transitions

## Technical Notes and Constraints

1. Passage anchors should be robust to content normalization.
2. Mode handoff must avoid re-tokenization drift where possible.
3. Storage schema must support migration from article-only history.
4. Figure/image support should remain Saccade-only unless intentionally expanded.
5. Content-specific local processing workflows remain local-only and out of repo.

## Success Metrics

## Core Loop Metrics

1. Time from pause to starting recall/prediction on a target passage.
2. Number of read->train->read loops per session.
3. Percentage of training sessions launched from saved passages.

## Learning Metrics

1. Recall accuracy trend by passage age.
2. Prediction loss trend by passage and chapter.
3. Revisit count before a passage is marked “stable.”

## Engagement Metrics

1. Weekly active sessions with both reading and training actions.
2. Average session depth (minutes + transitions + completed reviews).

## Proposed Rollout Plan

## Phase 1 (Low Risk, High Leverage)

1. Passage model and storage
2. Paused Saccade capture controls
3. Basic handoff into Recall/Prediction
4. Return-to-reading action

## Phase 2

1. Review queue UI
2. Passage workspace
3. Session template options

## Phase 3

1. Adaptive scheduling
2. Passage graphing
3. Advanced comprehension checks

## Open Questions for Ongoing Testing

1. What capture granularity is most useful in practice (line vs paragraph vs custom range)?
2. Should handoff default to Prediction or Recall?
3. How often should review prompts appear before they feel interruptive?
4. Which metrics best correlate with perceived comprehension gains?
5. What does "good enough" flow latency look like for mode switching?

## Immediate Next Step Recommendation

Implement Phase 1 as a narrow vertical slice behind a feature flag:

1. Capture one passage type (paragraph).
2. Support one handoff path (Saccade -> Recall).
3. Add one "resume reading" return path.

Then validate with real sessions before broadening scope.

