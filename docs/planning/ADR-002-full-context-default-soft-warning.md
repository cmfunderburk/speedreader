# ADR-002: Full-Context Default with Soft Oversize Warning

Status: Proposed
Date: 2026-02-17

## Context
Continuation sessions should start from strong textual grounding. A policy is required for large payloads.

## Options Considered
1. Excerpt-only default.
   - Pro: lower latency/cost.
   - Con: weaker holistic grounding.
2. Full context default with hard truncation cap.
   - Pro: bounded cost.
   - Con: can silently lose critical context and reduce user control.
3. Full context default with soft warning at threshold and user choice.
   - Pro: preserves control and transparency.
   - Con: potential high-cost sends if user chooses untrimmed context.

## Decision
Default to full passage context. Trigger a warning when estimated input exceeds 50k tokens. Warning is not a hard cap. User chooses either:
1. Proceed with full context (untrimmed)
2. Send excerpted context

## Consequences
1. Requires reliable preflight token estimation and warning UX.
2. Requires explicit context window tracker in-session.
3. Makes user tradeoffs explicit instead of imposing forced truncation.
