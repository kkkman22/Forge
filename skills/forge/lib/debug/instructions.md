---
description: "Use when user says debug this, reports a regression, or after three consecutive build failures trigger the three-strike reroute"
updated: 2026-06-21
context: fork

dispatch_mode: fork
allowed_tools:
  - Read
  - Agent
  - Glob
  - Grep
  - Bash
  - Write
  - Edit
  - WebSearch
---

# /forge debug — Scientific Debugging Engine

> **Trigger**: `/forge build` fails 3 consecutive times (Three-Strike reroute), or user enters `/forge debug`
> **Responsibility**: Structured 5-phase scientific debugging with falsifiable hypothesis testing
> **Output path**: `.forge/debug/{slug}.md`

---

## 1. Overview

`/forge debug` uses the **Scientific Method** for debugging: falsifiable hypothesis testing + persistent debug files + append-only knowledge base. Each phase has clear entry/exit criteria. No phase may be skipped.

**Core Principle**: Understand the problem before solving it. Proposing a fix before root cause is confirmed = shooting in the dark.

**Iron Laws**:
1. Phase 1 incomplete → no fix proposals allowed. Non-negotiable.
2. No tight red-capable loop → no Phase 2 hypothesis generation. Build the loop first (see Phase 1 gate below).
3. No Structured Reasoning Checkpoint → no fix applied. Violates Three-Strike rule.
4. Same hypothesis fails 3 times consecutively → stop, question architecture.

**Not For**:
- Known root-cause simple fixes (use `/forge fix`)
- Non-code issues (environment config, permissions)

### §1.5 Pre-flight: Branch Gate

Call `runBranchGate({ skill: "debug", mode, currentBranch, currentTask, pendingDeliveries, alreadyCheckedThisPhase, isCleanTree })`:
- `passed` / `skipped` → continue
- `auto_fixed` → output `✅ Switched to <newBranch>` then continue
- `blocked` → abort skill, output corresponding prompt
- `warned` → output warning but continue

Default severity: warn. `--cross-branch` sets `severityOverride: warn` for cross-branch debugging.

### §1.6 Debug Modes

| Mode | Trigger | Behavior |
|------|---------|----------|
| `find_root_cause_only` | User wants diagnosis only | Phases 1-3, no fix |
| `find_and_fix` | Default | Full Phases 1-5 |
| `tdd_mode` | TDD fix needed | Phase 4 uses RED→GREEN→REFACTOR |
| `symptoms_prefilled` | Three-Strike triggered | Skip Phase 1 (symptoms already in context). Three consecutive same-direction failures **are themselves a red-capable signal**, so they satisfy the Phase 1→2 red-capable gate (see Phase 1). |

---

## 2. Five-Phase Scientific Process

### Phase 1 — Symptom Gathering (Fix Proposals Prohibited)

Gather all observable error behavior:
1. Read error messages, stack traces, logs completely
2. Determine reproduction conditions (stable vs intermittent)
3. Check recent Git changes (`git log --oneline -20`, `git diff`)
4. Read spec health verdict — if marginal/degraded, include "problem may stem from ambiguous spec" as hypothesis
5. If recommendations contain `trigger_grill`, optionally trigger grill-inline

**Output**: Write `.forge/debug/{slug}.md` with the Symptoms section. Set status to `"investigating"`.

**Write Rule**: Symptoms are **IMMUTABLE** after Phase 1. No modifications allowed in later phases.

**Phase 1→2 Gate — Tight Red-Capable Loop (铁律)**: Before entering Phase 2 (Hypothesis Generation), you must produce a **tight red-capable loop**: one named command (script path / test invocation / curl) that you have run **at least once**, and that is `red-capable` — it drives the real bug code path and asserts the user's exact symptom, going red on the bug. The loop must be **fast**, **deterministic** (or high-repro-rate for intermittent bugs — record the rate), and **agent-runnable**.

> Staring at code without a red-capable loop is the failure mode this gate exists to prevent. If you catch yourself hypothesizing before a red-capable command exists — **stop**, go build the loop.

**Loop construction tools** (try in order until one goes red on the bug): failing test · curl/HTTP replay · CLI snapshot · headless browser replay · trace replay · throwaway harness · fuzz · bisect harness · differential loop · human-in-the-loop bash. Treat the loop as a product — make it faster, sharper, more deterministic.

**No loop possible**: If the bug genuinely resists a tight loop, you must **explicitly declare so**, list the reproduction attempts already made, and request from the user one of: environment access, a captured artifact, or temporary instrumentation permission. **Do not** continue to hypothesis generation without this declaration.

