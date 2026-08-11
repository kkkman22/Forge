---
status: completed
feature: claude-2-1-169-inspired-hardening
layout: requirements
created: 2026-06-09
tier: standard
source: "Claude Code 2.1.169 changelog"
---

# Requirements — Claude Code 2.1.169 Inspired Hardening

## Introduction

Claude Code 2.1.169 introduced several platform-level improvements that map directly to Forge's own orchestration surface: safer troubleshooting, better directory/session handling, stronger background agent state, more reliable agent JSON reporting, context-window-aware warnings, and more resilient long-running process behavior.

Forge already covers part of this territory: process group reaping exists in `src/mcp/tools/forge-exec.ts`, stale PID cleanup exists in `src/orphan-detector.ts`, graceful config parsing exists in `src/config-store.ts`, and compatibility tracking exists in `docs/claude-code-compatibility.md`. This spec therefore targets the six gaps that remain worth doing:

1. Harden `claude agents` dispatch with timeout, diagnostics, and new JSON state support.
2. Add a Forge diagnostic mode inspired by safe-mode without disabling `/forge` itself.
3. Update the compatibility matrix for Claude Code 2.1.169.
4. Add subagent/worktree edit preflight guidance.
5. Make context-budget diagnostics model-window aware.
6. Persist execution environment metadata for resume/status/debugging.

## Current State

- `src/forge/agents-dispatcher.ts` builds and runs `claude agents` with `execFile`, but has no explicit timeout, kill signal, stderr diagnostics, JSON `state` handling, or `--all` collection support.
- `scripts/inject-evolved-rules.mjs` always injects evolved rules for the main agent when available, and there is no Forge-level diagnostic mode that keeps `/forge` usable while suppressing optional customization layers.
- `docs/claude-code-compatibility.md` currently documents v2.1.163 as the latest capability baseline and does not mention v2.1.169 features.
- `src/worktree-manager.ts` validates and computes worktree state, but subagent prompts do not currently include a pre-edit warning for shared checkout/worktree requirements.
- `src/context-budget.ts` contains context lifecycle models and serializers, but context budget policy remains mostly static and does not express thresholds relative to the active model context window.
- `.tinkerman/status.md` stores task, tier, phase, branch, and updated date, but not the execution environment metadata needed to reconstruct dispatch choices after resume.

## Non-Goals

- Do not implement a true Claude `--safe-mode` clone that disables Forge's own plugin, skill, MCP, or `/forge` entrypoint.
- Do not change Claude Code's native `--safe-mode`, `/cd`, or `disableBundledSkills` behavior.
- Do not replace existing process cleanup in `forge_exec`; this spec only touches `claude agents` dispatch timeout and collection behavior.
- Do not force users onto Claude Code 2.1.169 as a minimum unless an implementation depends on a feature that cannot gracefully degrade.
- Do not modify unrelated review, ship, or build gates beyond the metadata and prompt changes described here.

## Requirements

### R1: Agent Dispatch Timeout And State Handling

**User Story:** As a Forge maintainer, I want `claude agents` dispatch to fail visibly and recoverably when a background agent hangs, returns malformed JSON, or remains in a non-completed state, so review/decide orchestration does not silently stall or miss blocked agents.

#### Acceptance Criteria

1. WHEN `dispatch(opts)` invokes `claude agents`, THE implementation SHALL pass an explicit timeout to the child process and return `status: "failed"` with a diagnostic reason when the timeout fires.
   - Verify-By: vitest
   - Evidence: Unit test stubs `execFile` timeout and asserts `status`, `duration_ms`, and diagnostic fields.
2. WHEN `claude agents` stdout contains JSON with `id` and `state`, THE parser SHALL preserve those fields in `DispatchResult` without breaking existing callers.
   - Verify-By: vitest
   - Evidence: Unit test parses `{ id, state, agent, status, findings }`.
3. WHEN JSON `state` is `blocked`, `just-dispatched`, `running`, or another non-completed state, THE dispatcher SHALL not report it as completed.
   - Verify-By: vitest
   - Evidence: Table-driven test for new Claude 2.1.169 state values.
4. WHEN JSON parsing fails, THE dispatcher SHALL include a short parse diagnostic while preserving existing inline fallback behavior.
   - Verify-By: vitest
   - Evidence: Regression test for malformed stdout.
5. THE result collection path SHOULD support Claude 2.1.169 `--all` semantics or equivalent local result handling so completed and non-completed background sessions are not accidentally omitted from review/decide summaries.
   - Verify-By: vitest
   - Evidence: `buildAgentArgs`/collector test covers `--all` option when enabled.

### R2: Forge Diagnostic Mode

**User Story:** As a Forge user troubleshooting hook/plugin behavior, I want a Forge diagnostic mode that suppresses optional Forge context injection and customization layers while keeping `/forge status`, `/forge doctor`, and basic dispatch usable.

#### Acceptance Criteria

1. WHEN `FORGE_DIAGNOSTIC_MODE=1` is set, THE SessionStart evolved-rules injector SHALL skip additionalContext output and exit 0.
   - Verify-By: vitest
   - Evidence: Script test runs `scripts/inject-evolved-rules.mjs` with env var and asserts empty stdout.
2. WHEN diagnostic mode is active, THE injector SHALL not set `reloadSkills` or `sessionTitle`.
   - Verify-By: vitest
   - Evidence: Script test asserts no JSON hook payload.
3. THE diagnostic mode SHALL be documented as distinct from Claude Code `--safe-mode`: it keeps Forge callable and only disables optional Forge injections/diagnostics.
   - Verify-By: bash
   - Evidence: `grep FORGE_DIAGNOSTIC_MODE docs/claude-code-compatibility.md`.
