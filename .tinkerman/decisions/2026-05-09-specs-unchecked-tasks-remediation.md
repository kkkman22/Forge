---
topic: "specs-unchecked-tasks-remediation"
date: "2026-05-09"
status: "confirmed"
---

## Product Definition

**Problem**: 4 specs have 15+ deviations with wildly varying user value — real feature gaps (Layer 4 review integration, acceptance gate) mixed with bureaucratic cleanup (cross-references, checkboxes).

**Users**: Forge framework developer, using `/forge review` and `/forge ship` continuously.

**Success Criteria**:
- `/forge review` triggers Layer 4 frontend-check in Vue projects
- `/forge ship --with-acceptance` executes acceptance scenarios and can block ship
- Review subagents run in background mode
- `.tinkerman/findings/` has retention policy
- All 8 cmux mirror integration tests pass
- `npm run check` and `npm test` green

**Scope Boundaries**: No new features beyond original spec intent. No Tier B/C for Layer 4 (Tier A only). No modification of cmux-mirror production code. context-bloat-control spec excluded (verified optional-test-only).

## Technical Solution

**Tech Selection**: TypeScript, existing pure-function patterns. All deviations involve wiring existing tested functions — no new dependencies.

**Risks**:
- Review fan-in contract change (3→4 layers): High impact / Mitigation: configurable layer list; verify `mergeReviewResults` handles unknown layer IDs before relying on it as safety net
- Acceptance gate adds 4th ship gate: Medium impact / Mitigation: follow existing gate extension pattern, `acceptance_blocks_ship` frontmatter controls block/non-block
- Parallel execution: Low risk — `subagent-runner.ts` already uses `Promise.allSettled`
- Findings retention: Low risk — shell script extension, failure modes limited to missing directory

**Scalability**: Layer 4 and acceptance gate follow plugin/layered pattern — future layers/gates wrap base without modifying it.

**Compatibility**: All changes are additive. Existing 3-layer review flow unaffected. Existing 3 ship gates unaffected. `background: true` frontmatter gracefully ignored by older parsers. No cross-spec dependencies.

**Key files**:
- `src/review.ts:487-514` (buildReviewSubagents — Layer 4 extension point)
- `src/ship.ts:119-213` (gate chain — acceptance gate extension point)
- `src/subagent-runner.ts:64-93` (already Promise.allSettled)
- `src/frontend-check.ts` (functions to wire)
- `src/accept-driver.ts` (runner/aggregateVerdicts to wire to ship.ts)

## Security Assessment

**OWASP Check**:
- Injection: Low — prune-event-logs.sh uses `mv` with hardcoded `.tinkerman/` paths. Path traversal risk minimal if paths are sanitized (reject `..` sequences).
- Security Misconfiguration: Low — background agents inherit full permissions without supervision. Apply minimum privilege.
- Code Execution: Low — acceptance gate reads spec content and runs scenarios. Must ensure no arbitrary code execution via malicious spec content. Architecture must specify evaluation mechanism.
- XXE/XSS: Low — Vue template scanning is read-only static analysis, no instantiation.

**STRIDE Analysis**:
- Elevation of Privilege: Background agents same perms as foreground. Audit access scope.
- Tampering: Archive operations must verify target dir exists and is writable before `mv`.
- Information Disclosure: Archive directory must have appropriate permissions.
- Repudiation: Archiving (not deleting) findings preserves audit trail — positive.

**Conclusion**: No P0/P1 blockers. Four medium concerns: path hygiene in prune script, acceptance scenario evaluation safety, background agent privilege, config field input validation. All addressable during implementation.

## ADR Criteria Check

This is a remediation/scope-execution task, not an architectural decision. No new architectural patterns introduced. All changes wire existing code. Verdict: INLINE NOTE — no ADR generated.

## Veto Record

None.

## Critic Conditions (binding on plan phase)

1. Plan must include deviation-to-batch mapping table anchored to real spec file paths
2. Explicit accept/defer decision on acceptance gate (Product deprioritized 3.3/3.4; Architecture planned wiring — resolve in plan)
3. Plan must verify `mergeReviewResults` handles unknown layer IDs before counting on it as Layer 4 safety net
4. Plan must specify acceptance scenario evaluation mechanism so Security concern is resolved
