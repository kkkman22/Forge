# Contributing to Forge

Thanks for your interest in Forge! This guide covers setup, architecture, coding conventions, and PR requirements.

## Development Environment

```bash
# Clone
git clone https://github.com/anthropics/forge.git
cd forge

# Install (requires Node.js >= 20)
npm ci

# Verify
npm run check
```

**Toolchain**: Node.js >= 20, npm, Biome (lint + format), Vitest + fast-check (testing).

## Architecture Overview

Forge is a **pure-function codebase** — `src/` exports composable functions with no side effects. State lives in `.forge/` files on disk; modules read/write via explicit parameters.

```
src/               # Pure functions (no global state, no I/O in logic)
  *.ts             # Domain modules (scheduler, validator, builder, etc.)
  logger/          # Structured logging (only side-effect module)
skills/            # 16 SKILL.md files — AI behavior contracts
agents/            # 10 Agent role definitions (.md)
commands/          # Forge CLI command entry points
hooks/             # Claude Code hooks (pre-tool-use, post-prompt)
templates/         # File templates (CLAUDE.md, config.md, etc.)
scripts/           # Shell scripts (init, build-dist, install-dist)
test/              # Property-based tests (*.property.test.ts) + unit tests
```

### Data Flow

```
User → /forge <command> → Router → Skill Scheduler → Phase functions → .forge/ files
```

Each phase (plan, build, review, test, ship) reads from and writes to `.forge/` directory, providing natural session boundaries.

### Key Patterns

- **Pure functions**: All `src/` logic is deterministic. File I/O and network calls are in CLI adapters and effect-executor.
- **Contract tests**: `test/contract.test.ts` validates SKILL/agent file structure and cross-file consistency.
- **Property-based testing**: Business logic uses `fast-check` to verify invariants, not specific I/O pairs.

## Code Style

- **Language**: TypeScript, strict mode
- **Formatter/Linter**: Biome (`npm run lint:fix` to auto-fix)
- **Style**: 2-space indent, double quotes, 100-char line width
- **Exports**: Named exports only (no default exports)
- **Comments**: Minimal — explain WHY, not WHAT

```bash
npm run typecheck    # Type check
npm run lint         # Lint
npm run lint:fix     # Auto-fix lint issues
npm run test         # Run tests
npm run check        # All of the above (CI uses this)
```

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope): add new feature
fix(scope): fix a bug
docs(scope): documentation change
refactor(scope): code restructuring
test(scope): add or update tests
chore(scope): build, CI, tooling
```

**Scopes**: `scheduler`, `review`, `decide`, `build`, `skills`, `agents`, `cli`, `hooks`, `docs`

## Pull Request Workflow

1. Fork and create a feature branch: `git checkout -b feature/your-feature`
2. Make changes following TDD (write tests first for `src/` changes)
3. Ensure `npm run check` passes
4. If modifying `src/` logic, add property-based tests
5. If modifying agent/SKILL config, verify `contract.test.ts` passes
6. Submit PR to `main`

### PR Checklist

- [ ] `npm run check` passes
- [ ] New `src/` functions have property tests
- [ ] No changes to frozen files (`.forge/specs/*/spec.md`, `.forge/plans/*.md`) without explicit unlock
- [ ] Commit messages follow Conventional Commits

## Testing Requirements

| Test Type | When to Use | File Pattern |
|-----------|------------|--------------|
| **Property-based** | `src/` pure functions, business logic invariants | `*.property.test.ts` |
| **Unit** | Edge cases, specific I/O, error paths | `*.test.ts` |
| **Contract** | SKILL/agent file structure, cross-file consistency | `contract.test.ts` |

### Property-Based Testing

Use `fast-check` to verify invariants:

```typescript
import fc from "fast-check";
import { test, expect } from "vitest";

test("mergeSkillLists always prefers builtin", () => {
  fc.assert(
    fc.property(fc.array(manifestArb), fc.array(manifestArb), (builtin, external) => {
      const result = mergeSkillLists(builtin, external);
      const builtinNames = new Set(builtin.map((m) => m.name));
      for (const item of result) {
        if (builtinNames.has(item.name)) {
          expect(item).toEqual(builtin.find((b) => b.name === item.name));
        }
      }
    }),
  );
});
```

### Contract Tests

`test/contract.test.ts` validates:
- All `skills/*/SKILL.md` have valid YAML frontmatter
- All `agents/*.md` are synced with `.claude/agents/`
- Cross-references between files are consistent

## Security Model

### SDK Permission Bypass

`SDK_Agent_Adapter` uses `bypassPermissions` because Claude Agent SDK's interactive prompts are incompatible with Forge Loop's autonomous execution mode. Upper-layer defenses compensate:

1. **PreToolUse Hooks** — Intercept Write/Edit/Bash before execution
2. **Frozen Zone Protection** — Block writes to locked specs/plans/config
3. **State Gate Checks** — Validate phase transitions
4. **Inner-Layer Commit Guard** — Scan staged `.forge/` files before commit

> **Warning**: Disabling any defense layer removes all access control. Changes to `hooks/hooks.json` or `check-frozen.ts`/`state.ts` require strict review.

## Questions?

Open an [Issue](https://github.com/anthropics/forge/issues) for discussion.

## SKILL-Function Interface Check

When adding or modifying exported functions in `src/*.ts`:

1. [ ] Is the function referenced by a SKILL document?
2. [ ] Does the reference include full call path (function name, parameter source, return value usage)?
3. [ ] If it's a Forge Loop internal function (called by SdkDriver/EffectExecutor), mark as "non-SKILL call"

**Exception**: Forge Loop modules (`orchestrator`, `effect-executor`, `sdk-driver`, `sdk-agent-adapter`, `run-manager`, `failure-handler`, `worktree-manager`, etc.) are called programmatically and don't need SKILL references.
