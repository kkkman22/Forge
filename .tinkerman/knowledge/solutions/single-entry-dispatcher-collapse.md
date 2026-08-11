---
title: "Single-Entry Dispatcher: Security Controls & Review Pitfalls"
tags: ["dispatcher", "security-controls", "chokepoint", "review", "stub-detection", "dist-sync"]
date: "2026-05-17"
confidence: 0.9
related:
  - .tinkerman/decisions/ADR-0004-skills-collapse-and-dispatcher.md
  - .tinkerman/knowledge/evolved-rules.md#R8
  - .tinkerman/knowledge/evolved-rules.md#R9
  - .tinkerman/findings/learn-report-forge-single-entry-skills-collapse.md
---

## Problem Pattern

Collapsing N independent skill directories (29 `skills/forge-*/SKILL.md`) into a single-entry dispatcher (`skills/forge/SKILL.md` → `lib/<sub>/instructions.md`) introduces a surface area where security controls are concentrated in one chokepoint. Any stub or no-op in the chokepoint silently defeats the entire security model.

## Solution

9-step dispatcher chokepoint in `src/forge-dispatcher.ts` with 6 sub-modules:
1. `allowlist.ts` — exact token match + Levenshtein suggestion (C1)
2. `path-resolve.ts` — dual-mode (CLAUDE_PLUGIN_ROOT vs cwd), realpath symlink check (C2, C9)
3. `integrity-check.ts` — sha256 vs manifest.json (C6)
4. `tools-resolve.ts` — per-sub allowed_tools from frontmatter (C3)
5. `untrusted-fence.ts` — `<untrusted source>` wrapping (C4)
6. `audit-log.ts` — HMAC-chained NDJSON outside workspace (C7)

Dispatch mode (`fork` vs `inline`) parsed from lib frontmatter, not hardcoded.

## Pitfall Record

1. **P1-S1: Tools resolve used mock content instead of reading actual file** — `resolveAllowedTools` received hardcoded string in production path. Review caught it: "zoom-out gets [Read, Glob, Grep]" proved wrong. Fix: `readFileSync(pathResult.path)` in Step 5.

2. **P1-S2: Integrity check was `{ ok: true }` stub** — `checkIntegrity` never compared sha256. Review caught it. Fix: new `integrity-check.ts` module reading manifest.json.

3. **P2-Q1: Hardcoded FORK_SUBS set** — Step 6 had a `Set<string>` duplicating R3.5 table. Any new sub requires code change. Fix: parse `dispatch_mode` from `libContent` frontmatter (same content loaded in Step 5).

4. **Review subagent turn limits** — spec-check hit 23 turns, quality-check 15 turns, security-check 10 turns without producing reports. Fell back to direct main-agent review. Lesson: for large diffs (32 hunks), review directly or split the diff.

5. **Post-push stale contract tests** — `test/contract.test.ts` checks for `skills/forge-*/SKILL.md` in dist bundle, which no longer exists after collapse. Need to update contract tests alongside structural migrations.

## Decision Rationale

- **Why single-entry**: ADR-0004 — reduces attack surface from 29 registration points to 1, enables centralized security controls, simplifies plugin registration
- **Why frontmatter-based dispatch_mode**: Avoids maintaining a hardcoded set in source code; each lib/instructions.md declares its own mode
- **Why compiled-module testing for R2.8b**: Claude CLI doesn't support `file://` plugin install; compiled dispatcher + controlled env vars test the actual resolution logic without needing a real plugin install

## Reusable Pattern

**Dispatcher Chokepoint Pattern**: When consolidating N entry points into 1:
1. Allowlist validation (exact match, not regex)
2. Path resolution with dual-mode (plugin vs dev) and realpath check
3. Integrity verification (sha256 vs manifest)
4. Per-entry tool scoping from metadata
5. Untrusted content wrapping
6. Audit logging outside workspace

Each step is independently testable. Stubs must fail visibly (return error, not `{ ok: true }`). Review must verify production path reads actual files, not mock content.
