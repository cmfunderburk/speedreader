# Reader Desktop Rewrite Options (Away from JavaScript)

Date: 2026-02-19

## 1. Why This Report Exists

You are considering moving Reader away from the JavaScript ecosystem and toward a more straightforward desktop architecture.

This report evaluates realistic paths using the current codebase as the baseline, then gives recommendations and a migration strategy.

## 2. Baseline: What Exists Today

From this repo (current state):

- `~25,042` LOC in `src/`, `electron/`, `shared/` TypeScript/CJS.
- `src/` has `~16,215` production LOC and `~7,038` test LOC.
- `39` test files across `src/`.
- Main complexity hotspots:
- `src/components/TrainingReader.tsx` (`1635` LOC)
- `src/components/App.tsx` (`1511` LOC)
- `src/lib/storage.ts` (`1215` LOC)
- Electron/native boundary is currently small and focused:
- `electron/main.ts` IPC handlers for library, corpus, secure key storage.
- `electron/lib/pdf.ts`, `electron/lib/epub.ts`, `electron/lib/library.ts`.
- Product scope is broad (paced reading, prediction/recall, training loops, comprehension checks, local file library, corpus sampling, secure key handling).

Implication:

- UI and state orchestration are the dominant rewrite cost.
- Native shell and local file ingest are meaningful but smaller.
- There is already good logic/test separation in many `src/lib/*` modules, which helps structured migration.

## 3. Decision Criteria

I used these criteria to evaluate options:

1. Full move away from JS runtime/tooling.
2. Cross-platform desktop packaging (Linux/macOS/Windows).
3. Ability to preserve timing-sensitive reading UX.
4. Local file ingest quality (PDF/EPUB/TXT workflows).
5. Secure local key storage and local persistence.
6. Rewrite risk and delivery time for a solo maintainer.
7. Long-term maintainability and debugging ergonomics.

## 4. Options

### Option A: Keep Electron (Control Option)

Not a rewrite, but useful baseline.

Pros:

- Lowest risk.
- No product regression risk from full UI/logic port.
- Existing tests keep their value.

Cons:

- Does not meet your goal (still JS/Electron ecosystem).
- Memory footprint remains Electron-level.

Best when:

- You want velocity now and no major platform bet yet.

---

### Option B: Tauri + Rust Backend, Keep React Frontend (Bridge Path)

Move desktop shell to Rust/Tauri, retain React renderer initially.

Pros:

- Big reduction in Electron overhead quickly.
- Better native packaging/security defaults than Electron.
- Lets you port native-sensitive modules to Rust first.
- Lowest-risk stepping stone toward full non-JS later.

Cons:

- Not a full move away from JS (UI still JS/TS).
- Two ecosystems during transition (Rust + React).
- You still carry frontend rewrite debt.

Best when:

- You want immediate desktop/runtime improvements without a full stop-the-world rewrite.

Estimated effort:

- 4-8 weeks for shell migration parity, excluding full UI rewrite.

---

### Option C: Full Rust Desktop App (Rust UI + Rust Core)

Examples: `egui`, `slint`, or similar Rust-native UI stack.

Pros:

- Maximum move away from JS.
- Strong performance profile and single-language backend/core story.
- Tight control over memory/timing for pacing behaviors.

Cons:

- Highest UI rewrite difficulty and risk.
- Desktop UI maturity/productivity tradeoff vs React/Avalonia.
- Larger initial cost to reproduce current UX polish and keyboard interactions.

Best when:

- You want a long-term Rust-centric product and accept a larger rewrite window.

Estimated effort:

- 6-10+ months for feature parity as a solo maintainer.

---

### Option D: C#/.NET + Avalonia (Full Rewrite, Non-JS)

Cross-platform native desktop with XAML-style UI.

Pros:

- Strong desktop app tooling and debugging ergonomics.
- Good balance of UI productivity and non-JS architecture.
- Mature async/network/file APIs.
- Cross-platform story is practical for this app type.

Cons:

- Full rewrite; no direct reuse of React components.
- Porting tokenizer/saccade/training/storage logic still required.
- Different UI paradigm from current component model.

Best when:

- You want full non-JS with strong desktop developer experience and lower risk than Rust-native UI.

Estimated effort:

- 4-7 months for parity as a solo maintainer.

---

### Option E: Kotlin Compose Desktop (Full Rewrite, Non-JS)

Pros:

- Good modern UI model and Kotlin ergonomics.
- JVM ecosystem has broad library coverage.

Cons:

- Cross-platform desktop polish/packaging is workable but less common than .NET desktop in this app category.
- Potential memory/runtime footprint concern versus Rust/.NET native.
- Smaller ecosystem examples for this exact app style.

Best when:

- You prefer Kotlin strongly and are comfortable with JVM desktop tradeoffs.

Estimated effort:

- 5-9 months.

---

### Option F: Python + Qt/PySide (Full Rewrite, Non-JS)

Pros:

- Fast prototyping.
- Rich text/file-processing ecosystem.
- Potentially shortest path to a first non-JS prototype.

Cons:

- Packaging/distribution and dependency reproducibility can become burdensome.
- Performance/timing consistency risk in high-frequency UI interactions.
- Maintainability for long-lived desktop product can degrade as complexity grows.