**Iron Law**: Phase 1 incomplete → cannot propose fixes. This is non-negotiable. (Separately, no red-capable loop → cannot enter Phase 2 — see gate above.)

### Phase 2 — Hypothesis Generation

For each symptom, propose at least **2 falsifiable hypotheses**. Each hypothesis must include:
- **Hypothesis**: "If X, then we should observe Y"
- **Predicted observable result**
- **Falsification test**: what specific test would disprove this

Steps:
1. Compare with working/normal code paths
2. Search `.forge/debug/knowledge-base.md` for keyword matches (rank by overlap)
3. Search `known-failures.md` and `solutions/` directories
4. Pattern-match to narrow hypothesis space
5. Eliminate obviously unreasonable hypotheses (record in Eliminated section)

**Output**: Append Hypotheses section to debug file.

**Write Rule**: Hypotheses section is **append-only** — can add new hypotheses later but never delete existing ones.

### Phase 3 — Hypothesis Testing

Test **one hypothesis at a time**. Testing methods (priority order):
1. **Binary search** (git bisect, comment-out halves)
2. **Log/trace inspection** (add logging, inspect output)
3. **Minimal reproduction** (isolate the failing case)
4. **Code tracing** (follow indirection, map data flow)

For each test:
- Record: confirmed or excluded + evidence with timestamp
- If confirmed → proceed to Phase 4
- If excluded → move to next hypothesis (append to Eliminated section)
- If all hypotheses exhausted → go back to Phase 2 (generate new hypotheses)

**Three-Strike Rule**: Same hypothesis direction fails 3 times consecutively → stop fixing, question the architecture. Enter `/forge debug` with fresh perspective.

**Output**: Append to Evidence and Eliminated sections (both append-only).

### Phase 4 — Fix (only after root cause found)

**MUST fill Structured Reasoning Checkpoint before any fix**:

```markdown
## Structured Reasoning Checkpoint

Hypothesis: [the confirmed hypothesis]
Confirming Evidence: [what proved it]
Falsification Test: [what would disprove it]
Fix Rationale: [why this fix addresses the root cause]
Blind Spots: [what might we be missing]
```

**Iron Law**: No checkpoint = no fix. Violation of Three-Strike rule.

Then apply fix:
- **TDD mode** (`tdd_mode`): RED (failing test reproducing the bug) → GREEN (minimal fix) → REFACTOR
- **Normal mode**: Apply minimal fix addressing root cause
- TDD rules: see `../build/references/tdd-rules.md`

**Output**: Fix code + passing tests. Update debug file Resolution section.

### Phase 5 — Verification

1. Run full test suite
2. Confirm original symptom no longer reproduces
3. Confirm no regression (all previously passing tests still pass)
4. Set debug file status to `"resolved"`
5. **Fill `failure_class`** (dynamic-replan-loop R1) — classify the root cause:
   - `fixable_bug`（默认）: 根因是代码 bug，已修复。
   - `assumption_invalidated`: 根因是**剩余计划依赖的假设已失效**——debug 可能修了当前点，但剩余 task 仍基于失效假设。典型场景：依赖的接口/服务不存在、方案与现有架构冲突、前提数据结构已被改写。判此值时**必须**填 `invalidated_assumptions: string[]`（被证伪的假设，回查 router `assumptions` 或 status.md `### 假设` 章节）。
   - `environmental`: 根因是环境/依赖问题（缺依赖、权限不足），通常不靠改计划解决。
6. Interactive mode: prompt `/forge learn`
7. Autonomous mode: skip prompt
8. **Propagate replan signal to status.md (dynamic-replan-loop R4-AC1)** — WHEN `failure_class: assumption_invalidated`:
   - Write `replan_pending: "true"` into `.forge/status.md` frontmatter (passthrough field).
   - Write `invalidated_assumptions: [<the invalidated assumptions>]` into `.forge/status.md` frontmatter.
   - This is the signal the plan phase §1.7 reads to enter incremental replan mode. Without it the replan loop never triggers.
   - WHEN `failure_class` is `fixable_bug` or `environmental`: do NOT set `replan_pending` (leave it absent or `"false"`).
   - Note: `invalidated_assumptions` contains assumption descriptions that will be mirrored to tracked files (status.md, plan). Keep them technical and free of secrets/hostnames (run through `redactSecrets` if uncertain).

**保守判定（铁律，R1-AC4）**: 无法明确判定时**默认 `fixable_bug`**。误判为 `assumption_invalidated` 会不必要地打乱已批准计划，代价高于漏判（漏判最坏是连锁返工，three-strike 会再拦）。`off_by_one`/`null_propagation`/`logic_error` 等普通代码 bug 一律归 `fixable_bug`，不归 `assumption_invalidated`。

