# ADR-001: Continuation-First Discussion Flow

Status: Proposed
Date: 2026-02-17

## Context
Reader currently ends at comprehension results. The integration goal is to add KnOS-style remediation without turning discussion into a separate product surface. We need to choose where discussion is centered.

## Options Considered
1. Embedded per-question discussion as primary surface.
   - Pro: tightly targeted remediation.
   - Con: risks over-focusing on atomized factual issues.
2. Post-check continuation as primary surface, with per-question discussion secondary.
   - Pro: supports synthesis across misses and broader comprehension repair.
   - Con: introduces new session lifecycle concepts.
3. New launcher-level standalone discussion activity.
   - Pro: maximal flexibility.
   - Con: highest product sprawl and implementation scope.

## Decision
Use post-check continuation as the primary V1 discussion path (`Continue with tutor`). Keep per-question discussion minimal and secondary.

## Consequences
1. Requires new continuation session lifecycle and resume semantics.
2. Preserves assessment flow while adding a consolidation layer.
3. Keeps V1 focused enough to ship with lower UI sprawl risk.
