---
topic: forge-single-entry-skills-collapse
date: 2026-05-17
result: passed
reviewed_at_commit: f5a6588623a48848792938cadd408c8c028e3c89
rereview_at_commit: f68eff00e39c76fcbb60b92f4f2bb49f28f0b59d
p0_count: 0
p1_count: 0
p2_count: 3
p3_count: 2
layers:
  - spec-check
  - quality-check
  - security-check
---

# Review Report — forge-single-entry-skills-collapse

## Review Methodology

Subagents hit turn limits before producing reports (spec-check: 23 turns, quality-check: 15 turns, security-check: 10 turns). Review performed directly by main agent using spec + source code + diff context. Diff context prepared by `prepare-diff-context.mjs` (source: `shell_with_truncate_lib`, 32 real hunks).

---

## Layer 1 — Spec Alignment

### Checklist

| Req | Status | Evidence |
|-----|--------|----------|
| R1.1 | PASS | `glob skills/*/SKILL.md` = `["skills/forge/SKILL.md"]` only |
| R1.2 | PASS-pending-ship | Menu still shows 29 `forge:forge-<sub>` from v2.4.0 plugin cache (see findings) |
| R1.3 | PASS | `bare-forge-help.test.ts` verifies 29 subs + tier grouping |
| R1.4 | PASS | `ls -d skills/forge-*/SKILL.md` → "no matches". `skills/forge/lib/<29>/instructions.md` all exist |
| R1.5 | PASS | `grep "Skill(forge-[a-z]" src/ scripts/ skills/forge/` → zero hits |
| R2.1 | PASS | `allowlist.ts`: 29 exact tokens, `includes(trimmed)` exact match, Levenshtein suggestion |
| R2.2 | PASS | `path-resolve.ts`: dual-mode (CLAUDE_PLUGIN_ROOT vs cwd), `realpathSync` within root, `..` rejection |
| R2.3 | **FAIL** | See P1-Q1 below — orchestrator never reads actual lib content for tool resolution |
| R2.4 | PASS | `untrusted-fence.ts`: preamble + `<untrusted source="...">` wrapping |
| R2.5 | PASS | `registry.toml` auto-generated, `check-registry-parity.sh` CI gate exit 0 |
| R2.6 | **STUB** | See P1-Q2 below — integrity check hardcoded `{ ok: true }` |
| R2.7 | PASS | `audit-log.ts`: writes to `${CLAUDE_PLUGIN_DATA}/forge/audit/`, falls back to `~/.claude/`, not `.forge/` |
| R2.8 | PASS-deferred | R2.8b plugin mode + silent shadow deferred to ship phase |
| R2.9 | PASS | Merged into R1.3 per spec |
| R2.10 | PASS | `dispatcher-mode-flag.test.ts` covers collapsed + legacy modes |
| R3.1-R3.5 | PASS | All 29 dispatch_mode values verified against R3.5 table (18 fork + 11 inline) |
| R4.1-R4.3 | PASS | `refs-self-relative.test.ts`, `refs-cross-rewrite.test.ts`, `cross-lib-refs.test.ts` |
| R5.1 | PASS | Frontmatter: `name: forge`, description non-empty, no `disable-model-invocation`, `allowed-tools: Read, Agent, Glob, Grep, Bash, Skill` |
| R5.2 | PASS | 9-step chokepoint order verified in `dispatch-chokepoint-order.test.ts` |
| R5.3 | PASS | `skills/forge/SKILL.md` = 86 lines ≤ 250, `skeleton_exempt_legacy: true` present |
| R6.1 | PASS | ADR-0004 exists with 7 fields + 6 sections + `supersedes_partial: ADR-0003` |
| R6.2 | PASS | `adr-index.md` contains ADR-0004 entry |

### P1 Findings (spec-check)

#### P1-S1: C3 Tool Scoping Not Enforced in Production

**File**: `src/forge-dispatcher.ts:79-88`
**Spec Ref**: R2.3
**Confidence**: 1.0
**Issue**: Step 5 (`resolveAllowedTools`) always receives a hardcoded mock string instead of the actual `lib/<sub>/instructions.md` content. In production path (no mock), line 88 calls `resolveAllowedTools(mockLibContent)` — which always returns `{Read}` regardless of which sub is being dispatched.
**Evidence**: Lines 79-85 define `mockLibContent` with `allowed_tools: [Read]`. Line 88 passes this to `resolveAllowedTools` in the non-mock branch.
**Impact**: Every sub-skill receives `{Read}` as its tool set. Sub-skills that need `Bash`, `Write`, `Edit`, `Agent` etc. would be unable to function correctly through the dispatcher. C3 enforcement is completely bypassed.
**Fix**: Read the actual `instructions.md` file content and pass it to `resolveAllowedTools`. Replace lines 79-88 with:
```typescript
const libContent = mocks?.readLibFile
  ? (mocks.readLibFile(pathResult.path) as string)
  : readFileSync(pathResult.path, "utf-8");
const toolsResult = resolveAllowedTools(libContent);
```

#### P1-S2: C6 Integrity Check Stubbed (Always Passes)

**File**: `src/forge-dispatcher.ts:69-76`
**Spec Ref**: R2.6
**Confidence**: 1.0
**Issue**: Step 4 (`checkIntegrity`) is a hardcoded `{ ok: true }` stub with a comment "placeholder — Task 7 provides real implementation". Task 7 delivered `build-lib-manifest.mjs` and `manifest.json` but the orchestrator never calls the integrity check function.
**Evidence**: Line 72: `: { ok: true }` — no actual sha256 comparison against manifest.
**Impact**: Tampered `instructions.md` files (modified by attacker or corrupted disk) pass through undetected. R2.6 integrity guarantee is void.
**Fix**: Import and call the integrity check function that compares file sha256 against `manifest.json`:
```typescript
import { checkLibIntegrity } from "./forge-dispatcher/integrity.js";
// ...
const integrityResult = mocks?.checkIntegrity
  ? (mocks.checkIntegrity(pathResult.path) as { ok: boolean })
  : checkLibIntegrity(pathResult.path, manifestPath);
```
Requires creating `src/forge-dispatcher/integrity.ts` if not already present.

