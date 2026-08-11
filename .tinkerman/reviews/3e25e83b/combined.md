---
review_run_id: 3e25e83b
topic: external-review-remediate-tabbit
date: 2026-06-23
methodology: subagent-parallel
base: 9fdc6562 (main)
head: 3e25e83b
severity_counts:
  P0: 0
  P1: 0
  P2: 5
  P3: 4
verdict: pass (no P0/P1 — ship not blocked per §3.3)
---

# Review — external-review-remediate-tabbit (3e25e83b)

Three independent subagents (fresh context, §3.1 isolation): spec-check / quality-check / security-check. Per-layer raw output in `L1-spec-check.md` / `L2-quality-check.md` / `L3-security-check.md`.

## Severity Summary

| Layer | status | P0 | P1 | P2 | P3 |
|-------|--------|----|----|----|----|
| L1 spec-check | fail | 0 | 0 | 1 | 0 |
| L2 quality-check | pass | 0 | 0 | 1 | 1 |
| L3 security-check | pass | 0 | 0 | 3 | 3 |

**Verdict: PASS** — 0 P0 / 0 P1. Per constitution §3.3, only P0/P1 block ship. 6 of 7 REQs judged PASS by all three layers; REQ-04 has a DoD gap.

## Consolidated Findings (deduplicated, cross-validated)

### [P2] F-01: REQ-04 missing CI-visible misuse-detection leg (L1-R001)
- **REQ**: REQ-04
- **Gap**: Spec EARS (requirements.md:131) + tasks DoD (tasks.md:105) explicitly require "lint 规则或运行时告警，使误用在 CI 可见" when consumer migration is deferred (which it is, per design D4). Only the documentation leg (SANDBOX_DEFAULT_SEMANTICS + CHANGELOG) was delivered; CI-detection leg absent.
- **INV-2 intact**: no interception weakened.
- **Fix**: biome `noRestrictedImports` banning legacy symbols outside `check-sandbox.ts`/`sdk-sandbox-policy.ts`, OR one-shot runtime deprecation warn in legacy fns. + a test proving it flags misuse.

### [P2] F-02: T2 isolation logic duplicated 4× — plan's REFACTOR not done (L2-R001)
- **File**: guarded-merger.ts (4 sites in mergeProgressFile/mergeInstinctsOrFailures)
- **Gap**: Plan T2 DoD committed "REFACTOR: 抽隔离逻辑为独立小函数" (analogous to T1's extractProgressTimestamp which WAS done). Drift risk: 4 sites must update in lockstep.
- **Fix**: Extract `collectOrIsolate` helper + shared `flushIsolated`.

### [P2] F-03: PEM regex requires END footer — truncated/header-only key body leaks (L3-R001)
- **File**: secret-redactor.ts:29
- **Gap**: `[\s\S]*?-----END...` — a key truncated before its footer (log line-limit, partial paste) matches nothing; base64 body leaks. Not a regression (no PEM pattern before) but creates false "PEM is covered" impression.
- **Fix**: Add header-only pattern: `-----BEGIN [A-Z ]*PRIVATE KEY-----` + base64 body to blank/non-base64 line.

### [P3] F-04: isMainEntry relative-path test is tautological (L2-R002)
- **File**: check-frozen-source.test.ts:72-78
- **Gap**: asserts `typeof === "boolean"` — passes regardless of correctness. Comment admits it.
- **Fix**: pin concrete `false` (relative argv can't resolve against absolute moduleUrl) or drop.

### [P2] F-05: Lock-timeout fail-soft silently drops audit record, breaking HMAC chain (L3-R002)
- **File**: audit-log.ts:141-150
- **Note**: Fail-soft drop is PRE-EXISTING (old appendFile catch did the same) and is the spec's INTENTIONAL design (REQ-06: "锁超时降级为现有 best-effort 行为"). The lock path widens the drop surface. Tamper-evidence hardening (gap marker) exceeds REQ-06 scope.
- **Disposition**: backlog (integrity hardening, not a regression; spec scoped to "reuse existing primitive").

### [P2] F-06: Stale-lock TOCTOU can steal a slow holder's lock → torn records (L3-R003)
- **File**: tool-health-writer.ts:127-137 (pre-existing, now shared by audit-log)
- **Note**: PRE-EXISTING in tool-health-writer (CHANGELOG F8). REQ-06 raises blast radius by routing audit through it. PID-in-lockfile hardening exceeds "reuse existing scheme" scope.
- **Disposition**: backlog (would harden BOTH tool-health and audit; separate hardening spec).

### [P3] F-07/F-08/F-09: PGP private key block, JWT empty-payload, POSIX URL-encoding/UNC (L3-R004/R005/R006)
- **Note**: All edge cases, several pre-existing limitations. PGP via `[A-Z ]*` can't absorb ` BLOCK`.
- **Disposition**: F-07 (PGP) cheap to fold into F-03's generalized pattern; F-08/F-09 backlog.

## Proposed Fix Set (this round)

| ID | Priority | Action | Scope |
|----|----------|--------|-------|
| F-01 | P2 | REQ-04 CI-detection (lint rule + test) | DoD closure |
| F-02 | P2 | T2 REFACTOR extract isolation helper | DoD closure |
| F-03 | P2 | PEM header-only redaction pattern | security hardening |
| F-04 | P3 | isMainEntry test pin concrete value | test quality |
| F-07 | P3 | generalize PEM pattern to cover PGP (folded into F-03) | security |

**Backlog (out of this spec's scope):**
- F-05 (HMAC gap marker on lock timeout)
- F-06 (PID-based stale-lock detection)
- F-08/F-09 (JWT empty-payload, POSIX URL-encoding/UNC paths)