**Replan 熔断（dynamic-replan-loop，防 DoS）**: status.md 的 `replan_count` 字段（passthrough，plan §1.7 每次重规划后 +1）累计达到 3 时，debug SHALL 不再写 `replan_pending: "true"`，改为输出告警提示人工介入（防止 agent 系统性误判 failure_class 导致循环消耗额度）。three-strike 因 success 会重置计数，不能单独兜底 replan 循环。

After resolution, hooks.json PostToolUse automatically triggers integrity lint (same as forge-learn).

---

## 3. Debug Session File Format

Create `.forge/debug/{slug}.md` with this structure:

```markdown
---
slug: "auth-login-null-pointer"
created: "2026-06-05T10:30:00Z"
status: "in-progress"  # in-progress | resolved | abandoned
root_cause: ""  # fill when root cause found
resolution: ""  # fill when fix applied
failure_class: "fixable_bug"  # dynamic-replan-loop R1: fixable_bug | assumption_invalidated | environmental（默认 fixable_bug）
invalidated_assumptions: []  # 仅 failure_class: assumption_invalidated 时填：被证伪的假设清单
---

# Current Focus
<!-- OVERWRITE on each update — always reflects what is being done right now -->
Testing hypothesis H2: bcrypt.compare parameter order

# Symptoms
<!-- IMMUTABLE after Phase 1 — only written during Phase 1 -->
- POST /api/auth/login returns 500
- error.message: "Cannot read property 'hash' of undefined"
- Reproduction: any username + password

# Hypotheses
<!-- Phase 2 writes, append-only afterward -->
## H1: User record missing passwordHash field
  - Prediction: console.log(user) shows no passwordHash
  - Falsification test: print user object
  - Status: ✅ Confirmed → but not root cause

## H2: bcrypt.compare parameter order reversed
  - Prediction: currently bcrypt.compare(hash, plaintext), should be bcrypt.compare(plaintext, hash)
  - Falsification test: swap parameters
  - Status: 🔍 Testing

# Evidence
<!-- Append-only — each entry with timestamp -->
- [10:32] H1 test: user object = { id: 1, name: "test", passwordHash: undefined }
  → User record exists but passwordHash is undefined
- [10:35] Trace: seed script uses `password` field instead of `passwordHash`
  → Database schema mismatch

# Eliminated
<!-- Append-only — records excluded hypotheses -->
- [10:33] H1 eliminated: passwordHash undefined is result, not cause

# Resolution
<!-- Fill when root cause found -->
(to be filled)
```

### Write Rules Summary

| Section | Write Rule | Rationale |
|---------|-----------|-----------|
| Current Focus | **Overwrite** | Always reflects current activity |
| Symptoms | **Immutable** after Phase 1 | Prevents post-hoc rationalization |
| Hypotheses | **Append-only** | Never delete — may revisit |
| Evidence | **Append-only** with timestamps | Audit trail |
| Eliminated | **Append-only** | Avoid re-testing |
| Resolution | **Fill once** when root cause found | Closure |

---

## 4. Debug Knowledge Base

Maintain `.forge/debug/knowledge-base.md` (append-only):

```markdown
# Debug Knowledge Base
<!-- Append-only — never delete existing entries -->

## [2026-06-05] bcrypt Parameter Order
Keywords: bcrypt, compare, auth, login, parameter order
Pattern: bcrypt.compare(plaintext, hash) not bcrypt.compare(hash, plaintext)
Applicable: any code using bcrypt for authentication

## [2026-06-05] Database Field Name Mismatch
Keywords: seed, schema, field name, undefined
Pattern: seed script and model schema using different field names causes read operations to return undefined
Applicable: any database seed + ORM combination
```

**Matching**: At debug start, scan knowledge base, rank by keyword overlap, display most relevant historical experience.

**Maintenance**: After debug resolution, prompt to add new pattern. Semi-automatic: suggest entry, user confirms.

---

## 5. Research vs Reasoning Decision Tree

During debugging, choose investigation method based on problem type:

```
if problem is framework/API usage issue:
  → Search external docs (WebSearch)
elif problem is project code logic:
  → Trace code (Read, Grep)
elif problem is environment/config:
  → Check environment (Bash, env vars)
elif 3 internal trace attempts with no progress:
  → Switch to external search (WebSearch)
```

---

## 6. Red Flag Checklist