---

## Layer 2 — Code Quality

### P2 Findings

#### P2-Q1: Step 6 Dispatch Mode Uses Hardcoded Set Instead of Frontmatter

**File**: `src/forge-dispatcher.ts:102-107`
**Category**: maintainability
**Confidence**: 0.95
**Issue**: The `FORK_SUBS` set in the orchestrator duplicates the R3.5 table as a hardcoded list. Adding a new sub requires updating both the allowlist AND this set. The spec says dispatch_mode should come from lib frontmatter.
**Evidence**: Lines 102-106 define a `Set` of 18 fork-mode subs, duplicating data already in each `instructions.md` frontmatter.
**Fix**: Read `dispatch_mode` from the already-loaded lib content (same file read needed for P1-S1 fix). Delete the `FORK_SUBS` constant.

#### P2-Q2: Step 5 Mock Variable Name Misleading

**File**: `src/forge-dispatcher.ts:79`
**Category**: naming
**Confidence**: 0.9
**Issue**: Variable named `mockLibContent` is used in the **production** (non-mock) path at line 88. This misleads readers into thinking it's only for testing.
**Evidence**: Line 88 `resolveAllowedTools(mockLibContent)` — this runs when `mocks?.resolveAllowedTools` is falsy, i.e., in production.
**Fix**: Rename to `fallbackLibContent` or (better) remove entirely per P1-S1 fix.

#### P2-Q3: Orchestrator Lacks File Read Import

**File**: `src/forge-dispatcher.ts:1-5`
**Category**: error-handling
**Confidence**: 0.85
**Issue**: The orchestrator imports no file-reading capability. To fix P1-S1, it needs `readFileSync` or equivalent, but currently has no `fs` import.
**Fix**: Add `import { readFileSync } from "node:fs";` when implementing P1-S1 fix.

---

## Layer 3 — Security

### P3 Findings

#### P3-L1: Audit "HMAC" Uses Unkeyed SHA-256 Hash

**File**: `src/forge-dispatcher/audit-log.ts:22-25`
**Category**: tampering
**Confidence**: 0.85
**Issue**: `computeHmac` uses `createHash("sha256")` (unkeyed hash) instead of `createHmac()`. The chain is `H(data) = SHA256(prev_H || data)` — anyone who can read the log can recompute the chain. It's a tamper-evident chain ( detects deletion/reorder) but not a forgery-resistant HMAC (no secret key means an attacker with write access can forge entries).
**Attack Scenario**: Attacker with write access to `dispatch.log` can forge entries by computing the chain forward.
**Fix**: Use `createHmac("sha256", secretKey)` where the secret is derived from a per-installation seed stored in `${CLAUDE_PLUGIN_DATA}/forge/audit/.key`. Not blocking for v2.5.0 since the audit log is local-only and the chain detection is sufficient for the current threat model.
**Severity Rationale**: Downgraded from P2 because: (a) local-only audit log, (b) chain detection still works for deletion/reorder, (c) no remote attack surface.

#### P3-L2: Symlink Race Condition in path-resolve

**File**: `src/forge-dispatcher/path-resolve.ts:49-54`
**Category**: traversal
**Confidence**: 0.7
**Issue**: `realpathSync` is called after path construction but before file use. A TOCTOU race exists where an attacker could replace a lib directory with a symlink between the `realpathSync` check and the actual `readFileSync`. However, this requires local filesystem access during the millisecond window, making it practically unexploitable.
**Fix**: Use `realpathSync` on the opened file descriptor instead of the path (not possible with current Node.js `readFileSync` API — would require `openSync` + `readSync`). Consider acceptable risk for v2.5.0.
**Severity Rationale**: P3 — theoretical only, requires local access + precise timing.

---

## Severity Summary

| Severity | Count | IDs |
|----------|-------|-----|
| P0 | 0 | — |
| P1 | 2 | P1-S1 (C3 tools), P1-S2 (C6 integrity) |
| P2 | 3 | P2-Q1 (dispatch mode), P2-Q2 (naming), P2-Q3 (missing import) |
| P3 | 2 | P3-L1 (unkeyed hash), P3-L2 (symlink race) |
| **Total** | **7** | |

---

## Gate Result

**BLOCKED** — P1 count = 2 (P0=0, P1=2, P2=3, P3=2)

Ship blocked until P1-S1 and P1-S2 are fixed.

### P1 Fix Checklist

| ID | File | Fix Required |
|----|------|-------------|
| P1-S1 | `src/forge-dispatcher.ts` | Replace mockLibContent with actual file read + pass to resolveAllowedTools |
| P1-S2 | `src/forge-dispatcher.ts` | Implement real integrity check against manifest.json sha256 |

### Deferred (not blocking)

- R2.8b plugin mode + silent shadow → ship phase gate
- R1.2 plugin cache refresh → ship phase (after plugin update)
- P3-L1 unkeyed HMAC → future hardening
- P3-L2 symlink TOCTOU → acceptable risk

## Diff Context Quality

- source: `shell_with_truncate_lib`
- 32 real `@@ ... @@` hunks present
- No narrative summary — verified authentic unified diff
