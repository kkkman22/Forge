# Solution — code-slim-0612: Behavior-Preserving Code Slimming

> ADR-0008 · Full tier · refactor · 2026-06-13 · PR #93

## Problem

Mature brownfield repo (src/ 172 files ~16K lines) accumulated dead code, idempotent barrel re-exports, and internal duplication. Goal: lower maintenance cost via equivalence refactor — **zero external behavior change** (public API / CLI / MCP tool contracts / Bitbucket markers are all hard contracts).

## Approach (what worked)

1. **Module-sliced execution** — split the vague "slim the whole project" into 6 module-scoped sub-tasks across 3 risk-graded execution packages (P1 low / P2 medium / P3 high), each its own build→review→test→ship. Made an unbounded problem bounded and reviewable.
2. **4-class change allowlist** (design.md §1) — only: (a) certain dead code, (b) idempotent barrel re-exports, (c) grep+entry-verified unreferenced exports, (d) signature-identical pure-function merges. Anything outside = reject. This discipline is what kept behavior preserved.
3. **R10 before plan/build, every time** — grep import + entry + caller-chain (2-level) verification *before* committing to a deletion. This collapsed decide-phase over-estimates (see meta-pattern below).
4. **Conservative skip when no safe change space** — T3 (ghost API) and T5 (skill refs) had zero safe deletion surface; skipped honestly rather than forcing changes that would violate INV-1/REQ-5.

## Outcome

- 3 deletions landed (deprecated.ts 152L, barrel re-export, 3 docs-governance modules ~303L); 1 internal merge (execCommand -27L).
- 2 tasks conservatively skipped (T3/T5) after verification.
- 7406 tests green throughout; 4-layer review pass; public-api / dist-sync / metrics all unchanged.

## Key decisions & rationale

- **No adapter/abstraction layer for de-dup** — adding abstraction contradicts "slim"; and the 3 `parseGitLog` variants have different signatures (Critic #3). Merging them would change caller contracts = behavior change.
- **Tests are a refactor object, not just a net** — `barrel-file.test.ts` magic-number assertions (140) updated alongside deletions; security/parity tests strictly preserved (INV-4).
- **dist/src gitignored, dist/test tracked** — `dist:resync` recompiles dist/src (gitignored) via its tsc step; `check-dist-sync` validates tracked dist/test against src. Stage src (`git add`) before check-dist-sync because it reads the git **index**, not the working tree (see instinct).

## Reusable meta-pattern

**decide scope estimates are optimistic ceilings; R10 verification always shrinks them.** 3 of 6 sub-tasks (T3/T5/T6) had decide-phase estimates (e.g. "12 merge candidates") collapse to 0 or 1 after grep+caller verification. Rule: never trust the LOC/candidate estimate; verify before planning effort; shrink scope honestly when the real surface is smaller.

## Session anomaly (recorded for future)

T6 build collided with a concurrent session operating on the same working tree (foreign commit reset the branch, dropped the P2 checkpoint, rewrote ancestry mid-build). Recovered via patch-save → stop → re-establish ground truth → re-apply. See `known-failures.md: concurrent-session-git-collision` and instinct "同仓库并发会话冲突的检测信号与恢复". Detection now in the knowledge base.
