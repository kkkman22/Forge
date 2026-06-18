# Contributing to Forge

Thanks for your interest in Forge! This guide covers setup, architecture, coding conventions, and PR requirements.

## Development Environment

```bash
# Clone
git clone https://github.com/kkkman22/Forge.git
cd Forge

# Install (requires Node.js >= 20)
npm ci

# Verify
npm run check
```

**Toolchain**: Node.js >= 20, npm, Biome 2.4 (lint + format), Vitest 4.1 + fast-check 4.7 (testing), TypeScript 5.9 (strict).

## Architecture Overview

Forge is a **pure-function codebase** — `src/` exports composable functions with no side effects. State lives in `.forge/` files on disk; modules read/write via explicit parameters. ADR-0004 之后所有子命令由统一 skill `forge` 内部分发。

```
src/               # Pure functions (305 TypeScript modules, no global state, no I/O in logic)
  *.ts             # Domain modules (scheduler, validator, builder, etc.)
  docs-governance/ # 5-layer docs governance system
  logger/          # Structured logging (only side-effect module)
commands/          # /forge unified entry (forge.md → routes to skills/forge/SKILL.md)
skills/            # Unified `forge` SKILL (skills/forge/SKILL.md) — 37 subcommands dispatched internally
  forge/lib/       # Sub-skill libraries (decide-teams, review, triage, accept, etc.)
agents/            # 13 Agent role definitions (.md): product/architect/security/designer/critic/spec-check/quality-check/...
.claude/agents/    # 22 plugin agents incl. forge-build/forge-plan/forge-review/forge-ship/forge-decide-* subcommand agents
hooks/             # Claude Code hooks (pre-tool-use, post-prompt, phase transition guard)
templates/         # File templates (CLAUDE.md, config.md, charter, sandbox, ADR, etc.)
scripts/           # Shell + JS scripts (init, build-dist, install-dist, docs governance)
test/              # Property-based tests (*.property.test.ts) + unit tests (~679 files)
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

### Lint Strictness Layering（源自 evolved-rules R9）

Biome 规则按 `src/` 与 `test/` 分层严格度。这是项目的工程约定，新增 lint 规则时按此原则决定是否 override：

| 范围 | 严格度 | 规则示例 |
|------|--------|---------|
| `src/` | **严格** | 禁止 `!` non-null assertion、禁止 `console`、禁止显式 `any`、要求 import 排序与 format 合规 |
| `test/` | **宽松** | 允许 `!`（测试 fixture 结构由 setUp 保证，等价于隐式 `expect(...).toBeDefined()`）、允许 `console.log`（调试辅助）；`any` 仍需 case-by-case 提供精确类型 |

**配置位置**：`biome.json` 的 `overrides[].includes: ["test/**"]` 段声明 `test/` 豁免项。

**反模式**：

- ❌ 在测试文件里撒满 `// biome-ignore lint/style/noNonNullAssertion: ...` 注释 — 这增加噪声，不是"合规"
- ❌ 把测试里的 `!` 用法反向迁移到源码 — 这降低类型安全

**正确姿态**：分层不是妥协，是场景化的语义分级。新增 override 必须在 PR 的 CHANGELOG 或 ADR 中记录决策理由。

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

## dist/ Sync Requirement

Forge's `dist/` directory is **tracked in git** because:

- `hooks/hooks.json` references `dist/src/check-frozen.js` and `dist/src/check-sandbox.js` at runtime
- `scripts/build-dist.sh` reads `dist/src/` to create distribution bundles
- `package.json` exports and bin entries point to `dist/src/`

This creates a requirement: **every PR that modifies `src/**/*.ts` must include the corresponding `dist/src/**` changes in the same PR.**

### How to fix a "dist-sync failed" CI error

1. Run `npm run dist:resync` (or `npm run dist:resync -- --yes` for auto-stage)
2. Commit the staged dist/ changes: `git commit -m "chore(dist): resync"`
3. Push again

### Why this is enforced

Without enforcement, dist/ drifts silently. The 2026-05-10 audit found ~300 untracked dist/ files accumulated across Sprint 1-3 — runtime was using old compiled logic while src/ had moved on. See commit `078e482` for the one-time resync that eliminated the backlog.

### Emergency bypass

For rare cases where src/ and dist/ MUST be in separate commits (e.g., hotfix where dist/ regen takes too long and src/ fix is urgent), include `[dist-sync-skip]` in the commit message. Use sparingly — the next PR will restore full sync.

## Pre-push Verification (Opt-in)

Forge provides a `pre-push` git hook that runs `npm run check` before allowing pushes to `main`. This catches CI failures locally before they reach GitHub.

### Setup (one-time)

```bash
git config core.hooksPath .githooks
```

### What it does

- **Only triggers on pushes to `main`** — feature branch pushes pass through without delay
- Runs `npm run check` (typecheck + lint + tests + all script validations)
- Blocks the push if the check fails

### Emergency bypass

```bash
git push --no-verify
```

### Custom guard branch

Set `FORGE_PRE_PUSH_BRANCH` to guard a different branch (e.g., `release/*`):

```bash
FORGE_PRE_PUSH_BRANCH=refs/heads/release/v2 git push
```

## Security Model

### SDK Permission Bypass

`SDK_Agent_Adapter` uses `bypassPermissions` because Claude Agent SDK's interactive prompts are incompatible with Forge Loop's autonomous execution mode. Upper-layer defenses compensate:

