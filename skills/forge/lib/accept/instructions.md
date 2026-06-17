---
description: "Use when /forge ship runs on a spec with acceptance_eval true, user runs /forge accept explicitly, or /forge ship --with-acceptance flag is provided"
updated: 2026-06-17
deliverable_exempt: true
dispatch_mode: fork
allowed_tools:
  - Read
  - Bash
  - Write
---

# /forge accept — Acceptance Scenario Eval

**Use when** you need to validate that user-facing acceptance scenarios (defined in spec) actually pass against the running system. This is *behavioral validation from the user's perspective* — running scenario scripts and recording pass/fail with evidence. Do not confuse with `/forge verify` (evidence-based three-state verdict) or `/forge ship` (merge + release).

> **Trigger**: `/forge accept` or `/forge ship --with-acceptance`
> **Responsibility**: Run acceptance scenarios from spec against real runtime
> **Output path**: `.forge/acceptance/<topic>/`

## 1. Overview

Parse spec scenarios (explicit Gherkin or derived from acceptance criteria), classify by type (API/UI/CLI/mixed), dispatch to appropriate runner, collect pass/fail verdicts with evidence. Integrated as optional ship gate.

## 2. Prerequisites

| # | Check | Block Condition | Route |
|---|-------|-----------------|-------|
| 1 | Spec exists | No locked spec in `.forge/specs/` | `/forge spec` |
| 2 | Scenarios found | No `## Scenarios` or `## Acceptance Criteria` section | warn + skip |

**Rejection Output**: `forge-accept precondition failed — name: spec evidence: no locked spec suggestion: /forge spec`

## 3. Workflow

### Step 1: Parse Scenarios

1. Read spec from `.forge/specs/<topic>/spec.md`
2. `parseScenariosFromSpec(content)` → combined explicit + derived scenarios
   - Before parsing, run `lintScenarios(specContent, filePath)` from `src/scenario-linter.ts` — malformed scenarios (error-severity) marked as `lint-failed` and skipped (not executed)
3. If no scenarios found → warn and exit with SKIP

### Step 2: Classify & Select

1. `classifyScenarioType()` for each scenario
2. `selectScenariosForRun(scenarios, options)` → ordered subset (default max 5)
3. Apply `--promote-derived` if specified

### Step 3: Execute Runners

1. For each selected scenario, `runScenario(scenario, ctx)`:
   - API → real curl execution (execDescriptor), HTTP code assertion; crash → INCONCLUSIVE
   - UI → **agent-browser** (Vercel CLI, snapshot+refs) drives the page per Given/When/Then;
     falls back through ui-harness tiers: project(playwright.config e2e) → agent-browser → playwright → cdp → INCONCLUSIVE.
     **Prerequisite**: user must install agent-browser (`which agent-browser`) and have dev server running.
     Credentials use `{{VAR}}` placeholders resolved from env (never in argv).
   - CLI → real bash execution (execDescriptor), stdout/stderr capture; crash → INCONCLUSIVE
   - Mixed → sequential API + UI (Phase 2, not yet implemented)
2. Collect `ScenarioArtifact` per scenario

### Three-State Verdict

- **PASS** ✅ — scenario's THEN satisfied.
- **FAIL** ❌ — THEN not satisfied; `blocksShip = true`.
- **INCONCLUSIVE** ⚠️ — environment unavailable (agent-browser not installed / dev server down / crash / timeout). Does NOT block ship, counted separately. Not a failure — the run could not verify.

### Step 4: Aggregate & Report

1. `aggregateVerdicts(artifacts)` → summary counts
2. `renderAcceptanceReport(result)` → Markdown
3. Write to `.forge/acceptance/<topic>/report.md`

## 4. Deliverable

**Category**: decision

- **Scenarios Run**: N
- **Verdicts**: PASS X / FAIL Y / SKIP Z / WARN W
- **Blocks Ship**: YES/NO (per `acceptance_blocks_ship` frontmatter + FAIL count)
- **Report Path**: `.forge/acceptance/<topic>/report.md`
- **Evidence**: `.forge/acceptance/<topic>/<scenario-id>/`

## References

→ references/scenario-format.md
→ references/runners.md
→ references/boundary-with-test.md

## Gotchas
- **Flaky external service**: Acceptance test hits real API → intermittent 5xx → add retry with backoff, don't mark scenario failed on transient errors
- **Stale spec scenarios**: Spec was updated after test code written → test passes old scenarios, misses new ones → always re-read spec before acceptance run
- **Environment dependency**: Test assumes specific env vars → passes locally, fails in CI → document required env vars in spec
