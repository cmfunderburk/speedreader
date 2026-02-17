# Refactor Behavior Parity Matrix

Last updated: February 12, 2026.

## Purpose
This matrix maps refactor-touched high-risk flows to automated coverage so we can make explicit PR readiness decisions.

Coverage level meanings:
- `Strong`: integration coverage plus focused planner/helper unit coverage.
- `Moderate`: unit coverage exists for core planner logic, but limited integration wiring coverage.
- `Weak`: partial coverage only; important path/edge still not exercised.

## Scenario Matrix
| Flow | Expected Behavior | Current Automated Coverage | Level | Follow-up Needed |
| --- | --- | --- | --- | --- |
| Home -> content browser -> preview -> active reader -> home | Navigation + launch transitions remain stable after planner extraction. | `src/components/App.integration.test.tsx` (`navigates home -> content-browser -> preview -> active-reader -> home`) | Strong | None for baseline path. |
| Home -> Daily Article with cached daily entry | If cache is valid for today, launch cached article without network fetch. | `src/components/App.integration.test.tsx` (`uses cached daily featured article without refetching`), `src/lib/featuredArticleLaunch.test.ts` (`resolves cached daily article only when date matches`) | Strong | Add random-featured integration coverage if this area changes again. |
| Active recall launch -> active exercise -> Home fallback | Active recall launch enters exercise view and header Home returns to home when no reading snapshot exists. | `src/components/App.integration.test.tsx` (`navigates into active recall exercise and returns home via header action`), `src/lib/sessionTransitions.test.ts` (`goes home without clearing snapshot...`) | Strong | None for no-snapshot fallback path. |
| Close active exercise with resumable reading snapshot | Resume prior reading when snapshot references a valid reading article. | `src/components/App.integration.test.tsx` (`resumes reading from snapshot when closing active exercise`), `src/lib/sessionTransitions.test.ts` (`resumes reading and updates snapshot transition metadata`, `normalizes non-reading display modes to saccade...`) | Strong | None for current scope. |
| Passage capture (sentence/paragraph/last-lines) | Passage selection semantics remain stable for each capture mode. | `src/lib/passageCapture.test.ts` (all capture planners), `src/lib/passageReviewLaunch.test.ts`, `src/components/App.integration.test.tsx` (`captures a sentence passage from active reader workspace`) | Moderate | Add App-level integration coverage for paragraph/last-lines capture buttons if this surface changes. |
| Passage queue prioritization | Queue ordering honors `hard/new/easy/done` priority then recency. | `src/lib/passageQueue.test.ts` | Moderate | No immediate gap if queue wiring remains unchanged. |
| Daily/random featured fetch result planning | Upsert + dedupe + daily info metadata behave consistently. | `src/lib/featuredArticleLaunch.test.ts`, `src/lib/articleUpsert.test.ts` | Strong | Add failure-state integration check if error handling changes. |
| Training recall: miss -> continue -> feedback -> complete | Critical end-to-end training recall loop remains intact after extraction. | `src/components/TrainingReader.integration.test.tsx` (`runs recall miss -> continue -> feedback -> complete flow`) | Strong | None for scaffold baseline flow. |
| Training recall planner branches | Scaffold/no-scaffold parsing, token scoring, miss-continue, finish planning remain deterministic. | `src/lib/trainingRecall.test.ts`, `src/lib/trainingFeedback.test.ts`, `src/lib/trainingPhase.test.ts`, `src/lib/trainingReading.test.ts`, `src/lib/trainingScoring.test.ts`, `src/components/TrainingReader.integration.test.tsx` (`supports no-scaffold tokenized recall submission flow`) | Strong | Add targeted integration for drill preview-forfeit (`Tab`) path if that behavior changes. |
| Continue session launch by activity | Continue launches correct mode/view per activity and display-mode normalization. | `src/components/App.integration.test.tsx` (`continues last training session from home`), `src/lib/sessionTransitions.test.ts` (`plans continue-session transitions by activity`) | Strong | Add additional activity-mode continue integration tests if continue UX changes. |

## Open Gaps (As Of This Snapshot)
- App-level capture coverage currently asserts sentence capture wiring; paragraph/last-lines remain planner-dominant coverage.
- Drill-specific no-scaffold preview-forfeit (`Tab`) path remains mostly planner-covered.

## Exit Signal For Workstream B
Workstream B is considered complete when:
- Every scenario above is mapped to at least one automated test.
- Any non-Strong scenario is either:
  - upgraded with added tests, or
  - explicitly accepted with documented risk rationale in PR notes.