Best when:

- You want a quick proof-of-concept, not necessarily the final production platform.

Estimated effort:

- 3-6 months to parity, with higher long-term maintenance risk.

## 5. Comparative Summary

Scale: 1 (worst) to 5 (best), based on this codebase and goals.

| Option | Non-JS Goal | Delivery Risk | Time to Parity | UX Fidelity Risk | Long-Term Maintainability |
|---|---:|---:|---:|---:|---:|
| A. Keep Electron | 1 | 5 | 5 | 5 | 3 |
| B. Tauri + React bridge | 2 | 4 | 4 | 4 | 4 |
| C. Full Rust | 5 | 2 | 2 | 2 | 4 |
| D. C# + Avalonia | 5 | 4 | 3 | 3 | 5 |
| E. Kotlin Compose | 5 | 3 | 3 | 3 | 4 |
| F. Python + Qt | 5 | 3 | 4 | 3 | 2 |

Interpretation:

- If full non-JS is mandatory soon: `D (C# + Avalonia)` is the strongest balance.
- If you want lower transition risk first: `B (Tauri bridge)` is the best staged path.
- `C (full Rust)` has the highest upside and highest execution risk.

## 6. What Will Be Hard No Matter Which Full Rewrite You Pick

1. Preserving behavior in timing-sensitive reading modes.
- RSVP/saccade/generation pacing and keyboard semantics are highly interaction-dependent.

2. Porting orchestration logic from large components.
- `src/components/App.tsx`
- `src/components/TrainingReader.tsx`

3. Preserving storage and migration semantics.
- `src/lib/storage.ts` schema behavior, migration paths, secure-key fallback logic.

4. Matching ingest/output quality for PDF/EPUB pipeline.
- Current extraction cleanup heuristics are user-visible quality.

5. Preventing regression in training and comprehension flows.
- Current flow surface is broad; parity tests are required.

## 7. Recommended Direction

Two practical recommendations, depending on how strict "away from JavaScript" is:

### Recommendation 1 (strict non-JS target): C#/.NET + Avalonia

Why:

- Best balance of non-JS compliance, desktop maturity, and rewrite risk.
- Faster path to stable parity than full Rust-native UI for this app shape.

### Recommendation 2 (risk-managed transition): Tauri bridge now, full rewrite later

Why:

- Delivers immediate desktop improvements with lower risk.
- Lets you progressively port core logic and native services before full UI rewrite.
- Avoids a large all-at-once rewrite bet.

## 8. Migration Plan (If Choosing Full Non-JS Rewrite)

### Phase 0: Lock behavior with golden tests (2-3 weeks)

- Add platform-agnostic fixtures for:
- tokenization and ORP
- saccade line/fixation planning
- training scoring and drill adjustments
- storage migration examples
- Record event-level interaction traces for key flows (play/pause, mode switch, recall/prediction transitions).

### Phase 1: Extract/importable data boundary (1-2 weeks)

- Add explicit export/import for all user data before rewrite cutover:
- articles, feeds, settings, passages, attempts, training history, session snapshots.
- Do not rely on scraping Chromium localStorage in production migration.

### Phase 2: Port pure domain logic first (4-8 weeks)

- Port `src/lib/*` logic modules first, before UI parity.
- Validate against golden fixtures from Phase 0.

### Phase 3: Build desktop shell + persistence + ingest (4-8 weeks)

- Library source management, PDF/EPUB/TXT open path, secure key storage, corpus sampling.
- Implement same trust/path restrictions as Electron currently enforces.

### Phase 4: UI parity for primary flow (6-10 weeks)

- Home -> content -> paced reading -> active recall.
- Then training and comprehension flows.

### Phase 5: Hardening and cutover (3-5 weeks)

- Cross-platform packaging/signing.
- User migration flow.
- Soak testing with real library content and long sessions.

## 9. Risk Register (Top Items)

1. Feature regression due to broad surface area.
- Mitigation: golden fixtures + phased parity gates.

2. Data migration loss or mismatch.
- Mitigation: explicit in-app export/import before cutover.

3. Timing and keyboard behavior drift.
- Mitigation: interaction trace tests and acceptance checklist.

4. Rewrite fatigue from large all-at-once effort.
- Mitigation: milestone-based scope locks and staged releases.

## 10. Concrete Next Steps (Decision Sprint)

1. Choose target strategy:
- `D` (full non-JS now, C# + Avalonia), or
- `B -> D/C` staged path.

2. Run a 2-week spike in the chosen stack:
- Implement minimal vertical slice:
- load article
- paced reading playback with WPM controls
- local persistence
- one native file open path

3. Define go/no-go criteria before full rewrite:
- startup time
- memory footprint
- keyboard/timer fidelity
- packaging friction
- implementation velocity

4. If spike passes, start Phase 0 fixtures immediately and treat them as the contract for parity.

## 11. Bottom Line

If the goal is truly to leave JS, a full rewrite is feasible, but this app is now large enough that rewrite strategy matters more than language preference.

- Best full non-JS balance: `C# + Avalonia`.
- Best risk-managed path: `Tauri bridge`, then full rewrite once core behavior is locked by fixtures.
