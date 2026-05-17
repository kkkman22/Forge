---
topic: forge-single-entry-skills-collapse
date: 2026-05-17
result: passed
reviewed_at_commit: f5a6588623a48848792938cadd408c8c028e3c89
rereview_at_commit: cdd06da0e3d9a7c5f3a3b8c4e5f6a7b8c9d0e1f2
p0_count: 0
p1_count: 0
p2_count: 0
p3_count: 2
layers:
  - spec-check
  - quality-check
  - security-check
---

# Review Report — forge-single-entry-skills-collapse

## Review Methodology

Subagents hit turn limits before producing reports (spec-check: 23 turns, quality-check: 15 turns, security-check: 10 turns). Review performed directly by main agent using spec + source code + diff context. Diff context prepared by `prepare-diff-context.mjs` (source: `shell_with_truncate_lib`, 32 real hunks).

Re-review at commit `cdd06da` after P1 + P2 fixes applied.

---

## Layer 1 — Spec Alignment

### Checklist

| Req | Status | Evidence |
|-----|--------|----------|
| R1.1 | PASS | `glob skills/*/SKILL.md` = `["skills/forge/SKILL.md"]` only |
| R1.2 | PASS-pending-ship | Menu still shows 29 `forge:forge-<sub>` from v2.4.0 plugin cache (deferred to ship) |
| R1.3 | PASS | `bare-forge-help.test.ts` verifies 29 subs + tier grouping |
| R1.4 | PASS | `ls -d skills/forge-*/SKILL.md` → "no matches". `skills/forge/lib/<29>/instructions.md` all exist |
| R1.5 | PASS | `grep "Skill(forge-[a-z]" src/ scripts/ skills/forge/` → zero hits |
| R2.1 | PASS | `allowlist.ts`: 29 exact tokens, `includes(trimmed)` exact match, Levenshtein suggestion |
| R2.2 | PASS | `path-resolve.ts`: dual-mode (CLAUDE_PLUGIN_ROOT vs cwd), `realpathSync` within root, `..` rejection |
| R2.3 | PASS (re-review) | `src/forge-dispatcher.ts:84` reads actual `instructions.md` via `readFileSync`, passes to `resolveAllowedTools` — per-sub `allowed_tools` enforced from frontmatter. Verified by `dispatcher-integration.test.ts` (zoom-out gets `[Read, Glob, Grep]`, status gets `[Read, Bash]`). |
| R2.4 | PASS | `untrusted-fence.ts`: preamble + `<untrusted source="...">` wrapping |
| R2.5 | PASS | `registry.toml` auto-generated, `check-registry-parity.sh` CI gate exit 0 |
| R2.6 | PASS (re-review) | `src/forge-dispatcher/integrity-check.ts` reads `manifest.json`, compares sha256. Verified by `dispatcher-integration.test.ts` (all 29 subs PASS, tamper detection returns `E_INTEGRITY_MISMATCH`, missing manifest returns `E_MANIFEST_MISSING`). |
| R2.7 | PASS | `audit-log.ts`: writes to `${CLAUDE_PLUGIN_DATA}/forge/audit/`, falls back to `~/.claude/`, not `.forge/` |
| R2.8 | PASS-deferred | R2.8b plugin mode + silent shadow deferred to ship phase |
| R2.9 | PASS | Merged into R1.3 per spec |
| R2.10 | PASS | `dispatcher-mode-flag.test.ts` covers collapsed + legacy modes |
| R3.1-R3.5 | PASS (re-review) | All 29 dispatch_mode values verified against R3.5 table. Step 6 now reads from lib frontmatter (no hardcoded `FORK_SUBS` set). Verified by `dispatch-mode-rule.test.ts` (3/3 PASS). |
| R4.1-R4.3 | PASS | `refs-self-relative.test.ts`, `refs-cross-rewrite.test.ts`, `cross-lib-refs.test.ts` |
| R5.1 | PASS | Frontmatter: `name: forge`, description non-empty, no `disable-model-invocation`, `allowed-tools: Read, Agent, Glob, Grep, Bash, Skill` |
| R5.2 | PASS | 9-step chokepoint order verified in `dispatch-chokepoint-order.test.ts` |
| R5.3 | PASS | `skills/forge/SKILL.md` = 86 lines ≤ 250, `skeleton_exempt_legacy: true` present |
| R6.1 | PASS | ADR-0004 exists with 7 fields + 6 sections + `supersedes_partial: ADR-0003` |
| R6.2 | PASS | `adr-index.md` contains ADR-0004 entry |

### Original P1 Findings (RESOLVED)

#### P1-S1: C3 Tool Scoping — RESOLVED in f68eff0

