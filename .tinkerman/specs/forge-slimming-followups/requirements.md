---
status: completed
feature: forge-slimming-followups
layout: requirements
created: 2026-05-14
tier: standard
---
# Requirements Document — forge-slimming-followups

## Introduction

`forge-slimming-plan`（T1+T2+T3）已执行完毕，审核确认 24/25 条验收标准达成。本 spec 覆盖审核中发现的 4 个遗留缺口（不含 R14/R16 的 14 天度量窗口任务，那两项单独跟踪）。

分两组：
- **Should-fix**（影响用户体验）：迁移指南缺失 + 命令数量 "28" 漂移
- **Nice-to-have**（CI 健壮性）：TypeDoc 快照过期 + 三通道 smoke matrix

## Glossary

- **SST**：Single Source of Truth — `commands/forge.md` 子命令表导出的命令总数（当前 = 22）。
- **Native_Command**：Claude Code 官方 slash command（`/compact`、`/resume`、`/code-review` 等）。
- **Deprecation_Notice**：Forge 命令在 legacy 路径触发时向用户输出的一次性迁移提示。
- **Pack_Conditional_Skill**：仅在 pack 启用对应 feature_flag 时注册的 skill（如 `forge-mutate`）。
- **Command_Count_Declaration**：`plugin.json`、`marketplace.json`、`README.md` 等对外声明的命令总数。
- **Delegation_Adapter**：T2 命令委托模式，检测 Native_Command 可用性并选择 standard/legacy 路径。

---

# Should-fix（用户体验类）

### Requirement 1: 创建 `docs/slimming-migration.md` 迁移指南

**User Story:** As a Forge user seeing a Deprecation_Notice, I want a migration guide I can follow to understand what changed and how to adapt, so that I am not confused by the notice.

#### Acceptance Criteria

1. THE task SHALL create `docs/slimming-migration.md` covering each delegated command (`/forge recap`, `/forge resume`, `/forge abort`, `/forge learn`, `/forge review`)。
2. FOR EACH delegated command, THE guide SHALL include: (a) what changed, (b) which Native_Command is delegated to, (c) minimum recommended Claude Code version（引用 `skills/shared/native-command-matrix.md`）, (d) fallback behavior on older versions, (e) how to inspect Deprecation_Notice lock files。
3. THE guide SHALL include a section on Pack_Conditional_Skill registration explaining why `forge-mutate` may not appear in the command list and how to enable it via a pack。
4. WHEN the guide is created, THE Deprecation_Notice text in each affected SKILL.md and `references/delegation-adapter.md` SHALL be updated to include the relative path `docs/slimming-migration.md`。
5. THE guide path SHALL work offline（relative within repo, not an external URL）。

### Requirement 2: 修复命令数量 "28" 漂移

**User Story:** As a user reading Forge documentation, I want all command count claims to match the SST (22), so that I am not misled by stale numbers.

#### Acceptance Criteria

1. THE task SHALL fix the following four locations that still claim "28":
   - `.claude-plugin/marketplace.json` plugins[0].description
   - `ROADMAP.md` line referencing "28 个 slash command 自动生成"
   - `CHANGELOG.md` line referencing "28 个 slash command wrappers"
   - `.tinkerman/decisions/2026-05-12-plugin-distribution.md` line referencing "28 slash command wrappers"
2. FOR historical decision files (`.tinkerman/decisions/`), THE task SHALL append a parenthetical note "(historical: count at time of writing was 28; current SST={FORGE_COMMAND_COUNT})" rather than silently changing the number。
3. FOR non-historical files (`marketplace.json`, `ROADMAP.md`, `CHANGELOG.md`), THE task SHALL replace "28" with the current SST value or the `{FORGE_COMMAND_COUNT}` placeholder。
4. THE task SHALL extend `scripts/gen-plugin-commands.mjs --verify-count` to scan: marketplace.json plugins[0].description, CHANGELOG.md, and `.tinkerman/decisions/*.md`。
5. WHEN the extended verifier runs, IF any scanned location contains a bare numeric command count that differs from SST, THEN the verifier SHALL exit non-zero and report the drift location。
6. THE CI `plugin-validate` job SHALL invoke the extended `--verify-count` so that future drift is caught automatically。

---

# Nice-to-have（CI 健壮性类）

### Requirement 3: 重新生成 TypeDoc 快照 + CI 防漂移

**User Story:** As a contributor reading `docs/api/`, I want the generated documentation to reflect the current source, so that stale ⏳ markers don't confuse me.

#### Acceptance Criteria

1. THE task SHALL run `npm run docs` to regenerate `docs/api/` from current source（including the corrected ROADMAP.md without ⏳ markers）。
2. WHEN regeneration completes, THE file `docs/api/media/ROADMAP.md` SHALL NOT contain any ⏳ character。
3. THE task SHALL add a CI step (in existing `ci.yml` or new job) that runs `npm run docs` and then asserts `git diff --stat docs/api/` is empty; non-empty diff SHALL fail the job。
4. IF the team decides `docs/api/` should NOT be committed (pure generated artifact), THEN THE task SHALL add `docs/api/` to `.gitignore` and remove it from the repo, documenting the "generate on demand" approach in `CONTRIBUTING.md`。

### Requirement 4: 三通道 smoke matrix CI workflow

**User Story:** As a maintainer, I want a single CI matrix that exercises all three distribution channels (clone / dist / plugin) × pack activation (none / pms), so that regressions in any channel are caught before merge.

#### Acceptance Criteria

1. THE task SHALL create `.github/workflows/smoke-channels.yml` (or add a matrix job to `ci.yml`) with matrix dimensions: `channel ∈ {clone, dist, plugin}` × `pack ∈ {none, pms}`。
2. FOR EACH matrix cell, THE smoke test SHALL: (a) install Forge via the corresponding channel, (b) optionally activate pms pack, (c) verify `/forge status` exits 0, (d) verify `forge-mutate` is NOT in command listing when pack=none and IS present when pack=pms, (e) exercise the Delegation_Adapter version-detection path without requiring Native_Command success。
3. THE workflow SHALL run on `push` to `main` and on `pull_request`。
4. WHEN a matrix cell fails, THE error message SHALL include the channel + pack combination identifier。
5. THE workflow SHALL NOT introduce any new runtime dependency; it MAY use existing CI tooling (actions/checkout, actions/setup-node, Claude Code CLI install step from existing `plugin-validate` job)。

---

# Cross-Cutting Requirements

### Requirement 5: 无新运行时依赖

1. THE changes SHALL NOT add any entry under `package.json` `dependencies`。
2. `devDependencies` additions are allowed only with commit-message justification。

### Requirement 6: Frozen_Zone / Spec_Lock 不变

1. THE changes SHALL NOT modify Frozen_Zone 分级定义 or hooks 硬阻断行为。
2. THE changes SHALL NOT modify Spec_Lock 语义。

### Requirement 7: PBT green

1. THE changes SHALL keep all existing fast-check property tests green; `npm run test` SHALL pass。

### Requirement 8: 向后兼容

1. THE changes SHALL NOT break any existing `/forge` invocation syntax。
2. THE migration guide SHALL be additive documentation only — no behavioral change to commands。

---

# Out of Scope

- R14 forge-maintenance-evaluation report（等 14 天度量数据）
- R16 forge-grill / forge-zoom-out usage report（等 14 天度量数据）
- Forge Loop 核心引擎 `src/` 下任何修改
- Frozen_Zone / FrozenZoneViolation 语义变更
- 新增运行时依赖
