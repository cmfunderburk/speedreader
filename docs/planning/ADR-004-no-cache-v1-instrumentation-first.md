# ADR-004: No Explicit Caching in V1, Instrumentation-First

Status: Proposed
Date: 2026-02-17

## Context
KnOS caching strategy was motivated by longer-context reuse. Reader continuation context lengths may differ. We need to choose whether to integrate Gemini explicit caching now or defer.

## Options Considered
1. Implement explicit caching in V1.
   - Pro: potential latency/cost savings for long sessions.
   - Con: higher complexity and extra failure states in first release.
2. Defer caching and ship with instrumentation-first policy.
   - Pro: faster delivery and decision grounded in measured usage.
   - Con: possible short-term inefficiency on large sessions.

## Decision
Do not implement explicit caching in V1. Require instrumentation sufficient to evaluate whether caching should be added in V2.

## Consequences
1. V1 must ship with per-turn latency/context metrics.
2. V2 cache decision should be evidence-based, not assumed.
3. Continuation UX must provide context-size transparency and oversize choice controls.
