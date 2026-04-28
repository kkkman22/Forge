# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Forge is a unified AI coding workflow framework with two main components:
1. **`/forge` commands** — 13 interactive SKILL.md files loaded on-demand in Claude Code sessions (skills, agents, teams, hooks, templates)
2. **`forge-loop` CLI** — An autonomous loop execution engine built on the Claude Agent SDK, run from a system terminal

## Commands

```bash
# Full CI check (typecheck + lint + test + README metrics)
npm run check

# Individual checks
npm run typecheck          # TypeScript strict mode
npm run lint               # Biome lint (src/ + test/)
npm run lint:fix           # Auto-fix lint issues
npm run test               # Vitest (all tests)
npm run test:coverage      # Vitest with coverage (≥80% lines/functions)
npm run test:watch         # Watch mode

# Run a single test file
npx vitest run test/orchestrator.property.test.ts

# Build dist bundle (skills + agents + templates for distribution)
bash scripts/build-dist.sh

# Compile TypeScript (for forge-loop CLI)
npx tsc
```

## Architecture

### Core Design Principle: Pure Functions + Effect Separation

`src/` is split into two categories:
- **Pure function modules** (orchestrator, router, failure-handler, git-transaction, context-accumulator, agent-output, plan, spec, state, etc.) — no side effects, no I/O. These use a pattern where functions accept state and return new state + effect descriptions, without executing them.
- **Runtime modules** (sdk-driver, sdk-agent-adapter, effect-executor, run-manager, forge-loop-cli) — orchestrate I/O by executing the effects described by pure functions.

The Orchestrator (`src/orchestrator.ts`) is a pure state machine: `idle → running → waiting → aborted/stopped`. It emits `OrchestratorEffect` descriptions that the SdkDriver executes.

### Loop Execution Pipeline

```
forge-loop CLI → SdkDriver → Orchestrator (state transitions)
                           → EffectExecutor (git commit/rollback/backoff)
                           → SdkAgentAdapter (Claude Agent SDK)
                           → RunManager (lifecycle, branches, worktrees)
                           → ContextAccumulator (cross-iteration notes)
                           → FailureHandler (exponential backoff + circuit breaker)
```

### Three-Dimensional Router

`src/router.ts` classifies tasks along three dimensions:
- **Tier** (light/standard/full) → which commands to run
- **TaskType** (frontend/backend/fullstack/data/infra/docs) → how commands behave
- **ProjectPhase** (greenfield/iteration/refactor/bugfix) → what to emphasize

### Skill/Agent/Team Layer

- `skills/*/SKILL.md` — AI behavior specifications (loaded on-demand per command)
- `agents/*.md` — Subagent role definitions (explore, debugger, spec-check, quality-check, security-check, etc.)
- `teams/*/config.json` — Agent Team configurations (decide, review)
- `hooks/hooks.json` — PreToolUse hooks for frozen zone protection + context injection
- `commands/forge.md` — Forge command entry point
- `templates/` — File templates (config, status, CLAUDE.md)

### State Management

`.forge/` directory holds all runtime state. Files use Markdown + YAML frontmatter. Three protection zones:
- **Frozen** (specs locked, plans approved, config) — PreToolUse Hook blocks writes
- **Protected** (progress, reviews, knowledge) — append-only
- **Open** (status, decisions, findings, debug) — free to modify

## Tech Stack

- TypeScript 5.9 (strict mode), ES2022 target, ESNext modules
- Vitest 3.2 + fast-check 4.7 (property-based testing)
- Biome 2.4 (lint + format, no ESLint/Prettier)
- Runtime deps: `@anthropic-ai/claude-agent-sdk`, `commander`
- Node.js ≥ 20

## Testing Conventions

- All `src/` functions must have corresponding property tests (`test/*.property.test.ts`)
- Tests verify **invariants**, not specific input/output pairs
- Contract tests (`test/contract.test.ts`, `test/contract.*.test.ts`) validate cross-file consistency (hooks, skills, scripts)
- Coverage thresholds: ≥80% lines, ≥80% functions, ≥70% branches

## Code Style

- 2-space indent, double quotes, 100-char line width (enforced by Biome)
- Import organization enabled (Biome `organizeImports`)
- No comments explaining WHAT — only WHY when non-obvious
- YAML frontmatter in all state files and SKILL.md files

## Security Model

The SDK agent adapter bypasses SDK-level permission prompts (`bypassPermissions`) because Forge Loop runs unattended. Access control is enforced by upper layers:
1. PreToolUse Hook intercept (Write/Edit/Bash on `.forge/` frozen files)
2. Frozen zone protection (`src/check-frozen.ts` → `src/state.ts`)
3. State gate checks in build/ship orchestration
4. Inner-layer commit guard in `src/effect-executor.ts` (scans staged `.forge/` files before commit)

Any modification to hooks configuration or frozen zone logic requires careful review.

## 5. Self-Evolution Protocol

### 5.1 Evolved Rules

At session start, read `.forge/knowledge/evolved-rules.md` and treat its rules as project-specific error-prevention directives. These rules are distilled from accumulated project knowledge and represent patterns where Claude would make mistakes without explicit guidance.

### 5.2 Updatable Knowledge Categories

The following categories qualify as rule candidates:

| Category | Source | Threshold |
|----------|--------|-----------|
| Project-specific traps | known-failures.md | occurrence >= 3 |
| Repeated correction patterns | instincts.md | confidence >= 0.8 |
| Environment/tool quirks | skill-feedback.md | frequency >= 3 |
| Cross-session behavior corrections | session journals | same issue in 3+ sessions |
| Rule friction adjustments | metrics.md | 3+ session degradation trend |

### 5.3 Trigger Conditions

Rules are proposed only when knowledge entries meet the numeric thresholds above. `/forge learn` evaluates these thresholds during the rule distillation stage.

### 5.4 Correction Protocol

1. **Propose** — Present the rule with evidence from knowledge sources
2. **Declare** — State what specific error the rule prevents
3. **Approve** — User reviews and approves/rejects the proposal
4. **Log** — Record the change in `.forge/knowledge/rule-changelog.md`

### 5.5 Constraints

- **15-rule cap** — evolved-rules.md holds at most 15 rules. New rules require retiring low-value existing rules when at capacity.
- **Staleness policy** — Rules not triggered in the last 5 sessions are flagged for retirement review.
- **Guarded zone** — evolved-rules.md is in the Guarded protection zone: updatable only by `/forge learn` rule distillation, not deletable outside maintenance.
- **Sections 1–4 are immutable** — Owned by `forge init`. The self-evolution mechanism never modifies them.

### 5.6 Exclusions

The following are NOT valid rule candidates:
- Architecture descriptions inferable from code
- File path lists
- General best practices Claude already knows
- Raw knowledge data (belongs in knowledge files, not rules)
- Standards enforced by existing tools (e.g., Biome code style)
