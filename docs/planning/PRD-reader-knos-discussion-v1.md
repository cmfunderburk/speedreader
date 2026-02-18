# PRD: Reader KnOS Discussion Integration (V1)

Status: Draft
Date: 2026-02-17
Project Type: Implementation Project
Scope Baseline: Interview decisions captured after `docs/reader-knos-thoughts.md` review

## 1. Objective
Add a KnOS-inspired discussion layer to Reader comprehension checks, with V1 focused on post-check continuation tutoring while preserving existing assessment flows.

## 2. Locked Scope Decisions
1. Product scope: Milestones A+B (discussion primitives + post-check continuation).
2. Flow priority: continuation-first (`Continue with tutor`) over per-question depth.
3. V1 modes: `Clarify`, `Socratic`.
4. Context default: full passage by default.
5. Oversize handling: soft warning at 50k input tokens, no hard cap.
6. Oversize choices: `Proceed with full context (untrimmed)` or `Send excerpted context`.
7. Session model: one continuation session per attempt; reopen/resume same thread.
8. Persistence: local-by-default discussion transcripts.
9. Caching: deferred in V1; instrumentation-first for later decision.
10. Ship gate: functional completion + no regressions.

## 3. Non-Goals (V1)
1. Full 7-mode KnOS parity.
2. Gemini explicit context caching implementation.
3. New launcher-level standalone discussion activity.
4. Cloud sync or telemetry backend.

## 4. User Stories
1. As a learner finishing a comprehension check, I can continue with a tutor to consolidate weak areas.
2. As a learner, I can switch between Clarify and Socratic modes during the same continuation session.
3. As a learner, I can see context-size pressure (tracker) before and during discussion.
4. As a learner, when payload is large, I can decide to continue with full untrimmed context or send excerpted context.
5. As a learner, I can return later and resume the same discussion thread for that attempt.

## 5. Experience and Interaction Model
### 5.1 Entry Points
1. Primary: results summary CTA `Continue with tutor`.
2. Secondary: minimal per-question `Discuss` CTA (kept lightweight in V1).

### 5.2 Continuation Session UX
1. On entry, create or resume discussion session for the attempt.
2. First assistant turn is seeded by attempt summary (LLM-generated).
3. Mode switcher exposes `Clarify` and `Socratic`.
4. Context window tracker is visible throughout the session.
5. Exit shows compact session summary (`what we covered`, `next steps`).

### 5.3 Oversize Warning UX
Trigger: estimated input payload > 50k tokens.

Dialog options:
1. `Proceed with full context (untrimmed)`
2. `Send excerpted context`

No forced truncation in V1.

## 6. Functional Requirements
### FR-1 Discussion Adapter
1. Introduce `DiscussionAdapter` abstraction with Gemini-backed implementation.
2. Required operations:
   - `initThread(context)`
   - `sendMessage(threadId, mode, userText, contextPolicy)`
   - `closeThread(threadId)`

### FR-2 Prompt Pack V1
1. Prompt pack structure includes:
   - mode-agnostic base prompt
   - `clarify` mode prompt
   - `socratic` mode prompt
2. Persist `promptPack` id/version per session.
3. Ensure mode tags/control tokens never leak into visible UI.

### FR-3 Session Persistence
1. Add local `DiscussionSession` storage.
2. Link sessions to attempt IDs.
3. Enforce one continuation session per attempt with resume semantics.

### FR-4 Continuation-first Flow
1. Results screen emphasizes `Continue with tutor` as primary follow-up action.
2. Per-question discussion exists but remains minimal and non-blocking.

### FR-5 Context Estimation and Tracker
1. Preflight token estimation before each send.
2. Maintain two estimates:
   - input payload estimate
   - total retained context estimate for tracker UI
3. Tracker updates on each turn and on session resume.

### FR-6 Oversize Warning Policy
1. Compare input estimate against warning threshold (50k).
2. Show warning dialog when threshold is exceeded.
3. Send path honors user choice exactly:
   - full path: untrimmed payload
   - excerpt path: reduced payload

### FR-7 Attempt Summary Seeding
1. Continuation opening is seeded by LLM-generated attempt summary.
2. Summary must be grounded in attempt artifacts and passage context.

