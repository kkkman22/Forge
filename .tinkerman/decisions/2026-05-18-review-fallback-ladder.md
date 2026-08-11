---
id: "ADR-0005"
title: "Review Fallback Ladder: L0→L1→L2→L3 with No Main-Agent Takeover"
status: "accepted"
date: "2026-05-18"
deciders:
  - "@maintainer"
# related_adrs:
# supersedes:
---

# ADR-0005: Review Fallback Ladder — L0→L1→L2→L3 with No Main-Agent Takeover

## Context

On commit `d1ee44b`, `/forge review` executed a three-layer review for `forge-single-entry-skills-collapse`. All three subagents failed with Claude Code Agent SDK's task registry purge bug (`Error: No task found with ID: <id>`). In response, the main agent **self-took over** the review and produced `.tinkerman/reviews/forge-single-entry-skills-collapse.md` with `result: blocked` and 7 P0/P1 findings.

This review report production path **violates** `AGENTS.md §3.1 Execution-Assessment Separation`: the main agent that built the code should not review code it just built in the same session. The core value of subagent isolation is fresh context, not just identity separation. Even if the main agent didn't build this specific code, it still carries session context bias from the build phase, violating the design intent of §3.1.

The underlying SDK bug causes task registry purges that make subagent dispatch unreliable. This is a known upstream issue that can affect both foreground and background subagent execution. The problem requires a fallback strategy that preserves the Execution-Assessment Separation principle while providing graceful degradation when SDK instability occurs.

## Decision

Introduce a **Fallback Ladder** with four levels (L0→L1→L2→L3) that enforces fresh-context review at all times, with a **hard-gate** prohibiting main-agent takeover under any circumstances:

### Fallback Ladder Levels

| Level | Reviewer | Trigger | Trust | Action |
|---|---|---|---|---|
| **L0** | Three subagents parallel (concurrency=N, default 3) | Default | High | `methodology: subagent-parallel` |
| **L1** | Three subagents serial (concurrency=1) | L0 all-fail | High (same as L0, only slower) | `methodology: subagent-serial`, auto-retry once |
| **L2** | CI ultrareview async evidence | L1 all-fail + `.tinkerman/reviews/<pr>-ci.md` exists | Medium | `methodology: ci-evidence` |
| **L3** | (no reviewer) | L0+L1+L2 all unavailable | — | `methodology: unavailable`, `result: blocked`, block ship |

### Hard-Gate: No Main-Agent Takeover

The main agent **MUST NOT** take over review after any fallback ladder level fails. This prohibits four forms of main-agent self-review:

1. **Direct diff self-review**: Calling Read/Grep/Bash to read source code and produce findings
2. **Local tool self-review**: Using forge_git/forge_read MCP tools to produce findings
3. **Skill inline self-review**: Re-entering review SKILL via `Skill(forge, "review")` inline path
4. **Report rewriting**: Fabricating a complete review report based on partial subagent output

Review reports violating this constraint are **automatically invalid** and the ship gate blocks release.

The only legal path: L0 → L1 → L2 → L3. After L3, users must manually intervene (fix SDK / wait upstream / use `--force-skip-review` escape hatch).

### Reversible Escape Hatch

This reversible escape hatch provides:

For extreme emergency scenarios (CI system also down, all fallbacks unavailable, but urgent ship required), provide `--force-skip-review --reason="<non-empty>"` CLI flag. This reversible escape hatch:

- Bypasses methodology field checks in ship gate
- Appends `Reviewed-by: SKIPPED-BY-FORCE (reason: <user input>)` to commit message
- Writes audit record to `.tinkerman/findings/force-skip-review-<date>.md` with commit hash, reason, timestamp, and user identity

This escape hatch is **reversible**: the flag can be removed to re-enable normal gating.

## Rejected Alternatives

### Alternative A: Allow Main-Agent Takeover

**Decision**: Rejected

**Reasoning**: This violates `AGENTS.md §3.1 Execution-Assessment Separation`. The same-session main agent, even if it didn't build the specific code being reviewed, carries context bias from the build phase. Subagent isolation's core value is fresh context, not just identity. Allowing main-agent takeover would undermine the entire design principle and make the review process less trustworthy.

### Alternative B: Remove Background Subagents Entirely

**Decision**: Rejected

**Reasoning**: While foreground subagents also hit the task-id-purge bug, removing background subagents doesn't solve the root problem. The SDK instability affects both foreground and background execution. The fallback ladder provides graceful degradation regardless of which execution mode is affected.

### Alternative C: Migrate to Task-Notification Consumption

**Decision**: Deferred

**Reasoning**: This approach addresses the task registry purge issue by consuming task notifications instead of relying on task IDs. However, this requires significant changes to the subagent architecture and is tracked in a separate spec: `subagent-notification-consumption-migration`. The fallback ladder can serve as a fail-safe until that larger refactoring is complete.

## Consequences

### Positive

- **Preserves Execution-Assessment Separation**: Fresh-context review is guaranteed at all levels, preventing session bias contamination
- **Graceful degradation**: Automatic retry with serial execution handles common SDK race conditions without manual intervention
- **Clear audit trail**: Each review report includes `methodology`, `retry_count`, `l0_failure_signature`, and trace section for post-mortem analysis
- **Emergency escape**: `--force-skip-review` provides auditable bypass for production incidents while maintaining governance
- **Testable invariants**: Property tests enforce "retry ≤ 1" and "no Read/Grep/Bash after L3" guarantees

### Negative

- **Added complexity**: Four-level fallback ladder increases review execution paths and requires thorough testing
- **Potential blocking**: L3 blocks ship until SDK issues are resolved or manual intervention occurs
- **Performance impact**: L1 serial retry is slower than parallel L0, but only activates on L0 failure
- **Documentation burden**: Requires updating AGENTS.md §3.1, CLAUDE.md templates, and forge-ship SKILL instructions

## Rollback Plan

To disable the fallback ladder and revert to pre-Phase 1 behavior:

1. Replace `runReviewFallbackLadder()` call in `src/review.ts` with direct `runSubagentsWithConcurrency(invocations, executor, concurrency)` call
2. Remove Hard-gate section from `skills/forge/lib/review/instructions.md`
3. Remove `--force-skip-review` CLI option and related logic from `src/ship.ts`
4. Revert AGENTS.md §3.1 addition about main-agent takeover prohibition

This effectively removes the fallback layer and reverts to "no fallback" behavior. The `--force-skip-review` flag can be kept as a standalone escape hatch if desired.

## Cross-Version Regression

On each Claude Code upgrade:

1. Run `npm run check` + `npx vitest run test/review/fallback-ladder.test.ts`
2. Run `/forge review` on a small PR, observe trace section for `L0=all-success`
3. Check if upstream issues #14055/#27371/#29183 (task registry purge) are closed
4. Once upstream is fixed, trace should consistently show `L0=all-success`; consider downgrading fallback ladder to optional mechanism

## Implementation Notes

- Requires Phase 1 dependency: `review-subagent-concurrency` (merged, provides `runSubagentsWithConcurrency`)
- Requires Phase 2 dependency: `review-report-methodology-field` (merged, provides `Methodology` enum)
- Task 3 in this spec wires `buildReviewSubagents` caller to `runReviewFallbackLadder`, completing deferred wiring from Phase 1
- Task 5 requires sync script run: `node scripts/sync-dist-plugin.mjs` after modifying review instructions