| Red Flag | Action |
|---------|--------|
| Fix introduces two new problems | Back to Phase 1 |
| Same hypothesis fails 3 times consecutively | Stop fixing, question architecture |
| Fix code getting increasingly complex | Consider higher-level architecture change |
| Cannot reproduce reliably | Add logging, collect data (likely race condition) |
| Error message contradicts logic | Re-trace data flow from scratch |
| Tests pass but behavior abnormal | Add more test scenarios |
| All hypotheses exhausted | Back to Phase 2, generate fresh hypotheses |
| Fixing symptoms, not root cause | Stop. Re-trace to root cause. Bug will recur otherwise. |

---

## 7. Execution Flow

1. **Pre-flight**: Branch gate check
2. **Phase 1**: Symptom gathering (no fix proposals) → write Symptoms (immutable) → **gate**: no tight red-capable loop, no Phase 2
3. **Phase 2**: Generate ≥2 falsifiable hypotheses → write Hypotheses (append-only)
4. **Phase 3**: Test one hypothesis at a time → write Evidence/Eliminated (append-only)
5. **Phase 4**: Fill Structured Reasoning Checkpoint → apply minimal fix (TDD optional)
6. **Phase 5**: Full test suite → confirm no reproduction → confirm no regression → status: "resolved"

## Common Rationalizations

| Rationalization | Rebuttal |
|----------------|----------|
| "I know where the bug is, let me just fix it" | You may be right 70% of the time. The other 30% wastes hours. Reproduce first. |
| "This failing test is probably a test bug" | Verify this hypothesis. If the test is wrong, fix the test. Don't skip it. |
| "Works on my machine" | Different environment. Check CI, config, dependency versions. |
| "Let me try this quick fix" | No. Phase 1 first. Quick fixes create harder-to-find bugs. |
| "The error message is obvious" | Obvious symptoms can have non-obvious causes. Verify with evidence. |

---

## 8. Edge Cases

- **Cannot reproduce** → Likely race condition / environment issue. Add logging, check concurrency.
- **Fix proposed in Phase 1** → Prohibited. Always.
- **All hypotheses fail** → Back to Phase 2 with expanded scope. Consider architecture-level hypotheses.
- **No `.forge/` directory** → Run `/forge init` first.
- **Context overflow** → Debug reads too many files, context fills up. Use subagent for exploration, return only findings.
- **symptoms_prefilled mode** → Skip Phase 1, go directly to Phase 2. Symptoms from Three-Strike context are pre-filled. The Phase 1→2 red-capable gate is **satisfied**: 3 consecutive same-direction failures constitute a red-capable signal (the loop is the failing build/test run itself).

---

## 9. Integration with Three-Strike

Three-Strike (§2.4 of CLAUDE.md) is the **trigger mechanism**; Scientific Method is the **methodology**. Relationship:

- Three-Strike fires after 3 consecutive same-direction failures → enters `/forge debug` with `symptoms_prefilled` mode (the 3 failures satisfy the Phase 1→2 red-capable gate, so Phase 1 symptom gathering is skipped)
- Within debug, same hypothesis tested 3 times → stops that direction (inner Three-Strike)
- Inner Three-Strike fires → question architecture, generate fundamentally different hypotheses
- Both levels share the same `.forge/debug/{slug}.md` session file

---

## 10. Examples

```
$ /forge debug
━━━ Phase 1 ━━━  TypeError at export.ts:42 · Reproduction: 100%
                   Symptoms: null passed to filter, db.query returns undefined
━━━ Phase 2 ━━━  H1: db.query(null)→undefined (predict: null check fails)
                   H2: upstream passes null for empty result (predict: caller sends null)
                   Knowledge match: null-parameter-handling.md (0.7 overlap)
━━━ Phase 3 ━━━  Testing H1: null check → ✅ Confirmed. db.query(null) returns undefined.
━━━ Phase 4 ━━━  Checkpoint filled. Fix: query-layer null filter
                   🔴 RED (repro test) ✅ → 🟢 GREEN (fix) ✅
━━━ Phase 5 ━━━  Full suite 42/42 ✅ · Symptom gone ✅ · No regression ✅
✅ Root cause: db.query unhandled null · Fix: unified null filtering at query layer
```

## Gotchas
- **Hypothesis fixation**: First hypothesis seems right → stop investigating alternatives → test hypothesis, don't assume
- **Symptom vs cause**: Fix symptom, not root cause → bug recurs in different form → trace to root cause before fixing
- **Three-strike loop**: Same hypothesis tested 3 times → confirms approach is wrong → question architecture, not implementation
- **Context overflow**: Debug reads too many files → main context fills up → use subagent for exploration, return only findings
- **Immutable symptoms**: Never modify Symptoms section after Phase 1 → prevents post-hoc rationalization
- **Checkpoint bypass**: Skipping Structured Reasoning Checkpoint → violates Three-Strike → must fill before any fix