## 7. Data Model Draft
```ts
type DiscussionMode = 'clarify' | 'socratic';

type DiscussionSession = {
  id: string;
  scope: {
    type: 'attempt' | 'question';
    attemptId?: string;
    questionId?: string;
    articleId: string;
  };
  createdAt: string;
  lastUpdatedAt: string;
  modeDistribution: Record<DiscussionMode, number>;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    mode?: DiscussionMode;
    content: string;
    createdAt: string;
    tokenUsage?: {
      inputEstimate?: number;
      outputEstimate?: number;
      totalContextEstimate?: number;
    };
  }>;
  promptPack: {
    id: string;
    version: string;
  };
  llmConfig: {
    provider: 'gemini';
    model: string;
    caching: {
      enabled: false;
    };
  };
};
```

Storage:
1. New key: `speedread_discussion_sessions`.
2. Schema version bump in storage layer with migration path.

## 8. Technical Design Constraints
1. Keep current comprehension-check behavior unchanged unless explicitly expanded by this feature.
2. Reuse existing key/model settings pathways.
3. V1 excludes explicit Gemini cache create/list/delete flows.
4. Add instrumentation needed to evaluate V2 caching decision.

## 9. Instrumentation (V1 Required)
1. Per-turn metrics:
   - request latency
   - input estimate
   - output estimate
   - total context estimate
   - oversize-warning triggered (boolean)
   - oversize choice taken (`full_untrimmed` | `excerpted`)
2. Session metrics:
   - turns per session
   - mode distribution
   - resumed vs newly created session

## 10. Testing and Verification
### 10.1 Unit
1. Mode injection and UI leak prevention.
2. Token estimator and warning-threshold logic.
3. Session linking and resume semantics by attempt.
4. Prompt pack version persistence.
5. Storage migration correctness and no data loss.

### 10.2 Integration (mocked LLM)
1. End-to-end continuation flow from results screen.
2. Opening turn uses attempt summary seed.
3. Warning dialog paths:
   - full untrimmed path
   - excerpted path
4. Tracker updates across turns and resume.

### 10.3 Regression
1. Existing quick-check/exam generation and scoring unaffected.
2. Existing attempt history and settings behavior unaffected.

## 11. Phases and Exit Criteria
### Phase A: Discussion Primitives
Deliverables:
1. `DiscussionAdapter` + Gemini implementation.
2. Prompt pack v1 plumbing.
3. Discussion session storage + migration.
4. Shared chat primitives + minimal per-question CTA.

Exit Criteria:
1. Discussion session can be created, persisted, and resumed in test harness.
2. Mode switching between Clarify/Socratic works.
3. No regressions in comprehension flows.

### Phase B: Post-check Continuation
Deliverables:
1. Primary `Continue with tutor` results CTA.
2. LLM-seeded opening summary.
3. Context tracker UI.
4. Soft oversize warning dialog with two explicit paths.
5. Exit summary.

Exit Criteria:
1. Continuation-first flow is reachable and stable.
2. Oversize warning triggers reliably at >50k input estimate.
3. User choices are honored exactly (full untrimmed vs excerpted).
4. Resume-by-attempt behavior validated.
5. Functional completion with no regressions.

Dependency model: linear `A -> B`.

## 12. Open Risks and Mitigations
1. Risk: latency/cost spikes without caching.
   - Mitigation: instrumentation-first and warning UI transparency.
2. Risk: full-context default can overwhelm model windows for long passages.
   - Mitigation: oversize prompt + excerpt option + tracker visibility.
3. Risk: continuation quality drift due to prompt ambiguity.
   - Mitigation: prompt pack versioning and deterministic tests around prompt assembly.

## 13. V2 Triggers (Not In Scope)
Revisit explicit caching when any trigger is met:
1. P95 continuation turn latency exceeds agreed threshold.
2. Mean input estimate remains high over sustained sessions.
3. User drop-off correlates with long-turn delays.

## 14. Shipping Checklist
1. `bun run verify`
2. `bun run verify:ci`
3. `bun run electron:build` (if Electron-relevant surfaces/contracts changed)
4. Manual continuation flow QA:
   - results -> continue -> mode switch -> oversize branch -> resume thread