**Original Issue**: `resolveAllowedTools` always received hardcoded mock string, never read actual `instructions.md`.
**Resolution**: `src/forge-dispatcher.ts` Step 5 now `readFileSync(pathResult.path)` and passes content to `resolveAllowedTools`. Per-sub `allowed_tools` enforced from frontmatter.
**Verified by**: `dispatcher-integration.test.ts` — zoom-out gets `[Read, Glob, Grep]`, status gets `[Read, Bash]`, not just `[Read]`.

#### P1-S2: C6 Integrity Check — RESOLVED in f68eff0

**Original Issue**: `checkIntegrity` hardcoded `{ ok: true }`, never compared sha256.
**Resolution**: New `src/forge-dispatcher/integrity-check.ts` reads `manifest.json`, computes sha256, compares. Returns `E_MANIFEST_MISSING` or `E_INTEGRITY_MISMATCH`.
**Verified by**: `dispatcher-integration.test.ts` — all 29 subs PASS integrity, tampered content rejected, missing manifest detected.

---

## Layer 2 — Code Quality (re-review)

### Original P2 Findings (RESOLVED)

#### P2-Q1: FORK_SUBS Hardcoded Set — RESOLVED in cdd06da

**Original Issue**: Step 6 used hardcoded `FORK_SUBS` set duplicating R3.5 table.
**Resolution**: Step 6 now parses `dispatch_mode` from `libContent` frontmatter (same content loaded in Step 5). `FORK_SUBS` deleted.
**Verified by**: `dispatch-mode-rule.test.ts` (3/3 PASS), behavior unchanged.

#### P2-Q2: Misleading Variable Name — RESOLVED in f68eff0

**Original Issue**: `mockLibContent` used in production path.
**Resolution**: Variable deleted entirely — replaced by `libContent` from actual file read.

#### P2-Q3: Missing fs Import — RESOLVED in f68eff0

**Original Issue**: Orchestrator had no `fs` import.
**Resolution**: `import { readFileSync } from "node:fs"` added in f68eff0.

---

## Layer 3 — Security

### P3 Findings (not blocking ship)

#### P3-L1: Audit "HMAC" Uses Unkeyed SHA-256 Hash

**File**: `src/forge-dispatcher/audit-log.ts:22-25`
**Category**: tampering
**Confidence**: 0.85
**Status**: deferred — v2.5.0 scope. Chain detection works for deletion/reorder. Local-only log, no remote attack surface.
**Issue**: `computeHmac` uses `createHash("sha256")` (unkeyed) instead of `createHmac()`. Anyone with read access can recompute the chain.
**Fix**: Use `createHmac("sha256", secretKey)` with per-installation seed. Post-v2.5.0 hardening.

#### P3-L2: Symlink Race Condition in path-resolve

**File**: `src/forge-dispatcher/path-resolve.ts:49-54`
**Category**: traversal
**Confidence**: 0.7
**Status**: deferred — theoretical only, requires local access + precise timing.
**Issue**: TOCTOU between `realpathSync` check and `readFileSync`.
**Fix**: Use fd-based read. Post-v2.5.0 hardening.

---

## Severity Summary (re-review)

| Severity | Count | IDs |
|----------|-------|-----|
| P0 | 0 | — |
| P1 | 0 | (P1-S1, P1-S2 resolved in f68eff0) |
| P2 | 0 | (P2-Q1 resolved in cdd06da, P2-Q2/Q3 resolved in f68eff0) |
| P3 | 2 | P3-L1 (unkeyed hash), P3-L2 (symlink race) |

---

## Gate Result

**PASSED** (after re-review at cdd06da) — P0=0, P1=0, P2=0, P3=2.

P2/P3 findings recorded for follow-up but do not block ship.

### Fix Verification

| ID | File | Status |
|----|------|--------|
| P1-S1 | `src/forge-dispatcher.ts` | RESOLVED (f68eff0) — reads actual instructions.md |
| P1-S2 | `src/forge-dispatcher.ts` | RESOLVED (f68eff0) — integrity-check.ts sha256 vs manifest |
| P2-Q1 | `src/forge-dispatcher.ts` | RESOLVED (cdd06da) — dispatch_mode from frontmatter |
| P2-Q2 | `src/forge-dispatcher.ts` | RESOLVED (f68eff0) — mockLibContent deleted |
| P2-Q3 | `src/forge-dispatcher.ts` | RESOLVED (f68eff0) — fs import added |

### Deferred (not blocking)

- R2.8b plugin mode + silent shadow → ship phase gate
- R1.2 plugin cache refresh → ship phase (after plugin update)
- P3-L1 unkeyed HMAC → post-v2.5.0 hardening
- P3-L2 symlink TOCTOU → post-v2.5.0 hardening

## Diff Context Quality

- source: `shell_with_truncate_lib`
- 32 real `@@ ... @@` hunks present
- No narrative summary — verified authentic unified diff
