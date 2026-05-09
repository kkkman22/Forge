---
name: forge-accept
description: "Execute spec Scenarios end-to-end against real runtime and produce pass/fail verdicts with evidence. Use when /forge ship runs on a spec with acceptance_eval true, when user runs /forge accept explicitly, or when /forge ship --with-acceptance flag is provided."
disable-model-invocation: true
deliverable_exempt: true
---

# /forge accept — Acceptance Scenario Eval

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
   - API → curl-based HTTP assertion
   - UI → cmux browser + axe-core (skip if Tier B unavailable)
   - CLI → bash execution with stdout/stderr capture
   - Mixed → sequential API + UI (Phase 2)
2. Collect `ScenarioArtifact` per scenario

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