1. **PreToolUse Hooks** — Intercept Write/Edit/Bash before execution
2. **Frozen Zone Protection** — Block writes to locked specs/plans/config
3. **State Gate Checks** — Validate phase transitions
4. **Inner-Layer Commit Guard** — Scan staged `.forge/` files before commit

> **Warning**: Disabling any defense layer removes all access control. Changes to `hooks/hooks.json` or `check-frozen.ts`/`state.ts` require strict review.

## 安全贡献指南 / Secure Contribution Guide

### 密钥与 PII

- **禁止** 在日志、错误消息、测试 fixtures 中回显真实密钥、token、API key、SSH 私钥。
- **禁止** commit `.env` / `credentials.json` / `.ssh/*` / `*.pem` / `*.key` 等文件。CI 不会为这些文件开白名单。
- 示例数据使用占位符：`sk-placeholder-xxx`、`ghp_placeholder_xxx`、`user@example.com`。
- PII（Personally Identifiable Information）：个人姓名、邮箱、电话、身份证号等仅在必要时使用，优先用 `@user-a` 这类占位符替代。

### Shell 命令构造

- **禁止** 用字符串拼接 / 模板字面量构造含用户输入的 shell 命令。Shell injection 是 Forge 的零容忍类别。
- **必须** 使用 `src/git-transaction.ts` 或等价的白名单 builder；如果需要新 shell 命令，先扩展该 builder 再使用。
- 所有涉及用户输入的 `execSync` / `spawn` 调用必须 code review 时显式指出，并在 PR 描述中列出输入来源和验证策略。
- Node.js 侧使用 `spawn` 优先于 `exec`；参数以 `string[]` 形式传入，避免依赖 shell 解析。

### 第三方依赖

引入新依赖前走这份检查清单：

- **命名检查**：是否有同名但替换了字符的 typosquatting 变体？（`lodash` vs `lod.ash`、`chalk` vs `ch-alk`）
- **作者可信度**：作者账号注册时间、是否有多个活跃包。偏好 `@types/*`、`@anthropic-ai/*`、`biome` 等已知维护者。
- **license 兼容**：Forge 使用 MIT。禁止引入 GPL / AGPL / SSPL 等 copyleft 依赖。允许 Apache-2.0、BSD-*、ISC、MIT。
- **维护状态**：最近一次 release 是否 < 18 个月？GitHub 上 issue 响应是否活跃？
- **版本锁定**：用精确版本号（`"zod": "3.23.8"`），**禁止** 开放范围（`"zod": "^3"`）。

### 敏感信息过滤

- 错误消息、日志输出**必须** 先过 `src/prompt-defense.ts` 的 PII 检测（到位后），或手动脱敏（保留字段类型、隐藏值）。
- Stack trace 中的文件路径可以保留；但不要在错误消息中回显用户输入的原始内容。
- 测试用的 fixture 文件不得包含真实环境的配置、凭证或客户数据。

### 需要 ADR 的高敏感文件

以下文件的**任何改动**必须通过 `/forge decide` 产生 ADR，记录变更理由与风险评估：

- `hooks/hooks.json` — PreToolUse Hook 入口
- `scripts/check-frozen.sh` + `src/check-frozen.ts` — 冻结区阻断逻辑
- `src/prompt-defense-patterns.ts` — 输入威胁模式库（frozen zone 保护）
- `src/git-transaction.ts` — Shell 命令白名单 builder
- `src/state.ts` 中的 `getProtectionZone()` — 保护区路径分类
- `.forge/config.md` 中的"状态文件保护分区"章节

PR 描述中必须引用对应 ADR 的编号（`ADR-NNNN`），否则 review 会要求补交。

### Responsible Disclosure

发现的安全漏洞请通过 [SECURITY.md](SECURITY.md) 中列出的私有渠道报告，不要开公开 issue。响应 SLA 和 CVE 记录格式详见该文档。

## Questions?

Open an [Issue](https://github.com/kkkman22/Forge/issues) for discussion.

## Testing Plugin Changes Locally

Test local changes via `--plugin-dir` without publishing to marketplace:

```bash
# Validate manifest
claude plugin validate .

# Test in a single session
claude --plugin-dir . -p "/forge status"

# Or install from local path
claude plugin install . --plugin-dir .
```

After modifying skills/agents/commands, re-run `node scripts/gen-plugin-commands.mjs` to regenerate command wrappers.

## Creating a New Skill

1. Copy `templates/SKILL-TEMPLATE.md` to `skills/forge-<name>/SKILL.md`
2. Follow the [SKILL.md Style Guide](.forge/knowledge/skill-style-guide.md) for frontmatter, section structure, and description format
3. Use the quick checklist at the end of the style guide as your PR self-check
4. Run `node scripts/validate-skill-descriptions.mjs --strict` and `node scripts/validate-skill-skeleton.mjs` to verify compliance

## SKILL-Function Interface Check

When adding or modifying exported functions in `src/*.ts`:

1. [ ] Is the function referenced by a SKILL document?
2. [ ] Does the reference include full call path (function name, parameter source, return value usage)?
3. [ ] If it's a Forge Loop internal function (called by SdkDriver/EffectExecutor), mark as "non-SKILL call"

**Exception**: Forge Loop modules (`orchestrator`, `effect-executor`, `sdk-driver`, `sdk-agent-adapter`, `run-manager`, `failure-handler`, `worktree-manager`, etc.) are called programmatically and don't need SKILL references.