4. THE implementation SHALL avoid changing normal SessionStart behavior when the env var is absent.
   - Verify-By: vitest
   - Evidence: Existing injector tests continue to pass and one regression test covers default injection.
5. `forge-doctor` SHOULD surface whether diagnostic mode is active.
   - Verify-By: bash
   - Evidence: `forge-doctor --json` includes diagnostic mode status or equivalent documented output.

### R3: Claude Code 2.1.169 Compatibility Documentation

**User Story:** As a Forge maintainer, I want the compatibility matrix to document Claude Code 2.1.169 features and their Forge implications, so future upgrades are grounded in verified platform behavior rather than memory.

#### Acceptance Criteria

1. THE compatibility document SHALL add a v2.1.169 section covering `--safe-mode`, `/cd`, `disableBundledSkills`, `claude agents --json --all`, `id`, `state`, context-window-scaled CLAUDE.md warning, and background session flag preservation.
   - Verify-By: bash
   - Evidence: `grep -n '2.1.169' docs/claude-code-compatibility.md`.
2. THE feature matrix SHALL distinguish features Forge uses directly from features Forge only documents as operator guidance.
   - Verify-By: manual
   - Evidence: Matrix includes a Forge action/degradation column.
3. THE docs SHALL state that Forge diagnostic mode is not equivalent to Claude Code `--safe-mode`.
   - Verify-By: bash
   - Evidence: `grep -n 'FORGE_DIAGNOSTIC_MODE' docs/claude-code-compatibility.md`.
4. THE docs SHALL cite the exact Claude Code version and changelog date used for the assessment.
   - Verify-By: bash
   - Evidence: Document includes `2.1.169` and `2026-06-08`.

### R4: Subagent Worktree Edit Preflight

**User Story:** As a Forge user dispatching subagents, I want background agents to know before editing that shared-checkout edits are blocked until they run in the proper worktree, so they do not waste a rejected edit attempt.

#### Acceptance Criteria

1. THE review/decide/build subagent prompt builder SHALL include a concise preflight instruction when a subagent may edit files or operate in a worktree-sensitive path.
   - Verify-By: vitest
   - Evidence: Prompt test asserts presence of the preflight text.
2. THE preflight SHALL not claim an unavailable platform capability; it SHALL be phrased as Forge policy guidance and refer to current workdir/worktree verification.
   - Verify-By: manual
   - Evidence: Review of prompt text against R13 evolved rule.
3. THE prompt SHALL remain under existing prompt-size safeguards, including the current 4096-character truncation boundary in `buildAgentArgs`.
   - Verify-By: vitest
   - Evidence: Test verifies preflight appears before truncation-sensitive task text.
4. THE worktree guidance SHALL not be injected into purely read-only review agents unless needed for shared-checkout safety.
   - Verify-By: vitest
   - Evidence: Test covers read-only review prompt behavior.

### R5: Model-Window-Aware Context Budget Diagnostics

**User Story:** As a Forge maintainer, I want context budget warnings to scale with the active model's context window when that information is configured or inferable, so large-window models are not warned by overly conservative absolute thresholds and small-window models remain protected.

#### Acceptance Criteria

1. THE context budget module SHALL expose a pure helper that computes warning thresholds from `{ contextWindowTokens, ratios }`.
   - Verify-By: vitest
   - Evidence: Unit tests for 100K, 200K, and 1M token windows.
2. WHEN no model context window is known, THE helper SHALL fall back to the existing configured `context_budget` behavior.
   - Verify-By: vitest
   - Evidence: Unit test for unknown context window.
3. THE docs SHALL clarify that `Math.ceil(text.length / 4)` style estimates are conservative approximations and actual tokenization depends on model/runtime.
   - Verify-By: bash
   - Evidence: Documentation grep for conservative estimate note.
4. THE implementation SHALL not attempt to read Claude's live context percentage unless a verified API exists.
   - Verify-By: manual
   - Evidence: Design text references evolved rule R13 and fallback config.

### R6: Execution Environment Metadata Persistence

**User Story:** As a Forge user resuming a task, I want `.tinkerman/status.md` or associated progress metadata to record key execution environment choices, so `/forge resume`, debug, and review can explain how the previous run was dispatched.

#### Acceptance Criteria

1. THE status/progress writer SHALL be able to persist execution metadata including `claude_version`, `dispatch_mode`, `diagnostic_mode`, `tier`, `branch`, and relevant `FORGE_*` flags.
   - Verify-By: vitest
   - Evidence: Status serialization test includes metadata roundtrip.
2. WHEN metadata is absent in older status files, THE parser SHALL gracefully return defaults without failing resume.
   - Verify-By: vitest
   - Evidence: Backward-compatibility test with existing status fixture.
3. `/forge resume` output SHOULD include a compact metadata line when such metadata exists.
   - Verify-By: vitest
   - Evidence: Resume output test includes metadata summary.
4. THE metadata SHALL avoid storing secrets or full environment dumps; only allowlisted keys may be persisted.
   - Verify-By: vitest
   - Evidence: Test proves `ANTHROPIC_API_KEY` and unrelated env vars are excluded.
5. THE docs SHALL mention metadata as diagnostic context, not as a behavior source of truth that overrides `.tinkerman/config.md`.
   - Verify-By: manual
   - Evidence: Compatibility or architecture docs updated.

## Cross-Cutting Constraints

- All implementation tasks MUST follow RED -> GREEN -> REFACTOR.
- Any `src/**/*.ts` change MUST be followed by dist synchronization.
- New platform capability claims MUST be verified by tests, official docs, or explicit fallback wording.
- New config parsing MUST preserve graceful fallback behavior for old projects.
- No secrets may be written to `.tinkerman/status.md`, `.tinkerman/progress/`, or `.tinkerman/debug/`.

